/**
 * KeepEat — shared axios client.
 *
 * Behavior:
 *   - Auto-attaches `Authorization: Bearer <accessToken>` when present.
 *   - On 401, transparently refreshes via /api/users/refresh and retries
 *     the original request once. Concurrent 401s share a single refresh.
 *   - On refresh failure, clears tokens and emits an "auth:logout" event
 *     for screens (e.g. _layout.tsx) to subscribe to and route to /login.
 *
 * Usage:
 *   import { api, authEvents } from "@/services/api";
 *   const { data } = await api.get<Recipe[]>("/api/recipes");
 *
 *   // Wire global logout routing once, e.g. in app/_layout.tsx:
 *   //   useEffect(() => authEvents.onLogout(() => router.replace("/login")), []);
 */

import { API_BASE_URL, API_TIMEOUT_MS, AUTH_ENDPOINTS } from "@/constants/config";
import { tokenStorage } from "@/services/tokenStorage";
import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
  isAxiosError,
} from "axios";

// ─── Error message helper ────────────────────────────────────────────────────

/**
 * Extracts a user-facing message from an axios error.
 * Prefers `error.response.data.message` (backend's localized text), falls back
 * to the caller-supplied default. Only the `message` field is consulted — we
 * never echo arbitrary fields from the server payload back to the user.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const msg = (error.response?.data as { message?: unknown } | undefined)
      ?.message;
    if (typeof msg === "string" && msg.trim().length > 0) return msg;
  }
  return fallback;
}

// ─── Auth event bus ───────────────────────────────────────────────────────────
// Avoid coupling the service layer to expo-router. Screens subscribe.

type LogoutListener = () => void;
const logoutListeners = new Set<LogoutListener>();

export const authEvents = {
  onLogout(listener: LogoutListener): () => void {
    logoutListeners.add(listener);
    return () => logoutListeners.delete(listener);
  },
  emitLogout(): void {
    logoutListeners.forEach((l) => l());
  },
};

// ─── Dev logging helpers ─────────────────────────────────────────────────────
// Kept fully separate from interceptor business logic. Every call is gated on
// `__DEV__`, so production builds drop these to dead code.

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newPassword",
  "currentPassword",
]);

function maskBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  // FormData (multipart uploads) — don't dump binary parts to the console,
  // and don't traverse the internal _parts shape across RN versions.
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return "[FormData]";
  }
  if (Array.isArray(body)) return body.map(maskBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE_BODY_KEYS.has(k) ? "***" : maskBody(v);
  }
  return out;
}

function parseBody(data: unknown): unknown {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
}

function pathOf(
  config: { url?: string; baseURL?: string } | undefined,
): string {
  if (!config?.url) return "(no-url)";
  if (config.baseURL && config.url.startsWith(config.baseURL)) {
    return config.url.slice(config.baseURL.length) || "/";
  }
  return config.url;
}

function logRequest(config: InternalAxiosRequestConfig): void {
  if (!__DEV__) return;
  const method = (config.method ?? "GET").toUpperCase();
  const path = pathOf(config);
  const isRetry = (config as RetriableConfig)._retry ? " (retry)" : "";
  const body =
    config.data !== undefined ? maskBody(parseBody(config.data)) : undefined;
  if (body !== undefined) {
    console.log(`[API REQ] ${method} ${path}${isRetry}`, body);
  } else {
    console.log(`[API REQ] ${method} ${path}${isRetry}`);
  }
}

function logResponse(response: AxiosResponse): void {
  if (!__DEV__) return;
  const path = pathOf(response.config);
  console.log(`[API RES] ${response.status} ${path}`, parseBody(response.data));
}

function logError(error: AxiosError): void {
  if (!__DEV__) return;
  const path = pathOf(error.config);
  const method = (error.config?.method ?? "GET").toUpperCase();
  if (error.response) {
    // Server replied with a status (4xx/5xx) — surface its body verbatim so
    // backend error envelopes like { code, message, status } are visible.
    console.log(
      `[API ERR] ${error.response.status} ${method} ${path}`,
      parseBody(error.response.data),
    );
  } else {
    // No response reached us. The body the user sees in Swagger isn't here
    // because the request never completed end-to-end. Dump transport-level
    // hints (axios error code, full URL, HTTP message) so we can tell ATS/
    // cleartext blocks apart from timeouts and DNS failures.
    const fullUrl = error.config?.baseURL
      ? `${error.config.baseURL}${error.config?.url ?? ""}`
      : (error.config?.url ?? "?");
    console.log(`[API ERR] NETWORK ${method} ${path}`, {
      code: error.code ?? "?",
      message: error.message,
      url: fullUrl,
    });
  }
}

// ─── Client ───────────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

// ─── Request interceptor: attach bearer token + log ──────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccessToken();
  if (token) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set("Authorization", `Bearer ${token}`);
    config.headers = headers;
  }
  // Multipart uploads: drop the inherited "application/json" content-type so
  // RN's XHR adapter (and axios's FormData detection) generates a proper
  // "multipart/form-data; boundary=..." header. Setting "multipart/form-data"
  // manually leaves the boundary blank and the server fails to parse.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = AxiosHeaders.from(config.headers);
    headers.delete("Content-Type");
    config.headers = headers;
  }
  logRequest(config);
  return config;
});

// ─── Response interceptor: log + 401 → refresh → retry ───────────────────────

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// Single in-flight refresh shared across concurrent 401s.
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  if (__DEV__) console.log("[API REFRESH] attempting refresh...");
  // Bare axios bypasses our interceptors, so log this leg manually.
  if (__DEV__) console.log(`[API REQ] POST ${AUTH_ENDPOINTS.refresh}`);

  try {
    const { data } = await axios.post<{
      accessToken: string;
      refreshToken: string;
    }>(
      `${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`,
      { refreshToken },
      {
        timeout: API_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
      },
    );

    if (__DEV__) console.log(`[API RES] 200 ${AUTH_ENDPOINTS.refresh}`);
    await tokenStorage.setTokens(data.accessToken, data.refreshToken);
    if (__DEV__) {
      console.log("[API REFRESH] success, retrying original request");
    }
    return data.accessToken;
  } catch (e) {
    if (__DEV__) {
      const status = (e as AxiosError).response?.status ?? "NETWORK";
      console.log(`[API REFRESH] failed (${status})`);
    }
    throw e;
  }
}

api.interceptors.response.use(
  (response) => {
    logResponse(response);
    return response;
  },
  async (error: AxiosError) => {
    logError(error);

    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    // Pass through anything that isn't a 401 we can retry.
    if (
      status !== 401 ||
      !original ||
      original._retry ||
      original.url?.includes(AUTH_ENDPOINTS.refresh) ||
      original.url?.includes(AUTH_ENDPOINTS.login)
    ) {
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      // De-dupe: first 401 starts the refresh, the rest await the same promise.
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newAccessToken = await refreshPromise;

      const headers = AxiosHeaders.from(original.headers);
      headers.set("Authorization", `Bearer ${newAccessToken}`);
      original.headers = headers;

      return api.request(original);
    } catch (refreshError) {
      await tokenStorage.clearTokens();
      authEvents.emitLogout();
      return Promise.reject(refreshError);
    }
  },
);

// ─── Convenience helpers (typed) ─────────────────────────────────────────────

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
};

export type UserInfo = {
  id: number | string;
  email: string;
  /**
   * 사용자가 가입 시 입력(LOCAL) 또는 백엔드가 소셜 프로필에서 가져온 표시명.
   * 구글 가입자 등 일부 경로에서 null로 올 가능성이 있어 string | null로 둔다.
   * 화면에서 사용 시 trim 후 폴백 (이메일 앞부분 등)을 거치도록.
   */
  nickname: string | null;
  role: string;
  /**
   * 가입/로그인 경로. 백엔드가 "LOCAL"(이메일) 또는 "google"(소셜)로 보냄.
   * 대소문자가 일관되지 않으므로 비교 시 항상 `.toLowerCase()` 적용.
   */
  provider: "LOCAL" | "google";
  /**
   * 서버가 기억하는 전체 푸시 알림 ON/OFF 상태. /me에서 받음.
   * 토글(PATCH /api/users/me/notification-setting) 성공 시 클라이언트도 같이
   * 갱신해 다음 화면 렌더에 일관성 유지.
   */
  isNotificationEnabled: boolean;
};

/**
 * Logs in and persists tokens. After this resolves, every subsequent
 * `api.*` call is automatically authenticated.
 */
export async function login(
  email: string,
  password: string,
  config?: AxiosRequestConfig,
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>(
    AUTH_ENDPOINTS.login,
    { email, password },
    config,
  );
  await tokenStorage.setTokens(data.accessToken, data.refreshToken);
  return data;
}

/**
 * Sends an email verification code to the given address. Server returns a
 * plain string message; we only care about success vs failure.
 *
 * Public endpoint — no auth header needed. The 401 interceptor still gates
 * by URL whitelist (refresh/login), so a 401 from this endpoint propagates
 * up as a regular error (which is the current backend behavior while the
 * public-route permission is being rolled out).
 */
export async function sendEmailCode(
  email: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.post(AUTH_ENDPOINTS.emailSend, { email }, config);
}

/**
 * Verifies an email code. Server returns a plain string message. Throws on
 * mismatch / expired / network failure — caller distinguishes via error.
 * Successful verification leaves the email marked as verified server-side;
 * the subsequent signup call doesn't need to carry the code again.
 */
export async function verifyEmailCode(
  email: string,
  code: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.post(AUTH_ENDPOINTS.emailVerify, { email, code }, config);
}

/**
 * Sends a temporary password to the user's email. Public endpoint (no auth
 * header needed) — same shape as `sendEmailCode`. The server returns a
 * plain-string message we surface as a toast on success. Backend should
 * answer consistently for both registered and unregistered emails to avoid
 * account enumeration; we leave that policy to the server and only relay
 * its response.
 */
export async function findPassword(
  email: string,
  config?: AxiosRequestConfig,
): Promise<string> {
  const { data } = await api.post<string>(
    "/api/users/password/find",
    { email },
    config,
  );
  return data;
}

/** Creates a new account. Server returns a plain string message; we don't surface it. */
export async function signUp(
  email: string,
  password: string,
  nickname: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.post(
    "/api/users/signup",
    { nickname, email, password },
    config,
  );
}

/** Fetches the current user. Used on app boot to validate stored tokens. */
export async function getMyInfo(config?: AxiosRequestConfig): Promise<UserInfo> {
  const { data } = await api.get<UserInfo>("/api/users/me", config);
  return data;
}

/**
 * Updates the current user's password. Meaningful for LOCAL provider only —
 * social accounts have a UUID placeholder server-side. Server returns a
 * plain-string message; callers distinguish success/failure via try/catch.
 * On a wrong current password the backend typically replies 400.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  config?: AxiosRequestConfig,
): Promise<string> {
  const { data } = await api.patch<string>(
    "/api/users/me/password",
    { currentPassword, newPassword },
    config,
  );
  return data;
}

/**
 * Toggles the global push-notification setting server-side. Backend tracks
 * the boolean state; the request body is empty (toggle semantics). Returns
 * the server's plain-string message.
 */
export async function updateNotificationSetting(
  config?: AxiosRequestConfig,
): Promise<string> {
  const { data } = await api.patch<string>(
    "/api/users/me/notification-setting",
    undefined,
    config,
  );
  return data;
}

/**
 * Permanently deletes the current account.
 *   LOCAL  → body `{ password }` is required so the server can re-verify.
 *   GOOGLE → no body (no client-held credential to confirm with).
 *
 * On success we mirror logout's cleanup: clear tokens, then emit the logout
 * event so AuthContext drops `user` and AuthGate routes to /login. On
 * failure (wrong password, network) the error propagates and tokens are
 * intentionally NOT cleared — the user can retry without re-logging in.
 *
 * The password field is already masked by the SENSITIVE_BODY_KEYS list in
 * this module's request logger.
 */
export async function deleteAccount(password?: string): Promise<void> {
  await api.delete("/api/users/me", {
    data: password != null ? { password } : undefined,
  });
  await tokenStorage.clearTokens();
  authEvents.emitLogout();
}

/**
 * Logs out: best-effort server call, then clears tokens and notifies subscribers.
 * Server failure is swallowed — local state must still be cleared.
 */
export async function logout(): Promise<void> {
  try {
    await api.post("/api/users/logout");
  } catch {
    // ignore — proceed with local cleanup
  }
  await tokenStorage.clearTokens();
  authEvents.emitLogout();
}

