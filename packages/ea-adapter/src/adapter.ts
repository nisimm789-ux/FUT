import { ClubSnapshotSchema, SbcChallengeSnapshotSchema, validateContract } from '@fc/contracts';
import type {
  AdapterCapabilities,
  CapabilityName,
  ClubSnapshot,
  EaContextKind,
  EaContextSnapshot,
  RemoteConfig,
  SbcChallengeSnapshot,
} from '@fc/contracts';
import type { z } from 'zod';
import { detectContext } from './context/detector.js';
import { createHealthTracker, type HealthTracker } from './health.js';
import { createRequirementInterpreter, type RequirementInterpreter } from './interpretation/interpreter.js';
import { observeView } from './observation/view-observer.js';
import type { TimerHost } from './observation/debounce.js';
import { createPerfTracker, type PerfTracker } from './perf.js';
import { DEFAULT_PROFILES, selectProfile, type EaAdapterProfile } from './profiles/index.js';
import { resolveProvenance } from './provenance.js';
import { createClubReader } from './readers/club-reader.js';
import { createSbcReader } from './readers/sbc-reader.js';
import {
  ReadFailure,
  unsupportedReader,
  type EvolutionSnapshotPlaceholder,
  type PackSnapshotPlaceholder,
  type ReadResult,
  type Reader,
  type ReaderContext,
  type SquadSnapshotPlaceholder,
} from './readers/types.js';
import { ADAPTER_VERSION } from './version.js';

export interface EaWebAdapterDeps {
  document: Document;
  window: TimerHost & Pick<Window, 'addEventListener' | 'removeEventListener'>;
  getUrl: () => string;
  now?: () => number;
  /** Monotonic clock for performance measurements (defaults to performance.now). */
  perfNow?: () => number;
  profiles?: readonly EaAdapterProfile[];
  interpreter?: RequirementInterpreter;
  remoteConfig?: Pick<RemoteConfig, 'forceSafeMode' | 'disabledCapabilities' | 'minAdapterVersion'>;
  MutationObserverCtor?: typeof MutationObserver;
  safeModeThreshold?: number;
}

export interface ObserveHandlers {
  onContextChange: (current: EaContextSnapshot, previous: EaContextSnapshot | null) => void;
  /** Same context; the structure relevant to its reader changed meaningfully. */
  onScopeChange?: (current: EaContextSnapshot) => void;
}

export interface EaWebAdapter {
  readonly adapterVersion: string;
  readonly health: HealthTracker;
  readonly perf: PerfTracker;
  readonly interpreter: RequirementInterpreter;
  activeProfile(): EaAdapterProfile | null;
  capabilities(): AdapterCapabilities;
  detectContext(): EaContextSnapshot;
  /** Bounded SPA observation (see observeView). Returns a disposer. */
  observe(handlers: ObserveHandlers): () => void;
  /** @deprecated Phase 0 API: context changes only. */
  observeContext(onChange: ObserveHandlers['onContextChange']): () => void;
  readSbcChallenge(): ReadResult<SbcChallengeSnapshot>;
  readClub(): ReadResult<ClubSnapshot>;
  /** Reader context for the current page (provenance, adapter info, locale). */
  readerContext(): ReaderContext;
  /** Direct access for diagnostics: runs the SBC reader WITHOUT affecting health. */
  dryReadSbc(): ReadResult<SbcChallengeSnapshot>;
}

interface ReaderSet {
  sbc: Reader<SbcChallengeSnapshot>;
  club: Reader<ClubSnapshot>;
  squad: Reader<SquadSnapshotPlaceholder>;
  pack: Reader<PackSnapshotPlaceholder>;
  evolution: Reader<EvolutionSnapshotPlaceholder>;
}

function readersFor(profile: EaAdapterProfile | null, interpreter: RequirementInterpreter): ReaderSet {
  return {
    sbc: profile?.sbc ? createSbcReader(profile.sbc, interpreter) : unsupportedReader('sbcReading'),
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
  const perfNow = deps.perfNow ?? (() => globalThis.performance.now());
  const profiles = deps.profiles ?? DEFAULT_PROFILES;
  const interpreter = deps.interpreter ?? createRequirementInterpreter();
  const perf = createPerfTracker(perfNow);
  const health = createHealthTracker({
    adapterVersion: ADAPTER_VERSION,
    now,
    ...(deps.safeModeThreshold !== undefined && { safeModeThreshold: deps.safeModeThreshold }),
    ...(deps.remoteConfig && { remoteConfig: deps.remoteConfig }),
  });
  let profile: EaAdapterProfile | null = null;
  let readers = readersFor(null, interpreter);

  function refreshProfile(): void {
    if (profile?.probe(deps.document)) return;
    const next = selectProfile(deps.document, profiles);
    if (next === profile) return;
    profile = next;
    readers = readersFor(profile, interpreter);
    health.setProfile(profile?.id ?? 'none', supportedCapabilities(), profile?.verified ?? false);
  }

  function supportedCapabilities(): CapabilityName[] {
    if (!profile) return [];
    return ['contextDetection', ...Object.values(readers).filter((r) => r.supported).map((r) => r.capability)];
  }

  function readerContext(): ReaderContext {
    const lang = deps.document.documentElement.getAttribute('lang')?.trim().toLowerCase() ?? '';
    return {
      now: now(),
      provenance: resolveProvenance(deps.getUrl(), profile),
      adapter: { adapterVersion: ADAPTER_VERSION, profileId: profile?.id ?? 'none', profileVerified: profile?.verified ?? false },
      locale: /^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(lang) ? lang : null,
    };
  }

  function execute<S extends z.ZodType>(reader: Reader<z.output<S>>, schema: S): ReadResult<z.output<S>> {
    let result: ReadResult<z.output<S>>;
    try {
      result = reader.read(deps.document, readerContext());
    } catch (error) {
      result =
        error instanceof ReadFailure
          ? { ok: false, category: error.category, message: error.message }
          : { ok: false, category: 'INTERNAL_ERROR', message: 'reader threw unexpectedly' };
    }
    if (!result.ok) return result;
    // Defense in depth: readers are typed, but the DOM is untrusted input.
    const validated = validateContract(schema, result.value);
    return validated.ok
      ? { ok: true, value: validated.value, ...(result.warnings && { warnings: result.warnings }) }
      : { ok: false, category: 'CONTRACT_VALIDATION_FAILED', message: validated.issues.join('; ') };
  }

  function runReader<S extends z.ZodType>(reader: Reader<z.output<S>>, schema: S, timing: 'readSbc' | 'readClub'): ReadResult<z.output<S>> {
    refreshProfile();
    if (!health.isUsable(reader.capability)) {
      return { ok: false, category: 'PROFILE_MISMATCH', message: `${reader.capability} is ${health.snapshot().capabilities[reader.capability]}` };
    }
    const result = perf.measure(timing, () => execute(reader, schema));
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

  function scopesFor(kind: EaContextKind): Element[] {
    const sbc = profile?.sbc;
    if (kind === 'SBC_CHALLENGE' && sbc) {
      return [sbc.requirementsRoot, sbc.pitchRoot]
        .filter((s): s is string => s !== undefined)
        .map((s) => deps.document.querySelector(s))
        .filter((el): el is Element => el !== null);
    }
    if (kind === 'CLUB' && profile?.club) return [...deps.document.querySelectorAll(profile.club.list)];
    return [];
  }

  function fingerprint(kind: EaContextKind): string | null {
    if (kind === 'SBC_CHALLENGE') return readers.sbc.fingerprint?.(deps.document) ?? null;
    if (kind === 'CLUB' && profile?.club) {
      const lists = [...deps.document.querySelectorAll(profile.club.list)];
      return lists.length === 0 ? null : lists.map((l) => `${l.childElementCount}:${l.textContent?.length ?? 0}`).join('|');
    }
    return null;
  }

  refreshProfile();

  const observe = (handlers: ObserveHandlers) =>
    observeView({
      doc: deps.document,
      win: deps.window,
      now: perfNow,
      perf,
      detect,
      scopesFor,
      fingerprint,
      onContextChange: handlers.onContextChange,
      onScopeChange: handlers.onScopeChange ?? (() => undefined),
      ...(deps.MutationObserverCtor && { MutationObserverCtor: deps.MutationObserverCtor }),
    });

  return {
    adapterVersion: ADAPTER_VERSION,
    health,
    perf,
    interpreter,
    activeProfile: () => {
      refreshProfile();
      return profile;
    },
    capabilities: () => ({ adapterVersion: ADAPTER_VERSION, profileId: profile?.id ?? 'none', supported: supportedCapabilities() }),
    detectContext: detect,
    observe,
    observeContext: (onChange) => observe({ onContextChange: onChange }),
    readSbcChallenge: () => runReader(readers.sbc, SbcChallengeSnapshotSchema, 'readSbc'),
    readClub: () => runReader(readers.club, ClubSnapshotSchema, 'readClub'),
    readerContext,
    dryReadSbc: () => {
      refreshProfile();
      return execute(readers.sbc, SbcChallengeSnapshotSchema);
    },
  };
}
