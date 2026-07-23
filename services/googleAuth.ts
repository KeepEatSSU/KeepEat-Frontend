/**
 * Google OAuth via backend redirect.
 *
 * Flow:
 *   1. Open the backend's authorization URL in an in-app browser.
 *   2. Backend handles Google sign-in and redirects to the active app variant:
 *      `keepeat[-demo]://oauth2/redirect?accessToken=...&refreshToken=...`.
 *   3. The OS routes the custom scheme back to the app; WebBrowser resolves
 *      with `{ type: "success", url }`.
 *   4. We parse tokens out of the query string and return them.
 *
 * The callback is generated from the custom scheme embedded in the current
 * development/production build. This flow is not supported in Expo Go.
 *
 * Security: never log `result.url`, `queryParams`, or the returned tokens.
 * They contain credentials.
 */

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";

import { API_BASE_URL } from "@/constants/config";

const AUTH_URL = `${API_BASE_URL}/oauth2/authorization/google`;
const REDIRECT_PATH = "oauth2/redirect";

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken: string;
}

function getConfiguredScheme(): string {
  const configuredScheme = Constants.expoConfig?.scheme;
  const scheme = Array.isArray(configuredScheme)
    ? configuredScheme[0]
    : configuredScheme;

  if (!scheme) {
    throw new Error("[Google OAuth] Expo app scheme is not configured.");
  }
  return scheme;
}

export function createGoogleOAuthRedirectUrl(
  scheme = getConfiguredScheme(),
): string {
  return Linking.createURL(REDIRECT_PATH, { scheme });
}

/**
 * Launches the in-app Google OAuth flow.
 * @returns tokens on success, `null` on cancel / dismiss / missing-token.
 *          Throws only on unexpected runtime errors (caller decides UX).
 */
export async function startGoogleLogin(): Promise<GoogleAuthTokens | null> {
  const redirectUrl = createGoogleOAuthRedirectUrl();
  const result = await WebBrowser.openAuthSessionAsync(AUTH_URL, redirectUrl);
  if (result.type !== "success" || !result.url) return null;

  const { queryParams } = Linking.parse(result.url);
  const accessToken = queryParams?.accessToken;
  const refreshToken = queryParams?.refreshToken;

  if (typeof accessToken !== "string" || typeof refreshToken !== "string") {
    return null;
  }
  return { accessToken, refreshToken };
}
