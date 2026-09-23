import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { EpochMsSchema } from './primitives.js';

export const EA_CONTEXT_KINDS = [
  'UNKNOWN',
  'HOME',
  'SQUADS',
  'SBC_HUB',
  'SBC_CHALLENGE',
  'CLUB',
  'STORE',
  'PACK_RESULTS',
  'TRANSFERS',
  'EVOLUTIONS',
] as const;

export const EaContextKindSchema = z.enum(EA_CONTEXT_KINDS);
export type EaContextKind = z.infer<typeof EaContextKindSchema>;

/**
 * Structural signal names that led to a detection. Short, stable, non-PII
 * tokens (e.g. "view:sbc-challenge"), useful for debugging and telemetry.
 */
export const DetectionSignalSchema = z.string().regex(/^[a-z0-9:_-]{1,64}$/);

export const EaContextSnapshotSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  kind: EaContextKindSchema,
  /** `high`: DOM structure confirmed. `low`: URL/weak signal only. `none`: UNKNOWN. */
  confidence: z.enum(['high', 'low', 'none']),
  signals: z.array(DetectionSignalSchema).max(16),
  /** Identifier of the selector profile that produced this detection. */
  profileId: z.string().min(1).max(64),
  observedAt: EpochMsSchema,
});
export type EaContextSnapshot = z.infer<typeof EaContextSnapshotSchema>;
