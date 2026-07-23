/**
 * KeepEat — runtime config / environment constants.
 * Centralize anything that may differ between dev/staging/prod here so
 * we never grep for hardcoded URLs again.
 */

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error(
    "[KeepEat config] EXPO_PUBLIC_API_URL is required. Use npm run start:local/start:demo or configure the EAS environment.",
  );
}

if (!/^https?:\/\//i.test(configuredApiUrl)) {
  throw new Error(
    "[KeepEat config] EXPO_PUBLIC_API_URL must start with http:// or https://.",
  );
}

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, "");

// Auth endpoints — used by the API client and token-refresh flow.
export const AUTH_ENDPOINTS = {
  login: "/api/users/login",
  signup: "/api/users/signup",
  refresh: "/api/users/refresh",
  logout: "/api/users/logout",
  emailSend: "/api/users/send",
  emailVerify: "/api/users/verify",
} as const;

// Network defaults.
export const API_TIMEOUT_MS = 15_000;

// ─── Dev-only auth bypass ────────────────────────────────────────────────────
// Set to `true` to skip real login and boot the app with a mock user, ONLY
// when the backend is unreachable (e.g. IP-whitelisted server, offline UI work).
// Always re-check this is `false` before pushing or building a release.
// Even when `true`, the bypass is also gated on `__DEV__` at the call site,
// so a release build can never authenticate against the mock.
export const DEV_BYPASS_AUTH = false;
