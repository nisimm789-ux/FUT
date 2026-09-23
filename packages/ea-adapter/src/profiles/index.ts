import { fc27LiveProfile } from './fc27-live.js';
import { syntheticV1Profile } from './synthetic-v1.js';
import type { EaAdapterProfile } from './types.js';

export * from './types.js';
export { fc27LiveProfile, syntheticV1Profile };

/** Most specific first: the synthetic probe is stricter than the live probe. */
export const DEFAULT_PROFILES: readonly EaAdapterProfile[] = [syntheticV1Profile, fc27LiveProfile];

export function selectProfile(doc: Document, profiles: readonly EaAdapterProfile[] = DEFAULT_PROFILES): EaAdapterProfile | null {
  return profiles.find((p) => p.probe(doc)) ?? null;
}
