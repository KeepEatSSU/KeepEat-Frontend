/**
 * Google OAuth via backend redirect.
 *
 * Flow:
 *   1. Open the backend's authorization URL in an in-app browser.
 *   2. Backend handles Google sign-in and redirects to
 *      `keepeat://oauth2/redirect?accessToken=...&refreshToken=...`.
 *   3. The OS routes the custom scheme back to the app; WebBrowser resolves
 *      with `{ type: "success", url }`.
 *   4. We parse tokens out of the query string and return them.
 *
 * The redirect URL is hardcoded to the value the backend has registered.
 * `Linking.createURL` is intentionally NOT used — in dev it produces an
 * `exp://...` URL that won't match the backend's registered callback.
 *
 * Security: never log `result.url`, `queryParams`, or the returned tokens.
 * They contain credentials.
 */

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

import { API_BASE_URL } from "@/constants/config";

const REDIRECT_URL = "keepeat://oauth2/redirect";
const AUTH_URL = `${API_BASE_URL}/oauth2/authorization/google`;

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Launches the in-app Google OAuth flow.
 * @returns tokens on success, `null` on cancel / dismiss / missing-token.
 *          Throws only on unexpected runtime errors (caller decides UX).
 */
export async function startGoogleLogin(): Promise<GoogleAuthTokens | null> {
  const result = await WebBrowser.openAuthSessionAsync(AUTH_URL, REDIRECT_URL);
  if (result.type !== "success" || !result.url) return null;

  const { queryParams } = Linking.parse(result.url);
  const accessToken = queryParams?.accessToken;
  const refreshToken = queryParams?.refreshToken;

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return null;
  }
  return { accessToken, refreshToken };
}
