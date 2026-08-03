/**
 * Google OAuth via backend redirect.
 *
 * Flow:
 *   1. Open the backend's authorization URL in an in-app browser.
 *   2. Backend handles Google sign-in and redirects to the active app variant:
 *      `keepeat[-demo]://oauth2/redirect?code=...`.
 *   3. The OS routes the custom scheme back to the app; WebBrowser resolves
 *      with `{ type: "success", url }`.
 *   4. We exchange the single-use code for tokens through the shared API.
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
import { exchangeOAuthCode } from "@/services/api";
import type { AuthTokens } from "@/services/authSession";

const AUTH_URL = `${API_BASE_URL}/oauth2/authorization/google`;
const REDIRECT_PATH = "oauth2/redirect";

export type GoogleAuthTokens = AuthTokens;

const processedCodes = new Set<string>();
const inFlightCodeExchanges = new Map<
  string,
  Promise<GoogleAuthTokens>
>();
let activeGoogleLogin: Promise<GoogleAuthTokens | null> | null = null;

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

export function extractGoogleOAuthCode(callbackUrl: string): string | null {
  const code = Linking.parse(callbackUrl).queryParams?.code;
  if (typeof code !== "string") return null;

  const normalizedCode = code.trim();
  return normalizedCode.length > 0 ? normalizedCode : null;
}

async function exchangeCodeOnce(
  code: string,
): Promise<GoogleAuthTokens | null> {
  const inFlight = inFlightCodeExchanges.get(code);
  if (inFlight) return inFlight;
  if (processedCodes.has(code)) return null;

  // Mark before starting the request. A failed or consumed code must never be
  // submitted automatically again.
  processedCodes.add(code);
  const exchange = exchangeOAuthCode(code).finally(() => {
    inFlightCodeExchanges.delete(code);
  });
  inFlightCodeExchanges.set(code, exchange);
  return exchange;
}

export async function completeGoogleOAuthRedirect(
  callbackUrl: string,
): Promise<GoogleAuthTokens | null> {
  const code = extractGoogleOAuthCode(callbackUrl);
  if (!code) {
    throw new Error("The Google OAuth callback did not contain a valid code.");
  }
  return exchangeCodeOnce(code);
}

async function runGoogleLogin(): Promise<GoogleAuthTokens | null> {
  const redirectUrl = createGoogleOAuthRedirectUrl();
  const result = await WebBrowser.openAuthSessionAsync(AUTH_URL, redirectUrl);
  if (result.type !== "success" || !result.url) return null;

  return completeGoogleOAuthRedirect(result.url);
}

/**
 * Launches the in-app Google OAuth flow.
 * @returns exchanged tokens on success, `null` on cancel, dismiss, or an
 *          already-processed callback. Invalid callbacks and exchange errors
 *          are surfaced to the caller.
 */
export function startGoogleLogin(): Promise<GoogleAuthTokens | null> {
  if (!activeGoogleLogin) {
    activeGoogleLogin = runGoogleLogin().finally(() => {
      activeGoogleLogin = null;
    });
  }
  return activeGoogleLogin;
}
