import { z } from 'zod';

/**
 * Remote configuration is DATA ONLY: feature flags and numeric thresholds.
 * It must never contain code, selectors-as-code, URLs to scripts, or
 * anything evaluated at runtime. `.strict()` rejects unknown keys so a
 * compromised or mistaken payload cannot smuggle extra fields in.
 */
export const RemoteConfigSchema = z
  .object({
    configVersion: z.number().int().positive(),
    /** Forces the adapter into SAFE_MODE (read capabilities disabled). */
    forceSafeMode: z.boolean(),
    /** Minimum adapter version allowed to read; older ones disable themselves. */
    minAdapterVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    /** Independently disable individual capabilities. */
    disabledCapabilities: z.array(z.enum(['sbcReading', 'clubReading', 'squadReading', 'packReading', 'evolutionReading'])),
    /** Write actions stay off in Phase 0 regardless of this flag; see ActionPolicy. */
    actionsEnabled: z.literal(false),
    telemetryEnabled: z.boolean(),
  })
  .strict();
export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  configVersion: 1,
  forceSafeMode: false,
  minAdapterVersion: '0.1.0',
  disabledCapabilities: [],
  actionsEnabled: false,
  telemetryEnabled: false,
};
