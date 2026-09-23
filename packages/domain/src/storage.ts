import type { ClubSnapshot } from '@fc/contracts';

/**
 * Storage ports. Implementations live at the edges:
 * - SessionStore     -> chrome.storage.session (ephemeral, cleared on browser restart)
 * - PreferenceStore  -> chrome.storage.sync   (small, non-sensitive preferences)
 * - SnapshotRepository -> IndexedDB (large structured local data; Phase 1)
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export type SessionStore = KeyValueStore;
export type PreferenceStore = KeyValueStore;

export interface SnapshotRepository {
  saveClubSnapshot(snapshot: ClubSnapshot): Promise<void>;
  latestClubSnapshot(): Promise<ClubSnapshot | undefined>;
}

/** In-memory implementation for tests and non-browser runtimes. */
export function createMemoryKeyValueStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: <T>(key: string) => Promise.resolve(data.get(key) as T | undefined),
    set: (key, value) => {
      data.set(key, structuredClone(value));
      return Promise.resolve();
    },
    remove: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

export function createMemorySnapshotRepository(): SnapshotRepository {
  let latest: ClubSnapshot | undefined;
  return {
    saveClubSnapshot: (snapshot) => {
      latest = structuredClone(snapshot);
      return Promise.resolve();
    },
    latestClubSnapshot: () => Promise.resolve(latest),
  };
}
