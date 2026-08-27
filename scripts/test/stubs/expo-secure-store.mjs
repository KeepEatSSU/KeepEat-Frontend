// In-memory stand-in for expo-secure-store's native Keychain access.
// Only the three functions services/tokenStorage.ts actually calls.

const store = new Map();

export async function setItemAsync(key, value) {
  store.set(key, value);
}

export async function getItemAsync(key) {
  return store.has(key) ? store.get(key) : null;
}

export async function deleteItemAsync(key) {
  store.delete(key);
}

export function __reset() {
  store.clear();
}
