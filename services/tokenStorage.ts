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
import {
  clearPersistedAuthTokens,
  savePersistedAuthTokens,
  type AuthTokenPersistence,
} from "@/services/authSession";

const ACCESS_KEY = "keepeat.accessToken";
const REFRESH_KEY = "keepeat.refreshToken";

const secureTokenPersistence: AuthTokenPersistence = {
  setAccessToken: (token) => SecureStore.setItemAsync(ACCESS_KEY, token),
  setRefreshToken: (token) => SecureStore.setItemAsync(REFRESH_KEY, token),
  deleteAccessToken: () => SecureStore.deleteItemAsync(ACCESS_KEY),
  deleteRefreshToken: () => SecureStore.deleteItemAsync(REFRESH_KEY),
};

async function setTokens(accessToken: string, refreshToken: string): Promise<void> {
  await savePersistedAuthTokens(
    secureTokenPersistence,
    accessToken,
    refreshToken,
  );
}

async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

async function clearTokens(): Promise<void> {
  await clearPersistedAuthTokens(secureTokenPersistence);
}

export const tokenStorage = {
  setTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
};
