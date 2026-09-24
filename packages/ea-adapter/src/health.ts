import { CAPABILITIES, CONTRACTS_VERSION } from '@fc/contracts';
import type { AdapterFailure, AdapterHealth, CapabilityName, CapabilityState, ParserFailureCategory, RemoteConfig } from '@fc/contracts';

const READ_CAPABILITIES: readonly CapabilityName[] = ['sbcReading', 'clubReading', 'squadReading', 'packReading', 'evolutionReading'];

export interface HealthTrackerOptions {
  adapterVersion: string;
  now: () => number;
  /** Consecutive read failures (any read capability) before SAFE_MODE engages. */
  safeModeThreshold?: number;
  remoteConfig?: Pick<RemoteConfig, 'forceSafeMode' | 'disabledCapabilities' | 'minAdapterVersion'>;
}

export interface HealthTracker {
  snapshot(): AdapterHealth;
  setProfile(profileId: string, supported: readonly CapabilityName[], verified: boolean, signatures?: Readonly<Record<string, 'verified' | 'unverified' | 'disabled'>>): void;
  reportSuccess(capability: CapabilityName): void;
  reportFailure(capability: CapabilityName, category: ParserFailureCategory): void;
  /** True if the capability may be used now (not disabled/unsupported). */
  isUsable(capability: CapabilityName): boolean;
  subscribe(listener: (health: AdapterHealth) => void): () => void;
}

/**
 * Tracks per-capability health. SAFE_MODE disables every READ capability
 * (context detection keeps running so the UI can still explain what is going
 * on) — the product degrades instead of silently producing wrong data.
 * Write actions are always `disabled` in Phase 0.
 */
export function createHealthTracker(options: HealthTrackerOptions): HealthTracker {
  const threshold = options.safeModeThreshold ?? 3;
  const listeners = new Set<(health: AdapterHealth) => void>();
  const remote = options.remoteConfig;
  const tooOld = remote ? compareSemver(options.adapterVersion, remote.minAdapterVersion) < 0 : false;

  let profileId = 'none';
  let profileVerified = false;
  let profileSignatures: Record<string, 'verified' | 'unverified' | 'disabled'> = {};
  const recentFailures: AdapterFailure[] = [];
  let supported = new Set<CapabilityName>();
  let states = initialStates();
  let safeMode = Boolean(remote?.forceSafeMode) || tooOld;
  let consecutiveReadFailures = 0;
  let lastFailure: AdapterHealth['lastFailure'] = null;
  let updatedAt = options.now();

  function initialStates(): Record<CapabilityName, CapabilityState> {
    const result = {} as Record<CapabilityName, CapabilityState>;
    for (const cap of CAPABILITIES) result[cap] = supported.has(cap) ? 'unknown' : 'unsupported';
    result.actions = 'disabled';
    return result;
  }

  function effective(cap: CapabilityName): CapabilityState {
    if (cap === 'actions') return 'disabled';
    if (!supported.has(cap)) return 'unsupported';
    if (READ_CAPABILITIES.includes(cap)) {
      if (safeMode) return 'disabled';
      if (remote?.disabledCapabilities.includes(cap as (typeof remote.disabledCapabilities)[number])) return 'disabled';
    }
    return states[cap];
  }

  function snapshot(): AdapterHealth {
    const capabilities = {} as Record<CapabilityName, CapabilityState>;
    for (const cap of CAPABILITIES) capabilities[cap] = effective(cap);
    return {
      schemaVersion: CONTRACTS_VERSION,
      adapterVersion: options.adapterVersion,
      profileId,
      profileVerified,
      profileSignatures: { ...profileSignatures },
      safeMode,
      capabilities,
      lastFailure,
      recentFailures: [...recentFailures],
      updatedAt,
    };
  }

  function update(mutate: () => void) {
    const before = JSON.stringify({ ...snapshot(), updatedAt: 0 });
    mutate();
    const after = snapshot();
    if (JSON.stringify({ ...after, updatedAt: 0 }) === before) return;
    updatedAt = options.now();
    const health = { ...after, updatedAt };
    for (const listener of listeners) listener(health);
  }

  return {
    snapshot,
    setProfile(nextProfileId, nextSupported, verified, signatures = {}) {
      if (nextProfileId === profileId) return;
      update(() => {
        profileId = nextProfileId;
        profileVerified = verified;
        profileSignatures = { ...signatures };
        supported = new Set(nextSupported);
        states = initialStates();
        consecutiveReadFailures = 0;
      });
    },
    reportSuccess(capability) {
      update(() => {
        states[capability] = 'healthy';
        if (READ_CAPABILITIES.includes(capability)) consecutiveReadFailures = 0;
      });
    },
    reportFailure(capability, category) {
      update(() => {
        states[capability] = 'degraded';
        lastFailure = { capability, category, at: options.now() };
        recentFailures.push(lastFailure);
        if (recentFailures.length > 10) recentFailures.shift();
        if (READ_CAPABILITIES.includes(capability)) {
          consecutiveReadFailures += 1;
          if (consecutiveReadFailures >= threshold) safeMode = true;
        }
      });
    },
    isUsable(capability) {
      const state = effective(capability);
      return state !== 'disabled' && state !== 'unsupported';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}
