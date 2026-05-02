/**
 * KeepEat — runtime config / environment constants.
 * Centralize anything that may differ between dev/staging/prod here so
 * we never grep for hardcoded URLs again.
 */

export const API_BASE_URL = "http://13.124.250.250:8080";

// Auth endpoints — used by the API client and token-refresh flow.
export const AUTH_ENDPOINTS = {
  login: "/api/users/login",
  signup: "/api/users/signup",
  refresh: "/api/users/refresh",
  logout: "/api/users/logout",
} as const;

// Network defaults.
export const API_TIMEOUT_MS = 15_000;
