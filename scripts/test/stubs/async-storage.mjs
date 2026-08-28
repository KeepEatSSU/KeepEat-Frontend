// In-memory @react-native-async-storage/async-storage — the real package
// needs the RN native bridge. State is process-global on purpose (mirrors the
// device: one storage per app install); tests reset via `clear()`.

const store = new Map();

const AsyncStorage = {
  async getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    store.set(key, String(value));
  },
  async removeItem(key) {
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
};

export default AsyncStorage;
