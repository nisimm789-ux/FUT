import { PERF_COUNTERS, PERF_TIMINGS } from '@fc/contracts';
import type { AdapterPerf, TimingStat } from '@fc/contracts';

export type PerfTiming = (typeof PERF_TIMINGS)[number];
export type PerfCounter = (typeof PERF_COUNTERS)[number];

export interface PerfTracker {
  record(name: PerfTiming, ms: number): void;
  increment(name: PerfCounter): void;
  /** Time a synchronous function. */
  measure<T>(name: PerfTiming, fn: () => T): T;
  snapshot(): AdapterPerf;
}

/** Lightweight in-memory stats (count/last/avg/max). Numbers only. */
export function createPerfTracker(now: () => number): PerfTracker {
  const timings = new Map<PerfTiming, TimingStat>();
  const counters = new Map<PerfCounter, number>();

  const record = (name: PerfTiming, ms: number) => {
    const value = Math.max(0, ms);
    const prev = timings.get(name) ?? { count: 0, last: 0, avg: 0, max: 0 };
    const count = prev.count + 1;
    timings.set(name, { count, last: value, avg: prev.avg + (value - prev.avg) / count, max: Math.max(prev.max, value) });
  };

  return {
    record,
    increment: (name) => counters.set(name, (counters.get(name) ?? 0) + 1),
    measure(name, fn) {
      const started = now();
      try {
        return fn();
      } finally {
        record(name, now() - started);
      }
    },
    snapshot() {
      const round = (n: number) => Math.round(n * 100) / 100;
      const t = {} as AdapterPerf['timings'];
      for (const name of PERF_TIMINGS) {
        const s = timings.get(name) ?? { count: 0, last: 0, avg: 0, max: 0 };
        t[name] = { count: s.count, last: round(s.last), avg: round(s.avg), max: round(s.max) };
      }
      const c = {} as AdapterPerf['counters'];
      for (const name of PERF_COUNTERS) c[name] = counters.get(name) ?? 0;
      return { timings: t, counters: c };
    },
  };
}
