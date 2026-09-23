import { z } from 'zod';

/**
 * Where a piece of normalized data came from. Carried by every snapshot and
 * every solve input so the UI can never present synthetic data as real.
 *
 * - EA_WEB_LIVE:      read from the real EA Web App origin by a live profile
 * - LOCAL_FIXTURE:    synthetic fixture pages / bundled demo data
 * - IMPORTED_FIXTURE: sanitized fixture converted from an inspection report
 * - MANUAL:           typed or edited by a user/developer
 */
export const PROVENANCES = ['EA_WEB_LIVE', 'LOCAL_FIXTURE', 'IMPORTED_FIXTURE', 'MANUAL'] as const;
export const ProvenanceSchema = z.enum(PROVENANCES);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export function isLiveProvenance(p: Provenance): boolean {
  return p === 'EA_WEB_LIVE';
}
