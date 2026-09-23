import type { ClubSnapshot, EaContextSnapshot, SbcChallengeSnapshot } from '@fc/contracts';
import { createEventBus, type DomainEvents, type EventBus } from '@fc/domain';
import type { EaWebAdapter } from '@fc/ea-adapter';
import type { Telemetry } from '@fc/telemetry';
import type { TabState } from '../messaging/messages.js';

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
  /** Re-detect context and re-run readers for it (e.g. after the user paginated). */
  refresh(): void;
  readonly bus: EventBus<DomainEvents>;
}

/**
 * Orchestrates the READ pipeline inside the page:
 * context change -> run the matching reader -> domain events -> tab state.
 * The last SBC and club snapshots are kept so a user can visit the club, then
 * a challenge, and solve with both. Nothing here can write to EA.
 */
export function createContentController(deps: ContentControllerDeps): ContentController {
  const { adapter, telemetry, now } = deps;
  const bus = deps.bus ?? createEventBus<DomainEvents>();
  let context: EaContextSnapshot | null = null;
  let sbc: SbcChallengeSnapshot | null = null;
  let club: ClubSnapshot | null = null;
  const cleanups: (() => void)[] = [];

  const push = () => {
    if (!context) return;
    deps.publishState({ context, health: adapter.health.snapshot(), sbc, club, updatedAt: now() });
  };

  const readForContext = (current: EaContextSnapshot) => {
    if (current.kind === 'SBC_CHALLENGE') {
      const started = now();
      const result = adapter.readSbcChallenge();
      telemetry.track({ type: 'timing', name: 'read_sbc', ms: now() - started });
      if (result.ok) bus.publish('SbcSnapshotObserved', { snapshot: result.value });
      else telemetry.track({ type: 'parser_failure', capability: 'sbcReading', category: result.category });
    }
    if (current.kind === 'CLUB') {
      const started = now();
      const result = adapter.readClub();
      telemetry.track({ type: 'timing', name: 'read_club', ms: now() - started });
      if (result.ok) bus.publish('ClubSnapshotObserved', { snapshot: result.value });
      else telemetry.track({ type: 'parser_failure', capability: 'clubReading', category: result.category });
    }
  };

  cleanups.push(
    bus.subscribe('ContextChanged', ({ current }) => {
      context = current;
      telemetry.track({ type: 'context_detected', context: current.kind, confidence: current.confidence });
      readForContext(current);
      push();
    }),
    bus.subscribe('SbcSnapshotObserved', ({ snapshot }) => {
      sbc = snapshot;
    }),
    bus.subscribe('ClubSnapshotObserved', ({ snapshot }) => {
      club = snapshot;
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
      cleanups.push(adapter.observeContext((current, previous) => bus.publish('ContextChanged', { current, previous })));
    },
    stop() {
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
    refresh() {
      const current = adapter.detectContext();
      bus.publish('ContextChanged', { current, previous: context });
    },
  };
}
