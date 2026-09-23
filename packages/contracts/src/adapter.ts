import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { EpochMsSchema } from './primitives.js';

export const CAPABILITIES = [
  'contextDetection',
  'sbcReading',
  'clubReading',
  'squadReading',
  'packReading',
  'evolutionReading',
  'actions',
] as const;
export const CapabilityNameSchema = z.enum(CAPABILITIES);
export type CapabilityName = z.infer<typeof CapabilityNameSchema>;

/**
 * - healthy:     working as expected on the current page/profile
 * - degraded:    recent failures; output must not be trusted until it recovers
 * - unsupported: no reader/profile implements it here
 * - disabled:    deliberately switched off (policy, SAFE_MODE, remote flag)
 * - unknown:     not exercised yet in this session
 */
export const CapabilityStateSchema = z.enum(['healthy', 'degraded', 'unsupported', 'disabled', 'unknown']);
export type CapabilityState = z.infer<typeof CapabilityStateSchema>;

/** Coarse, non-sensitive failure categories safe for telemetry. */
export const ParserFailureCategorySchema = z.enum([
  'STRUCTURE_NOT_FOUND',
  'FIELD_MISSING',
  'VALUE_OUT_OF_RANGE',
  'CONTRACT_VALIDATION_FAILED',
  'UNRECOGNIZED_REQUIREMENT',
  'PROFILE_MISMATCH',
  'INTERNAL_ERROR',
]);
export type ParserFailureCategory = z.infer<typeof ParserFailureCategorySchema>;

export const AdapterHealthSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  adapterVersion: z.string().min(1).max(32),
  profileId: z.string().min(1).max(64),
  safeMode: z.boolean(),
  capabilities: z.record(CapabilityNameSchema, CapabilityStateSchema),
  lastFailure: z
    .object({ capability: CapabilityNameSchema, category: ParserFailureCategorySchema, at: EpochMsSchema })
    .nullable(),
  updatedAt: EpochMsSchema,
});
export type AdapterHealth = z.infer<typeof AdapterHealthSchema>;

/** What an adapter build claims it can do, independent of runtime health. */
export const AdapterCapabilitiesSchema = z.object({
  adapterVersion: z.string().min(1).max(32),
  profileId: z.string().min(1).max(64),
  supported: z.array(CapabilityNameSchema),
});
export type AdapterCapabilities = z.infer<typeof AdapterCapabilitiesSchema>;
