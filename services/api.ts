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
import {
  createAuthRefreshCoordinator,
  parseAuthTokens,
  type AuthTokens,
} from "@/services/authSession";
import { tokenStorage } from "@/services/tokenStorage";
import axios, {
  AxiosHeaders,
  isAxiosError,
  type AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
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

/**
 * 에러 응답의 HTTP status. 네트워크 실패/타임아웃처럼 응답 자체가 없으면 null.
 */
export function getErrorStatus(error: unknown): number | null {
  if (isAxiosError(error)) return error.response?.status ?? null;
  return null;
}

/**
 * 429 응답의 `Retry-After` 헤더(초). 헤더가 없거나 정수 초로 읽을 수 없으면
 * null — 이때 화면은 카운트다운 없이 서버 message만 보여준다. 프론트가 임의
 * 대기 시간을 지어내지 않기 위해, 값은 오직 서버 헤더에서만 온다.
 * (HTTP-date 형식은 현재 백엔드가 쓰지 않으므로 지원하지 않는다.)
 */
export function getRetryAfterSeconds(error: unknown): number | null {
  if (!isAxiosError(error)) return null;
  const raw: unknown = error.response?.headers?.["retry-after"];
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const parsed = Number.parseInt(String(raw), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * 백엔드 에러 body의 `code` 필드(`{ status, code, message }`).
 *
 * 토큰 만료/세션 폐기 401만 `{ error, message }` 포맷이라 `code`가 없다.
 * 따라서 "401 + code === null"은 호출부에서 세션이 사라진 상황으로 읽을 수 있다.
 * body가 없거나 object가 아니면(HTML 에러 페이지, 빈 응답 등) null.
 */
export function getErrorCode(error: unknown): string | null {
  if (!isAxiosError(error)) return null;
  const data: unknown = error.response?.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const code: unknown = (data as { code?: unknown }).code;
  return typeof code === "string" && code.trim().length > 0 ? code : null;
}

// ─── Auth event bus ───────────────────────────────────────────────────────────
// Avoid coupling the service layer to expo-router. Screens subscribe.

type LogoutListener = () => void;
type TokensRefreshedListener = () => void;
const logoutListeners = new Set<LogoutListener>();
const tokensRefreshedListeners = new Set<TokensRefreshedListener>();

export const authEvents = {
  onLogout(listener: LogoutListener): () => void {
    logoutListeners.add(listener);
    return () => logoutListeners.delete(listener);
  },
  emitLogout(): void {
    logoutListeners.forEach((l) => l());
  },
  onTokensRefreshed(listener: TokensRefreshedListener): () => void {
    tokensRefreshedListeners.add(listener);
    return () => tokensRefreshedListeners.delete(listener);
  },
  emitTokensRefreshed(): void {
    tokensRefreshedListeners.forEach((listener) => listener());
  },
};

// ─── Dev logging helpers ─────────────────────────────────────────────────────
// Kept fully separate from interceptor business logic. Every call is gated on
// `__DEV__`, so production builds drop these to dead code.

const SENSITIVE_BODY_KEYS = new Set([
  "password",
  "newpassword",
  "currentpassword",
  "accesstoken",
  "refreshtoken",
  "devicetoken",
  "resettoken",
  "token",
]);
const SENSITIVE_REQUEST_BODY_KEYS = new Set([
  ...SENSITIVE_BODY_KEYS,
  "code",
]);

function maskBody(
  body: unknown,
  sensitiveKeys = SENSITIVE_BODY_KEYS,
): unknown {
  if (body == null || typeof body !== "object") return body;
  // FormData (multipart uploads) — don't dump binary parts to the console,
  // and don't traverse the internal _parts shape across RN versions.
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return "[FormData]";
  }
  if (Array.isArray(body)) {
    return body.map((item) => maskBody(item, sensitiveKeys));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = sensitiveKeys.has(k.toLowerCase())
      ? "***"
      : maskBody(v, sensitiveKeys);
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
    config.data !== undefined
      ? maskBody(parseBody(config.data), SENSITIVE_REQUEST_BODY_KEYS)
      : undefined;
  if (body !== undefined) {
    console.log(`[API REQ] ${method} ${path}${isRetry}`, body);
  } else {
    console.log(`[API REQ] ${method} ${path}${isRetry}`);
  }
}

function logResponse(response: AxiosResponse): void {
  if (!__DEV__) return;
  const path = pathOf(response.config);
  console.log(
    `[API RES] ${response.status} ${path}`,
    maskBody(parseBody(response.data)),
  );
}

function logError(error: AxiosError): void {
  if (!__DEV__) return;
  const path = pathOf(error.config);
  const method = (error.config?.method ?? "GET").toUpperCase();
  if (error.response) {
    // Server replied with a status (4xx/5xx). Keep its structured error
    // envelope visible while masking credentials and other sensitive fields.
    console.log(
      `[API ERR] ${error.response.status} ${method} ${path}`,
      maskBody(parseBody(error.response.data)),
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
  // Axios assigns application/x-www-form-urlencoded when a POST has no
  // content type. RN's native networking layer needs the multipart media type
  // to build the body, then appends/overrides the boundary on iOS and Android.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = AxiosHeaders.from(config.headers);
    headers.set("Content-Type", "multipart/form-data");
    config.headers = headers;
  }
  logRequest(config);
  return config;
});

// ─── Response interceptor: log + 401 → refresh → retry ───────────────────────

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const REFRESH_EXCLUDED_PATHS = new Set<string>([
  AUTH_ENDPOINTS.login,
  AUTH_ENDPOINTS.signup,
  AUTH_ENDPOINTS.refresh,
  AUTH_ENDPOINTS.oauthExchange,
  AUTH_ENDPOINTS.logout,
  AUTH_ENDPOINTS.emailSend,
  AUTH_ENDPOINTS.emailVerify,
]);

const REFRESH_EXCLUDED_PREFIXES = [
  "/api/users/password/",
  "/oauth2/",
  "/login/oauth2/",
];

function requestPath(url: string | undefined): string {
  if (!url) return "";

  let path = url.startsWith(API_BASE_URL)
    ? url.slice(API_BASE_URL.length)
    : url;
  const suffixIndex = path.search(/[?#]/);
  if (suffixIndex >= 0) {
    path = path.slice(0, suffixIndex);
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function isRefreshExcluded(url: string | undefined): boolean {
  const path = requestPath(url);
  return (
    REFRESH_EXCLUDED_PATHS.has(path) ||
    REFRESH_EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))
  );
}

/**
 * 백엔드는 401을 서로 다른 두 body 포맷으로 내려준다.
 *
 *   자격증명 불일치  { status, code: "INVALID_CREDENTIALS", message }  (GlobalExceptionHandler)
 *   토큰 만료/무효   { error: "Unauthorized", message }                (CustomAuthenticationEntryPoint)
 *
 * 후자에만 `code`가 없다는 점이 유일한 구분 근거다. 전자를 refresh 대상으로
 * 취급하면 비밀번호가 네트워크로 두 번 나가고, refresh가 실패하는 순간
 * 오타 하나로 강제 로그아웃된다.
 *
 * 판별은 한쪽으로만 확신을 요구한다 — `code`가 정확히 "INVALID_CREDENTIALS"인
 * 문자열일 때만 true. 응답이 없거나, body가 null/문자열/배열이거나, `code`가
 * 문자열이 아니거나 다른 값이면 false를 돌려주고 기존 refresh 흐름을 그대로
 * 타게 둔다. 판별 실패 시의 안전한 기본값은 "오늘과 동일한 동작"이다.
 */
const INVALID_CREDENTIALS_CODE = "INVALID_CREDENTIALS";

function isInvalidCredentialsError(error: AxiosError): boolean {
  const data: unknown = error.response?.data;
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }
  const code: unknown = (data as { code?: unknown }).code;
  return typeof code === "string" && code === INVALID_CREDENTIALS_CODE;
}

async function requestRefreshTokens(refreshToken: string): Promise<unknown> {
  if (__DEV__) console.log("[API REFRESH] attempting refresh...");
  if (__DEV__) console.log(`[API REQ] POST ${AUTH_ENDPOINTS.refresh}`);

  try {
    const { data, status } = await axios.post<unknown>(
      `${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`,
      { refreshToken },
      {
        timeout: API_TIMEOUT_MS,
        headers: { "Content-Type": "application/json" },
      },
    );

    if (__DEV__) {
      console.log(`[API RES] ${status} ${AUTH_ENDPOINTS.refresh}`);
    }
    return data;
  } catch (e) {
    if (__DEV__) {
      const status = (e as AxiosError).response?.status ?? "NETWORK";
      console.log(`[API REFRESH] failed (${status})`);
    }
    throw e;
  }
}

const refreshCoordinator = createAuthRefreshCoordinator({
  getRefreshToken: tokenStorage.getRefreshToken,
  requestRefresh: requestRefreshTokens,
  saveAuthTokens: async ({ accessToken, refreshToken }) => {
    await tokenStorage.setTokens(accessToken, refreshToken);
    authEvents.emitTokensRefreshed();
    if (__DEV__) {
      console.log("[API REFRESH] success, retrying original request");
    }
  },
  expireSession: async () => {
    try {
      await tokenStorage.clearTokens();
    } finally {
      authEvents.emitLogout();
    }
  },
});

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
      isRefreshExcluded(original.url)
    ) {
      return Promise.reject(error);
    }

    // 자격증명 실패 401(현재 비밀번호 오타 등)은 토큰 만료가 아니다. refresh를
    // 보내지 않고, _retry 마킹도 재시도도 하지 않고, logout도 emit하지 않는다.
    // 호출부가 status와 body의 code/message를 읽을 수 있도록 원본 에러를 그대로
    // 넘긴다. 로그에는 method/path만 남긴다 — 요청 body는 절대 싣지 않는다.
    if (isInvalidCredentialsError(error)) {
      if (__DEV__) {
        const method = (original.method ?? "GET").toUpperCase();
        console.log(
          `[API AUTH] credential failure — skipping refresh: ${method} ${pathOf(original)}`,
        );
      }
      return Promise.reject(error);
    }

    original._retry = true;

    try {
      return await refreshCoordinator.retryAfterRefresh(
        async (newAccessToken) => {
          const headers = AxiosHeaders.from(original.headers);
          headers.set("Authorization", `Bearer ${newAccessToken}`);
          original.headers = headers;

          return api.request(original);
        },
      );
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  },
);

// ─── Convenience helpers (typed) ─────────────────────────────────────────────

export type LoginResponse = AuthTokens;

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
   * `updateNotificationSetting(enabled)` 성공 시 같은 컬럼이 바뀌므로
   * 클라이언트도 로컬 merge로 같이 갱신해 다음 화면 렌더에 일관성 유지.
   */
  isNotificationEnabled: boolean;
};

/**
 * Exchanges the short-lived, single-use OAuth callback code for session
 * tokens. This is a public auth endpoint and is excluded from 401 refresh.
 */
export async function exchangeOAuthCode(
  code: string,
  config?: AxiosRequestConfig,
): Promise<AuthTokens> {
  const normalizedCode = code.trim();
  if (!normalizedCode) {
    throw new Error("An OAuth authorization code is required.");
  }

  const { data } = await api.post<unknown>(
    AUTH_ENDPOINTS.oauthExchange,
    { code: normalizedCode },
    config,
  );
  const tokens = parseAuthTokens(data);
  if (!tokens) {
    throw new Error("The OAuth exchange response did not contain valid tokens.");
  }
  return tokens;
}

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
 * 비밀번호 재설정 1단계 — 6자리 인증번호를 이메일로 발송 요청. Public
 * endpoint (no auth header needed). 성공은 200 + plain-string message이며
 * 토스트로 그대로 노출한다. 서버는 미가입/소셜/일반 계정 모두 동일한 성공
 * 응답을 돌려준다(계정 열거 방지 — 의도적 설계). 클라이언트가 응답으로
 * 계정 존재 여부를 구분하려 해서는 안 된다.
 *
 * rate limit: 이메일당 3회/15분. 초과 시 429 `RATE_LIMIT_EXCEEDED` +
 * `Retry-After` 헤더 — `getRetryAfterSeconds`로 읽는다.
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

export type PasswordResetVerification = {
  resetToken: string;
  expiresInSeconds: number;
};

/**
 * 비밀번호 재설정 2단계 — 이메일로 받은 6자리 인증번호 검증. 성공 시
 * `{ resetToken, expiresInSeconds }`(현재 600초)를 돌려준다. resetToken은
 * 호출 화면의 메모리에만 두고 어디에도 저장/로그하지 않는다(요청·응답
 * 로그는 이 모듈의 마스킹 목록이 가린다).
 *
 * 실패는 전부 400 `BAD_REQUEST`이며 코드 불일치/만료/시도 초과가 message
 * 문자열로만 구분된다 — 호출부는 message를 그대로 보여줄 뿐, 문자열로
 * 분기하지 않는다.
 */
export async function verifyPasswordResetCode(
  email: string,
  code: string,
  config?: AxiosRequestConfig,
): Promise<PasswordResetVerification> {
  const { data } = await api.post<PasswordResetVerification>(
    "/api/users/password/find/verify",
    { email, code },
    config,
  );
  return data;
}

/**
 * 비밀번호 재설정 3단계 — resetToken으로 새 비밀번호 확정. 성공은 **204
 * No Content, body 없음**. newPassword 규칙은 utils/passwordPolicy.ts —
 * change-password와 완전히 동일한 서버 @Pattern이다.
 *
 * 실패: 401 `INVALID_TOKEN`(토큰 만료/이미 사용됨 — 1단계부터 다시),
 * 400 `INVALID_INPUT`(비밀번호 형식). 이 경로는 비로그인 플로우라 지울
 * 로컬 세션이 없으며, `/api/users/password/` prefix가 refresh 제외 목록에
 * 있어 401이 와도 인터셉터가 refresh를 시도하지 않고 원본 에러를 그대로
 * 던진다.
 */
export async function resetPassword(
  resetToken: string,
  newPassword: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.post<void>(
    "/api/users/password/reset",
    { resetToken, newPassword },
    config,
  );
}

/** Creates a new account. Server returns a plain string message; we don't surface it. */
export async function signUp(
  email: string,
  password: string,
  nickname: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.post(
    AUTH_ENDPOINTS.signup,
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
 * 소셜 계정은 서버의 password 컬럼이 null이라 서버가 400으로 거절한다.
 *
 * 성공은 **204 No Content, body 없음**이다. 그리고 서버는 204를 보내기 전에
 * 같은 트랜잭션에서 해당 유저의 모든 UserSession, Expo Push Token, Password
 * Reset Token을 삭제한다 — 즉 **204가 도착한 시점에 현재 세션은 이미 서버에서
 * 사라져 있다**. 호출부는 성공 직후 로컬 세션도 정리해야 한다
 * (`AuthContext.endLocalSession`). 여기서 토큰을 지우지 않는 이유는, 화면이
 * 안내 토스트를 띄운 뒤 로그아웃 타이밍을 직접 잡을 수 있게 두기 위해서다.
 *
 * 실패는 던진다. 현재 비밀번호 불일치는 401 `INVALID_CREDENTIALS`이며,
 * 인터셉터가 이 code를 refresh 대상에서 제외하므로 원본 에러가 그대로 온다.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
  config?: AxiosRequestConfig,
): Promise<void> {
  await api.patch<void>(
    "/api/users/me/password",
    { currentPassword, newPassword },
    config,
  );
}

/**
 * 서버에 저장된 전체 푸시 수신 설정을 **명시적 값**으로 변경한다.
 * PATCH /api/users/me/notification-setting, body `{ enabled }` — 서버
 * NotificationSettingRequest.enabled(@NotNull). "반대로 토글"이 아니라
 * 원하는 최종 값을 보내므로 연타/재시도에도 멱등이다.
 *
 * 성공은 200 + plain-string message("알림 수신이 켜졌습니다." 등).
 * 이 값은 GET /me의 `isNotificationEnabled`와 같은 컬럼이므로, 성공 후에는
 * /me 재호출 없이 `AuthContext.setUserNotificationEnabled(enabled)`로 로컬
 * merge만 하면 된다.
 *
 * 일반 인증 API다 — refresh 제외 목록에 넣지 않는다. 401(토큰 만료)이면
 * 인터셉터가 refresh 후 1회 재시도한다.
 */
export async function updateNotificationSetting(
  enabled: boolean,
  config?: AxiosRequestConfig,
): Promise<string> {
  const { data } = await api.patch<string>(
    "/api/users/me/notification-setting",
    { enabled },
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

export type LogoutRequest = {
  refreshToken: string | null;
  deviceToken: string | null;
};

/**
 * Invalidates the current backend session. Local cleanup is owned by
 * AuthContext so it still runs when this request fails.
 */
export async function logout(request: LogoutRequest): Promise<void> {
  await api.post(AUTH_ENDPOINTS.logout, request);
}

/** Invalidates every authenticated session for the current user. */
export async function logoutAll(): Promise<void> {
  await api.post(AUTH_ENDPOINTS.logoutAll);
}
