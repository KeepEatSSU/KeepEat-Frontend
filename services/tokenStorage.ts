/**
 * KeepEat — secure token storage.
 * Wraps expo-secure-store so the rest of the app never touches Keychain
 * keys directly. JWT access + refresh tokens live here.
 *
 * Usage:
 *   import { tokenStorage } from "@/services/tokenStorage";
 *   await tokenStorage.setTokens(accessToken, refreshToken);
 *   const access = await tokenStorage.getAccessToken();
 */

import * as SecureStore from "expo-secure-store";

const ACCESS_KEY = "keepeat.accessToken";
const REFRESH_KEY = "keepeat.refreshToken";

async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ]);
}

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

export const tokenStorage = {
  setTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
};
