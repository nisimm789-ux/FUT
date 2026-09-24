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

export const AdapterFailureSchema = z.object({
  capability: CapabilityNameSchema,
  category: ParserFailureCategorySchema,
  at: EpochMsSchema,
});
export type AdapterFailure = z.infer<typeof AdapterFailureSchema>;

export const AdapterHealthSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  adapterVersion: z.string().min(1).max(32),
  profileId: z.string().min(1).max(64),
  /** False until the active profile has been validated against the live Web App. */
  profileVerified: z.boolean(),
  /** Per-signature evidence status of the active profile (e.g. "sbc:slotFilled": "disabled"). */
  profileSignatures: z.record(z.string().regex(/^[a-z][A-Za-z0-9:_-]{0,63}$/), z.enum(['verified', 'unverified', 'disabled'])),
  safeMode: z.boolean(),
  capabilities: z.record(CapabilityNameSchema, CapabilityStateSchema),
  lastFailure: AdapterFailureSchema.nullable(),
  /** Most recent failures, newest last (bounded). */
  recentFailures: z.array(AdapterFailureSchema).max(10),
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

/** Timing statistic in milliseconds. */
export const TimingStatSchema = z.object({
  count: z.number().int().nonnegative(),
  last: z.number().nonnegative(),
  avg: z.number().nonnegative(),
  max: z.number().nonnegative(),
});
export type TimingStat = z.infer<typeof TimingStatSchema>;

export const PERF_TIMINGS = ['detectContext', 'readSbc', 'readClub', 'fingerprint', 'mutationToRefresh'] as const;
export const PERF_COUNTERS = [
  'rootMutationBatches',
  'scopedMutationBatches',
  'ticks',
  'fingerprintUnchanged',
  'rereads',
  'duplicateSnapshotsSuppressed',
] as const;

/** Numbers only: safe for diagnostics and telemetry. */
export const AdapterPerfSchema = z.object({
  timings: z.record(z.enum(PERF_TIMINGS), TimingStatSchema),
  counters: z.record(z.enum(PERF_COUNTERS), z.number().int().nonnegative()),
});
export type AdapterPerf = z.infer<typeof AdapterPerfSchema>;
