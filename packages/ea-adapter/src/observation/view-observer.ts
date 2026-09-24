import type { EaContextKind, EaContextSnapshot } from '@fc/contracts';
import type { PerfTracker } from '../perf.js';
import { createDebouncedTask, type TimerHost } from './debounce.js';

export interface ViewObserverOptions {
  doc: Document;
  win: TimerHost & Pick<Window, 'addEventListener' | 'removeEventListener'>;
  now: () => number;
  perf: PerfTracker;
  detect: () => EaContextSnapshot;
  /** Elements whose subtrees hold the state relevant to this context (may be empty). */
  scopesFor: (kind: EaContextKind) => Element[];
  /** Cheap structural fingerprint of the relevant state, or null if absent. */
  fingerprint: (kind: EaContextKind) => string | null;
  onContextChange: (current: EaContextSnapshot, previous: EaContextSnapshot | null) => void;
  /** Same context, but its relevant structure changed meaningfully. */
  onScopeChange: (current: EaContextSnapshot) => void;
  /**
   * False while the relevant state is mid-transition (e.g. a card being swapped
   * into a slot). The re-check is postponed ONCE by `settleMs`; if still
   * unsettled then, the read proceeds and reports unknown values honestly.
   */
  isSettled?: (kind: EaContextKind) => boolean;
  settleMs?: number;
  MutationObserverCtor?: typeof MutationObserver;
  rootDebounceMs?: number;
  scopeDebounceMs?: number;
  maxWaitMs?: number;
}

/**
 * Two-level, bounded observation of the EA SPA:
 *
 * 1. Root watcher: childList mutations anywhere (no attributes, no text) →
 *    debounce → re-run context detection (a handful of querySelector calls).
 *    Emits onContextChange only when the context really changes.
 * 2. Scoped watcher: attached only to the current context's relevant
 *    subtrees (e.g. SBC requirements + pitch), watching childList, class/src
 *    attributes and text → debounce → fingerprint → compare → onScopeChange
 *    only if the fingerprint differs. Disposed and re-bound on every context
 *    change or when EA replaces the scoped element.
 *
 * Nothing re-parses the whole document per mutation, and readers/solver never
 * run from here directly — the caller decides what to re-read.
 */
export function observeView(options: ViewObserverOptions): () => void {
  const { doc, win, now, perf } = options;
  const Ctor = options.MutationObserverCtor ?? globalThis.MutationObserver;
  let context: EaContextSnapshot | null = null;
  let scopes: Element[] = [];
  let lastFingerprint: string | null = null;
  let stopped = false;
  let scopedObserver: MutationObserver | null = null;
  let settleTimer: number | undefined;
  let deferred = false;
  const clearSettle = () => {
    if (settleTimer !== undefined) win.clearTimeout(settleTimer);
    settleTimer = undefined;
  };

  const sameScopes = (next: Element[]) => next.length === scopes.length && next.every((el, i) => el === scopes[i]);

  const bindScopes = () => {
    scopedObserver?.disconnect();
    scopedObserver = null;
    scopes = context ? options.scopesFor(context.kind) : [];
    if (scopes.length === 0) return;
    scopedObserver = new Ctor(() => {
      perf.increment('scopedMutationBatches');
      clearSettle();
      scopeTask.schedule();
    });
    for (const el of scopes) {
      scopedObserver.observe(el, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'src'] });
    }
  };

  const currentFingerprint = () => (context ? perf.measure('fingerprint', () => options.fingerprint(context?.kind ?? 'UNKNOWN')) : null);

  const checkScope = (burstStartedAt: number) => {
    if (stopped || !context) return;
    clearSettle();
    if (!deferred && options.isSettled && !options.isSettled(context.kind)) {
      deferred = true;
      perf.increment('unstableDeferrals');
      settleTimer = win.setTimeout(() => checkScope(burstStartedAt), options.settleMs ?? 400);
      return;
    }
    deferred = false;
    const fp = currentFingerprint();
    if (fp === null || fp === lastFingerprint) {
      perf.increment('fingerprintUnchanged');
      return;
    }
    lastFingerprint = fp;
    perf.increment('rereads');
    options.onScopeChange(context);
    perf.record('mutationToRefresh', now() - burstStartedAt);
  };

  const rootTick = (burstStartedAt: number) => {
    if (stopped) return;
    perf.increment('ticks');
    const current = perf.measure('detectContext', options.detect);
    if (!context || context.kind !== current.kind || context.profileId !== current.profileId) {
      const previous = context;
      context = current;
      bindScopes();
      lastFingerprint = currentFingerprint();
      options.onContextChange(current, previous);
      perf.record('mutationToRefresh', now() - burstStartedAt);
      return;
    }
    // Same context: EA may have re-rendered the view, replacing our scoped nodes.
    const next = options.scopesFor(current.kind);
    if (!sameScopes(next)) {
      bindScopes();
      checkScope(burstStartedAt);
    }
  };

  const timers = { timers: win, now };
  const rootTask = createDebouncedTask(rootTick, { ...timers, delayMs: options.rootDebounceMs ?? 150, maxWaitMs: options.maxWaitMs ?? 1000 });
  const scopeTask = createDebouncedTask(checkScope, { ...timers, delayMs: options.scopeDebounceMs ?? 120, maxWaitMs: options.maxWaitMs ?? 1000 });

  const rootObserver = new Ctor(() => {
    perf.increment('rootMutationBatches');
    rootTask.schedule();
  });
  rootObserver.observe(doc.documentElement, { childList: true, subtree: true });
  const onNavigation = () => rootTask.schedule();
  win.addEventListener('hashchange', onNavigation);
  win.addEventListener('popstate', onNavigation);
  rootTick(now());

  return () => {
    stopped = true;
    rootTask.cancel();
    scopeTask.cancel();
    clearSettle();
    rootObserver.disconnect();
    scopedObserver?.disconnect();
    win.removeEventListener('hashchange', onNavigation);
    win.removeEventListener('popstate', onNavigation);
  };
}
