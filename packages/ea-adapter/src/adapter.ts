import { ClubSnapshotSchema, SbcChallengeSnapshotSchema, validateContract } from '@fc/contracts';
import type {
  AdapterCapabilities,
  CapabilityName,
  ClubSnapshot,
  EaContextSnapshot,
  RemoteConfig,
  SbcChallengeSnapshot,
} from '@fc/contracts';
import type { z } from 'zod';
import { detectContext } from './context/detector.js';
import { observeContext } from './context/observer.js';
import { createHealthTracker, type HealthTracker } from './health.js';
import { DEFAULT_PROFILES, selectProfile, type SelectorProfile } from './profiles/index.js';
import { createClubReader } from './readers/club-reader.js';
import { createSbcReader } from './readers/sbc-reader.js';
import {
  ReadFailure,
  unsupportedReader,
  type EvolutionSnapshotPlaceholder,
  type PackSnapshotPlaceholder,
  type ReadResult,
  type Reader,
  type SquadSnapshotPlaceholder,
} from './readers/types.js';
import { ADAPTER_VERSION } from './version.js';

export interface EaWebAdapterDeps {
  document: Document;
  window: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
  getUrl: () => string;
  now?: () => number;
  profiles?: readonly SelectorProfile[];
  remoteConfig?: Pick<RemoteConfig, 'forceSafeMode' | 'disabledCapabilities' | 'minAdapterVersion'>;
  MutationObserverCtor?: typeof MutationObserver;
}

export interface EaWebAdapter {
  readonly adapterVersion: string;
  readonly health: HealthTracker;
  capabilities(): AdapterCapabilities;
  detectContext(): EaContextSnapshot;
  observeContext(onChange: (current: EaContextSnapshot, previous: EaContextSnapshot | null) => void): () => void;
  readSbcChallenge(): ReadResult<SbcChallengeSnapshot>;
  readClub(): ReadResult<ClubSnapshot>;
}

interface ReaderSet {
  sbc: Reader<SbcChallengeSnapshot>;
  club: Reader<ClubSnapshot>;
  squad: Reader<SquadSnapshotPlaceholder>;
  pack: Reader<PackSnapshotPlaceholder>;
  evolution: Reader<EvolutionSnapshotPlaceholder>;
}

function readersFor(profile: SelectorProfile | null): ReaderSet {
  return {
    sbc: profile?.sbc ? createSbcReader(profile.sbc) : unsupportedReader('sbcReading'),
    club: profile?.club ? createClubReader(profile.club) : unsupportedReader('clubReading'),
    squad: unsupportedReader('squadReading'),
    pack: unsupportedReader('packReading'),
    evolution: unsupportedReader('evolutionReading'),
  };
}

/**
 * READ-ONLY EA Web adapter. Everything that leaves this object is a validated
 * normalized contract; DOM nodes never escape. There is intentionally no write
 * method here — see @fc/ea-actions.
 */
export function createEaWebAdapter(deps: EaWebAdapterDeps): EaWebAdapter {
  const now = deps.now ?? (() => Date.now());
  const profiles = deps.profiles ?? DEFAULT_PROFILES;
  const health = createHealthTracker({
    adapterVersion: ADAPTER_VERSION,
    now,
    ...(deps.remoteConfig && { remoteConfig: deps.remoteConfig }),
  });
  let profile: SelectorProfile | null = null;
  let readers = readersFor(null);

  function refreshProfile(): void {
    if (profile?.probe(deps.document)) return;
    const next = selectProfile(deps.document, profiles);
    if (next === profile) return;
    profile = next;
    readers = readersFor(profile);
    health.setProfile(profile?.id ?? 'none', supportedCapabilities());
  }

  function supportedCapabilities(): CapabilityName[] {
    if (!profile) return [];
    return ['contextDetection', ...Object.values(readers).filter((r) => r.supported).map((r) => r.capability)];
  }

  function runReader<S extends z.ZodType>(reader: Reader<z.output<S>>, schema: S): ReadResult<z.output<S>> {
    refreshProfile();
    if (!health.isUsable(reader.capability)) {
      return { ok: false, category: 'PROFILE_MISMATCH', message: `${reader.capability} is ${health.snapshot().capabilities[reader.capability]}` };
    }
    let result: ReadResult<z.output<S>>;
    try {
      result = reader.read(deps.document, { now: now() });
    } catch (error) {
      result =
        error instanceof ReadFailure
          ? { ok: false, category: error.category, message: error.message }
          : { ok: false, category: 'INTERNAL_ERROR', message: 'reader threw unexpectedly' };
    }
    if (result.ok) {
      // Defense in depth: readers are typed, but the DOM is untrusted input.
      const validated = validateContract(schema, result.value);
      result = validated.ok
        ? { ok: true, value: validated.value }
        : { ok: false, category: 'CONTRACT_VALIDATION_FAILED', message: validated.issues.join('; ') };
    }
    if (result.ok) health.reportSuccess(reader.capability);
    else health.reportFailure(reader.capability, result.category);
    return result;
  }

  function detect(): EaContextSnapshot {
    refreshProfile();
    const snapshot = detectContext(deps.document, deps.getUrl(), profile, now());
    if (profile) health.reportSuccess('contextDetection');
    return snapshot;
  }

  refreshProfile();

  return {
    adapterVersion: ADAPTER_VERSION,
    health,
    capabilities: () => ({ adapterVersion: ADAPTER_VERSION, profileId: profile?.id ?? 'none', supported: supportedCapabilities() }),
    detectContext: detect,
    observeContext: (onChange) =>
      observeContext({
        detect,
        onChange,
        target: deps.document.documentElement,
        win: deps.window,
        ...(deps.MutationObserverCtor && { MutationObserverCtor: deps.MutationObserverCtor }),
      }),
    readSbcChallenge: () => runReader(readers.sbc, SbcChallengeSnapshotSchema),
    readClub: () => runReader(readers.club, ClubSnapshotSchema),
  };
}
