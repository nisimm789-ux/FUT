import { DEFAULT_REMOTE_CONFIG, RemoteConfigSchema, type RemoteConfig } from '@fc/contracts';

/**
 * Remote-config module. Returns DATA ONLY (flags/thresholds), validated
 * against the strict schema before it leaves the server.
 * Phase 1: back this with PostgreSQL behind the same interface.
 */
export interface RemoteConfigRepository {
  current(): Promise<RemoteConfig>;
}

export function createStaticRemoteConfigRepository(config: RemoteConfig = DEFAULT_REMOTE_CONFIG): RemoteConfigRepository {
  const validated = RemoteConfigSchema.parse(config);
  return { current: () => Promise.resolve(validated) };
}
