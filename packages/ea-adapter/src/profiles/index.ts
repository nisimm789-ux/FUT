import { eaWebCandidateProfile } from './ea-web-candidate.js';
import { syntheticV1Profile } from './synthetic-v1.js';
import type { SelectorProfile } from './types.js';

export * from './types.js';
export { eaWebCandidateProfile, syntheticV1Profile };

/** Most specific first: the synthetic probe is stricter than the live candidate probe. */
export const DEFAULT_PROFILES: readonly SelectorProfile[] = [syntheticV1Profile, eaWebCandidateProfile];

export function selectProfile(doc: Document, profiles: readonly SelectorProfile[] = DEFAULT_PROFILES): SelectorProfile | null {
  return profiles.find((p) => p.probe(doc)) ?? null;
}
