/**
 * KeepEat — auth state Context.
 *
 * Owns:
 *   - user, isAuthenticated, isLoading (boot-time token check)
 *   - login / signUp / logout actions
 *   - app-boot bootstrapping (validate stored token via /api/users/me)
 *   - subscription to authEvents.onLogout (401 → forced logout)
 *
 * Usage:
 *   const { user, isAuthenticated, login, logout } = useAuth();
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  authEvents,
  deleteAccount as apiDeleteAccount,
  getMyInfo,
  login as apiLogin,
  logout as apiLogout,
  logoutAll as apiLogoutAll,
  signUp as apiSignUp,
  type UserInfo,
} from "@/services/api";
import { tokenStorage } from "@/services/tokenStorage";
import {
  clearPushTokenRegistrationState,
  clearPushTokenOnServer,
  ensurePushTokenRegistered,
  getExpoPushTokenForLogout,
  subscribeToPushTokenChanges,
} from "@/services/pushNotifications";
import { DEV_BYPASS_AUTH } from "@/constants/config";
import { MOCK_JWT, MOCK_USER } from "@/mocks/devAuth";

// Dev-only escape hatch. The `__DEV__` guard is the second of two checks
// (the first is `DEV_BYPASS_AUTH` in config) — together they guarantee
// release builds can never resolve to `true`, regardless of config drift.
const BYPASS_ACTIVE = __DEV__ && DEV_BYPASS_AUTH;

type AuthContextValue = {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<void>;
  /**
   * OAuth code 교환 등에서 받은 accessToken/refreshToken으로 로그인 완료.
   * 일반 login()의 토큰 획득 이후 단계(setTokens → /me → setUser)와 동일.
   */
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  /**
   * 푸시 알림 토글 PATCH 성공 후 클라이언트 user의 해당 필드를 동기화.
   * 네트워크 없이 메모리만 갱신해 다음 화면 렌더에 stale 값이 들어가지 않게 함.
   */
  setUserNotificationEnabled: (enabled: boolean) => void;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  /**
   * 회원 탈퇴. LOCAL 계정은 password 재확인을 함께 보내야 하고, 소셜 계정은
   * 비워서 호출. 성공 시 logout과 동일하게 token clear + setUser(null)이
   * 적용돼 AuthGate가 /login으로 라우팅한다.
   */
  deleteAccount: (password?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const logoutInFlightRef = useRef<Promise<void> | null>(null);
  const logoutAllInFlightRef = useRef<Promise<void> | null>(null);
  const authenticatedUserId = user?.id;

  const clearLocalSession = useCallback(async (): Promise<void> => {
    await Promise.allSettled([
      tokenStorage.clearTokens(),
      clearPushTokenRegistrationState(),
    ]);
    if (mountedRef.current) setUser(null);
  }, []);

  // Boot: if a stored access token exists, validate it via /me.
  // Dev bypass short-circuits the network call and seeds a fake session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (BYPASS_ACTIVE) {
        console.warn("🚧 DEV BYPASS AUTH ACTIVE — using mock user, no API calls");
        await tokenStorage.setTokens(MOCK_JWT, MOCK_JWT);
        if (!cancelled) {
          setUser(MOCK_USER);
          setIsLoading(false);
        }
        return;
      }
      try {
        const token = await tokenStorage.getAccessToken();
        if (!token) {
          if (!cancelled) setUser(null);
          return;
        }
        const me = await getMyInfo();
        if (!cancelled) {
          setUser(me);
          // Auto-login path (boot recovery via stored token) doesn't go
          // through login()/loginWithTokens(), so push-token registration
          // wouldn't fire here without this call. Fire-and-forget — the
          // wrapper swallows its own errors so the boot flow can't be
          // blocked by push-server hiccups.
          void ensurePushTokenRegistered(me.id);
        }
      } catch {
        await tokenStorage.clearTokens();
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 401-from-anywhere → forced logout. The interceptor clears auth tokens;
  // this shared cleanup also drops local push-registration ownership.
  useEffect(() => {
    const off = authEvents.onLogout(() => {
      void clearLocalSession();
    });
    return () => {
      off();
    };
  }, [clearLocalSession]);

  useEffect(() => {
    const off = authEvents.onTokensRefreshed(() => {
      if (
        BYPASS_ACTIVE ||
        authenticatedUserId == null ||
        logoutInFlightRef.current != null ||
        logoutAllInFlightRef.current != null
      ) {
        return;
      }
      void ensurePushTokenRegistered(authenticatedUserId);
    });
    return () => {
      off();
    };
  }, [authenticatedUserId]);

  useEffect(() => {
    if (BYPASS_ACTIVE || authenticatedUserId == null) return;
    return subscribeToPushTokenChanges(authenticatedUserId);
  }, [authenticatedUserId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (BYPASS_ACTIVE) {
      await tokenStorage.setTokens(MOCK_JWT, MOCK_JWT);
      setUser(MOCK_USER);
      return;
    }
    await apiLogin(email, password);
    const me = await getMyInfo();
    setUser(me);
    // Best-effort push-token registration. Fire-and-forget so it can't
    // delay the login UI; failures are swallowed inside the wrapper.
    void ensurePushTokenRegistered(me.id);
  }, []);

  const loginWithTokens = useCallback(
    async (accessToken: string, refreshToken: string) => {
      if (BYPASS_ACTIVE) {
        await tokenStorage.setTokens(MOCK_JWT, MOCK_JWT);
        setUser(MOCK_USER);
        return;
      }
      // Tokens already obtained externally (e.g. Google OAuth code exchange).
      // Mirror the post-login flow of `login()`: persist → fetch /me → setUser.
      await tokenStorage.setTokens(accessToken, refreshToken);
      const me = await getMyInfo();
      setUser(me);
      void ensurePushTokenRegistered(me.id);
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string, nickname: string) => {
      if (BYPASS_ACTIVE) {
        await tokenStorage.setTokens(MOCK_JWT, MOCK_JWT);
        setUser(MOCK_USER);
        return;
      }
      await apiSignUp(email, password, nickname);
      // Auto-login with the credentials we just used.
      await apiLogin(email, password);
      const me = await getMyInfo();
      setUser(me);
      void ensurePushTokenRegistered(me.id);
    },
    [],
  );

  const setUserNotificationEnabled = useCallback((enabled: boolean) => {
    setUser((prev) => (prev ? { ...prev, isNotificationEnabled: enabled } : prev));
  }, []);

  const logout = useCallback((): Promise<void> => {
    const inFlight = logoutInFlightRef.current;
    if (inFlight) return inFlight;

    const operation = (async () => {
      if (!BYPASS_ACTIVE) {
        const [refreshResult, deviceResult] = await Promise.allSettled([
          tokenStorage.getRefreshToken(),
          getExpoPushTokenForLogout(),
        ]);
        const refreshToken =
          refreshResult.status === "fulfilled" &&
          typeof refreshResult.value === "string" &&
          refreshResult.value.trim().length > 0
            ? refreshResult.value
            : null;
        const deviceToken =
          deviceResult.status === "fulfilled" &&
          typeof deviceResult.value === "string" &&
          deviceResult.value.trim().length > 0
            ? deviceResult.value
            : null;

        try {
          await apiLogout({ refreshToken, deviceToken });
        } catch {
          // Server logout is best-effort; local logout must always complete.
        }
      }

      await clearLocalSession();
    })();

    const tracked = operation.finally(() => {
      if (logoutInFlightRef.current === tracked) {
        logoutInFlightRef.current = null;
      }
    });
    logoutInFlightRef.current = tracked;
    return tracked;
  }, [clearLocalSession]);

  const logoutAll = useCallback((): Promise<void> => {
    const inFlight = logoutAllInFlightRef.current;
    if (inFlight) return inFlight;

    const operation = (async () => {
      if (!BYPASS_ACTIVE) {
        await apiLogoutAll();
      }
      await clearLocalSession();
    })();

    const tracked = operation.finally(() => {
      if (logoutAllInFlightRef.current === tracked) {
        logoutAllInFlightRef.current = null;
      }
    });
    logoutAllInFlightRef.current = tracked;
    return tracked;
  }, [clearLocalSession]);

  const deleteAccount = useCallback(async (password?: string) => {
    if (BYPASS_ACTIVE) {
      await tokenStorage.clearTokens();
      setUser(null);
      return;
    }
    // Same ordering rule as logout — deregister the push token while the
    // session is still authenticated. Backend may also cascade-clean on
    // user deletion, but doing it explicitly avoids relying on that detail.
    await clearPushTokenOnServer();
    // api.deleteAccount throws on failure (e.g. wrong password) without
    // touching tokens — we let the caller surface a toast. On success it
    // already cleared tokens + emitted the logout event; setUser(null)
    // here is an explicit belt-and-suspenders against any timing gap.
    await apiDeleteAccount(password);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      signUp,
      loginWithTokens,
      setUserNotificationEnabled,
      logout,
      logoutAll,
      deleteAccount,
    }),
    [
      user,
      isLoading,
      login,
      signUp,
      loginWithTokens,
      setUserNotificationEnabled,
      logout,
      logoutAll,
      deleteAccount,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
