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
  getMyInfo,
  login as apiLogin,
  logout as apiLogout,
  signUp as apiSignUp,
  type UserInfo,
} from "@/services/api";
import { tokenStorage } from "@/services/tokenStorage";

type AuthContextValue = {
  user: UserInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Boot: if a stored access token exists, validate it via /me.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await tokenStorage.getAccessToken();
        if (!token) {
          if (!cancelled) setUser(null);
          return;
        }
        const me = await getMyInfo();
        if (!cancelled) setUser(me);
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

  // 401-from-anywhere → forced logout. The interceptor already cleared tokens.
  useEffect(() => {
    const off = authEvents.onLogout(() => {
      if (mountedRef.current) setUser(null);
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiLogin(email, password);
    const me = await getMyInfo();
    setUser(me);
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    await apiSignUp(email, password);
    // Auto-login with the credentials we just used.
    await apiLogin(email, password);
    const me = await getMyInfo();
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      signUp,
      logout,
    }),
    [user, isLoading, login, signUp, logout],
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
