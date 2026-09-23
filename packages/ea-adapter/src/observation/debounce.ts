export interface TimerHost {
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(id: number | undefined): void;
}

export interface DebouncedTask {
  /** Signal activity; the task runs after `delayMs` of quiet, or at most `maxWaitMs` after the burst began. */
  schedule(): void;
  cancel(): void;
  readonly pending: boolean;
}

/**
 * Trailing debounce with a max-wait bound, so continuous EA animations cannot
 * starve a refresh, and bursts of mutations collapse into one run. `run`
 * receives the timestamp at which the burst started (for latency metrics).
 */
export function createDebouncedTask(
  run: (burstStartedAt: number) => void,
  options: { timers: TimerHost; now: () => number; delayMs: number; maxWaitMs: number },
): DebouncedTask {
  let timer: number | undefined;
  let burstStartedAt: number | null = null;
  const fire = () => {
    timer = undefined;
    const started = burstStartedAt ?? options.now();
    burstStartedAt = null;
    run(started);
  };
  return {
    schedule() {
      const t = options.now();
      burstStartedAt ??= t;
      if (timer !== undefined) options.timers.clearTimeout(timer);
      const untilMax = Math.max(0, burstStartedAt + options.maxWaitMs - t);
      timer = options.timers.setTimeout(fire, Math.min(options.delayMs, untilMax));
    },
    cancel() {
      if (timer !== undefined) options.timers.clearTimeout(timer);
      timer = undefined;
      burstStartedAt = null;
    },
    get pending() {
      return timer !== undefined;
    },
  };
}
