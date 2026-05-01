type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    }
  };
})();

export function getBrowserStorage(): StorageLike {
  try {
    const storage = window.localStorage;
    const testKey = "__cgp_storage_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return memoryStorage;
  }
}
