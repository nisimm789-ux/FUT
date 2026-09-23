import type { KeyValueStore } from '@fc/domain';

/** The subset of chrome.storage.StorageArea we use; lets tests pass a fake. */
export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * KeyValueStore over a chrome.storage area.
 * - session: ephemeral per-browser-session state (tab state, our own short-lived auth later)
 * - sync:    small non-sensitive preferences
 * Large datasets (club snapshots history, catalog, solve history) belong in
 * IndexedDB behind SnapshotRepository (Phase 1).
 */
export function createChromeKeyValueStore(area: StorageAreaLike): KeyValueStore {
  return {
    async get<T>(key: string) {
      const result = await area.get(key);
      return result[key] as T | undefined;
    },
    set: (key, value) => area.set({ [key]: value }),
    remove: (key) => area.remove(key),
  };
}
