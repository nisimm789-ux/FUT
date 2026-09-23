import type {
  AdapterHealth,
  ClubSnapshot,
  EaContextSnapshot,
  SbcChallengeSnapshot,
  SolveProblem,
  SolveResult,
} from '@fc/contracts';

/** Catalogue of domain events. Payloads are normalized contracts only. */
export interface DomainEvents {
  ContextChanged: { previous: EaContextSnapshot | null; current: EaContextSnapshot };
  AdapterHealthChanged: { health: AdapterHealth };
  SbcSnapshotObserved: { snapshot: SbcChallengeSnapshot };
  ClubSnapshotObserved: { snapshot: ClubSnapshot };
  SolveRequested: { requestId: string; problem: SolveProblem };
  SolveCompleted: { requestId: string; result: SolveResult };
}

export type Handler<P> = (payload: P) => void;

export interface EventBus<E extends object> {
  publish<K extends keyof E>(type: K, payload: E[K]): void;
  /** Returns an unsubscribe function. */
  subscribe<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void;
}

/**
 * Minimal synchronous, in-process typed event bus. A throwing handler is
 * isolated (reported via `onHandlerError`) so one faulty subscriber cannot
 * break delivery to the others.
 */
export function createEventBus<E extends object = DomainEvents>(
  onHandlerError: (type: keyof E, error: unknown) => void = () => undefined,
): EventBus<E> {
  const handlers = new Map<keyof E, Set<Handler<never>>>();

  return {
    publish(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      for (const handler of [...set]) {
        try {
          (handler as Handler<typeof payload>)(payload);
        } catch (error) {
          onHandlerError(type, error);
        }
      }
    },
    subscribe(type, handler) {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler as Handler<never>);
      return () => {
        set.delete(handler as Handler<never>);
      };
    },
  };
}
