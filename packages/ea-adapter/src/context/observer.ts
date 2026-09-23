import type { EaContextSnapshot } from '@fc/contracts';

export interface ContextObserverOptions {
  detect: () => EaContextSnapshot;
  onChange: (current: EaContextSnapshot, previous: EaContextSnapshot | null) => void;
  /** Subtree to watch; the EA app replaces view subtrees on navigation. */
  target: Node;
  win: Pick<Window, 'addEventListener' | 'removeEventListener' | 'setTimeout' | 'clearTimeout'>;
  MutationObserverCtor?: typeof MutationObserver;
  debounceMs?: number;
}

/**
 * Observes SPA navigation (history events + DOM mutations), debounces bursts,
 * re-runs detection and emits only when the detected context actually changes.
 */
export function observeContext(options: ContextObserverOptions): () => void {
  const { detect, onChange, target, win, debounceMs = 150 } = options;
  const Ctor = options.MutationObserverCtor ?? globalThis.MutationObserver;
  let previous: EaContextSnapshot | null = null;
  let timer: number | undefined;
  let stopped = false;

  const run = () => {
    timer = undefined;
    if (stopped) return;
    const current = detect();
    if (!previous || previous.kind !== current.kind || previous.profileId !== current.profileId) {
      const before = previous;
      previous = current;
      onChange(current, before);
    }
  };
  const schedule = () => {
    if (timer !== undefined) win.clearTimeout(timer);
    timer = win.setTimeout(run, debounceMs);
  };

  const mutationObserver = new Ctor(schedule);
  mutationObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  win.addEventListener('hashchange', schedule);
  win.addEventListener('popstate', schedule);
  run();

  return () => {
    stopped = true;
    if (timer !== undefined) win.clearTimeout(timer);
    mutationObserver.disconnect();
    win.removeEventListener('hashchange', schedule);
    win.removeEventListener('popstate', schedule);
  };
}
