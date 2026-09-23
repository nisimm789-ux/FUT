import type { CapabilityName, ClubSnapshot, EaContextSnapshot, ParserFailureCategory, SbcChallengeSnapshot } from '@fc/contracts';
import { createEventBus, type DomainEvents, type EventBus } from '@fc/domain';
import { sanitizeText, type EaWebAdapter, type ReadResult } from '@fc/ea-adapter';
import type { Telemetry } from '@fc/telemetry';
import type { ClubSlot, SbcSlot, StaleReason, TabState } from '../messaging/messages.js';

export interface ContentControllerDeps {
  adapter: EaWebAdapter;
  /** Delivers state to the service worker. Must not throw synchronously. */
  publishState: (state: TabState) => void;
  telemetry: Telemetry;
  now: () => number;
  bus?: EventBus<DomainEvents>;
}

export interface ContentController {
  start(): void;
  stop(): void;
  /** Re-detect context and re-run readers for it, publishing even if unchanged. */
  refresh(): void;
  current(): TabState | null;
  readonly bus: EventBus<DomainEvents>;
}

type Slot<T> = { snapshot: T; freshness: 'current' | 'stale'; staleReason: StaleReason | null; lastReadAt: number };

/** Same content, ignoring when it was observed. */
function sameSnapshot(a: { observedAt: number }, b: { observedAt: number }): boolean {
  return JSON.stringify({ ...a, observedAt: 0 }) === JSON.stringify({ ...b, observedAt: 0 });
}

/**
 * Orchestrates the READ pipeline inside the page:
 *   context change / meaningful same-page change
 *   → run ONLY the reader for the current context
 *   → validated snapshot (or explicit failure) → domain events → tab state.
 *
 * - Failed reads never fabricate data; the previous snapshot is kept but
 *   marked stale with a reason.
 * - Identical re-reads are suppressed (no publish).
 * - The solver never runs here.
 */
export function createContentController(deps: ContentControllerDeps): ContentController {
  const { adapter, telemetry, now } = deps;
  const bus = deps.bus ?? createEventBus<DomainEvents>();
  let context: EaContextSnapshot | null = null;
  let sbc: Slot<SbcChallengeSnapshot> | null = null;
  let club: Slot<ClubSnapshot> | null = null;
  let lastReadError: TabState['lastReadError'] = null;
  const cleanups: (() => void)[] = [];

  const state = (): TabState | null =>
    context && {
      context,
      health: adapter.health.snapshot(),
      sbc: sbc as SbcSlot | null,
      club: club as ClubSlot | null,
      lastReadError,
      perf: adapter.perf.snapshot(),
      updatedAt: now(),
    };

  const push = () => {
    const s = state();
    if (s) deps.publishState(s);
  };

  const markStale = <T>(slotValue: Slot<T> | null, reason: StaleReason): Slot<T> | null =>
    slotValue && { ...slotValue, freshness: 'stale', staleReason: reason };

  /** Returns true if something visible changed. */
  function apply<T extends { observedAt: number }>(
    capability: CapabilityName,
    result: ReadResult<T>,
    previous: Slot<T> | null,
    set: (s: Slot<T> | null) => void,
    onObserved: (snapshot: T) => void,
  ): boolean {
    if (result.ok) {
      if (previous?.freshness === 'current' && sameSnapshot(previous.snapshot, result.value)) {
        adapter.perf.increment('duplicateSnapshotsSuppressed');
        return false;
      }
      set({ snapshot: result.value, freshness: 'current', staleReason: null, lastReadAt: now() });
      if (lastReadError?.capability === capability) lastReadError = null;
      onObserved(result.value);
      return true;
    }
    telemetry.track({ type: 'parser_failure', capability, category: result.category });
    lastReadError = { capability, category: result.category, message: sanitizeText(result.message, 200).text, at: now() };
    set(markStale(previous, staleReasonFor(result.category)));
    return true;
  }

  const staleReasonFor = (category: ParserFailureCategory): StaleReason =>
    category === 'PROFILE_MISMATCH' ? 'READS_DISABLED' : 'READ_FAILED';

  const readForContext = (current: EaContextSnapshot): boolean => {
    if (current.kind === 'SBC_CHALLENGE') {
      return apply('sbcReading', adapter.readSbcChallenge(), sbc, (s) => (sbc = s), (snapshot) => bus.publish('SbcSnapshotObserved', { snapshot }));
    }
    if (current.kind === 'CLUB') {
      return apply('clubReading', adapter.readClub(), club, (s) => (club = s), (snapshot) => bus.publish('ClubSnapshotObserved', { snapshot }));
    }
    return false;
  };

  cleanups.push(
    bus.subscribe('ContextChanged', ({ current }) => {
      context = current;
      telemetry.track({ type: 'context_detected', context: current.kind, confidence: current.confidence });
      if (current.kind !== 'SBC_CHALLENGE' && sbc?.freshness === 'current') sbc = markStale(sbc, 'CONTEXT_LEFT');
      if (current.kind !== 'CLUB' && club?.freshness === 'current') club = markStale(club, 'CONTEXT_LEFT');
      readForContext(current);
      push();
    }),
    bus.subscribe('AdapterHealthChanged', ({ health }) => {
      telemetry.track({ type: 'capability_health', capabilities: health.capabilities, safeMode: health.safeMode });
      push();
    }),
  );

  return {
    bus,
    start() {
      cleanups.push(adapter.health.subscribe((health) => bus.publish('AdapterHealthChanged', { health })));
      cleanups.push(
        adapter.observe({
          onContextChange: (current, previous) => bus.publish('ContextChanged', { current, previous }),
          onScopeChange: (current) => {
            if (readForContext(current)) push();
          },
        }),
      );
    },
    stop() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
    refresh() {
      const current = adapter.detectContext();
      if (context?.kind === current.kind) {
        context = current;
        readForContext(current);
        push();
      } else {
        bus.publish('ContextChanged', { current, previous: context });
      }
    },
    current: state,
  };
}
