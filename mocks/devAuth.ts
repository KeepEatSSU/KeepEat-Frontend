/**
 * KeepEat — dev-only auth bypass fixtures.
 *
 * Used exclusively when `DEV_BYPASS_AUTH` is enabled in `constants/config`.
 * Lets us boot the app with a fake authenticated session so UI work can
 * proceed while the backend is unreachable (IP whitelist, offline, etc.).
 *
 * Do NOT import these from production code paths — `AuthContext` is the
 * single consumer and gates every reference behind `__DEV__ && DEV_BYPASS_AUTH`.
 */

import type { UserInfo } from "@/services/api";

/**
 * Shape matches `UserInfo` from `services/api` so consumers don't need to
 * branch on bypass-vs-real. `role` mirrors the backend's role string format;
 * use "USER" so any role-gated UI behaves like a normal account.
 */
export const MOCK_USER: UserInfo = {
  id: 0,
  email: "dev@bypass.com",
  role: "USER",
};

/**
 * Stand-in JWT written to secure storage so the request interceptor in
 * `services/api` still attaches an Authorization header. The string itself
 * is meaningless to the (unreachable) backend — it only exists to keep
 * downstream code from short-circuiting on a missing token.
 */
export const MOCK_JWT = "dev-bypass-mock-jwt-do-not-ship";
