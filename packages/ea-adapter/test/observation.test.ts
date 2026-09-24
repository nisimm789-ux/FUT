import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EaContextSnapshot } from '@fc/contracts';
import { createDebouncedTask, createEaWebAdapter, fc27FixtureProfile, type EaWebAdapter } from '../src/index.js';
import { LIVE_URL, loadFc27 } from './helpers.js';

let adapter: EaWebAdapter;
let contexts: EaContextSnapshot['kind'][];
let rereads: number;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  loadFc27('sbc-challenge.en');
  // Fixture profile: synthetic slots have a known filled signature, so
  // slot-driven observation can be exercised (see live-profile tests below).
  adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, perfNow: () => Date.now(), profiles: [fc27FixtureProfile] });
  contexts = [];
  rereads = 0;
  stop = adapter.observe({ onContextChange: (c) => contexts.push(c.kind), onScopeChange: () => (rereads += 1) });
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

const settle = () => vi.advanceTimersByTimeAsync(400);
const firstRow = () => document.querySelector('.ut-sbc-challenge-requirements-row');

describe('scoped same-page observation', () => {
  it('re-reads once when a player is placed in a slot, and once when removed', async () => {
    const slot = document.querySelector('.ut-item-view.empty');
    slot?.classList.replace('empty', 'player');
    await settle();
    expect(contexts).toEqual(['SBC_CHALLENGE']);
    expect(rereads).toBe(1);
    slot?.classList.replace('player', 'empty');
    await settle();
    expect(rereads).toBe(2);
  });

  it('collapses a burst of relevant mutations into a single re-read', async () => {
    firstRow()?.classList.add('complete');
    const label = document.querySelector('.ut-requirement-label');
    if (label) label.textContent = 'Team Rating: Min. 85';
    document.querySelector('.ut-item-view.empty')?.classList.replace('empty', 'player');
    await settle();
    expect(rereads).toBe(1);
  });

  it('ignores mutations outside the observed scopes', async () => {
    const content = document.querySelector('.ut-content');
    for (let i = 0; i < 50; i += 1) {
      const noise = document.createElement('div');
      content?.append(noise);
      noise.remove();
    }
    await settle();
    expect(rereads).toBe(0);
    const perf = adapter.perf.snapshot();
    expect(perf.counters.rootMutationBatches).toBeGreaterThan(0);
    expect(perf.counters.rereads).toBe(0);
  });

  it('suppresses scoped mutations that do not change the fingerprint', async () => {
    firstRow()?.classList.add('hover-effect');
    firstRow()?.classList.remove('hover-effect');
    firstRow()?.setAttribute('class', `${firstRow()?.getAttribute('class') ?? ''} animating`);
    await settle();
    expect(rereads).toBe(0);
    expect(adapter.perf.snapshot().counters.fingerprintUnchanged).toBeGreaterThan(0);
  });

  it('re-binds when EA re-renders the view with the same state, and keeps observing the new nodes', async () => {
    const view = document.querySelector('.ut-sbc-challenge-requirements-view');
    view?.replaceWith(view.cloneNode(true));
    await settle();
    expect(rereads).toBe(0);
    document.querySelector('.ut-sbc-challenge-requirements-row')?.classList.add('complete');
    await settle();
    expect(rereads).toBe(1);
  });

  it('disposes scoped observation on context change', async () => {
    const detachedRow = firstRow();
    document.querySelector('.ut-sbc-squad-overview-view')?.replaceWith(Object.assign(document.createElement('div'), { className: 'ut-sbc-hub-view' }));
    await settle();
    expect(contexts).toEqual(['SBC_CHALLENGE', 'SBC_HUB']);
    detachedRow?.classList.add('complete');
    await settle();
    expect(rereads).toBe(0);
  });

  it('bounds latency under continuous mutation (max-wait) instead of starving', async () => {
    const label = document.querySelector('.ut-requirement-label');
    let n = 84;
    for (let t = 0; t < 1_500; t += 50) {
      if (label) label.textContent = `Team Rating: Min. ${(n += 1)}`;
      await vi.advanceTimersByTimeAsync(50);
    }
    // Without max-wait a 120 ms debounce would never fire during a 1.5 s stream.
    expect(rereads).toBeGreaterThanOrEqual(1);
    const latency = adapter.perf.snapshot().timings.mutationToRefresh;
    expect(latency.max).toBeLessThanOrEqual(1_000 + 60);
  });

  it('records timings for detection, fingerprinting and refresh latency', async () => {
    document.querySelector('.ut-item-view.empty')?.classList.replace('empty', 'player');
    await settle();
    const { timings, counters } = adapter.perf.snapshot();
    expect(timings.detectContext.count).toBeGreaterThan(0);
    expect(timings.fingerprint.count).toBeGreaterThan(0);
    expect(timings.mutationToRefresh.count).toBeGreaterThan(0);
    expect(counters.scopedMutationBatches).toBeGreaterThan(0);
  });

  it('stops everything on dispose', async () => {
    stop();
    document.querySelector('.ut-item-view.empty')?.classList.replace('empty', 'player');
    await settle();
    expect(rereads).toBe(0);
  });
});

describe('createDebouncedTask', () => {
  it('runs once after quiet time and reports when the burst started', async () => {
    const runs: number[] = [];
    const task = createDebouncedTask((started) => runs.push(started), { timers: window, now: () => Date.now(), delayMs: 100, maxWaitMs: 1_000 });
    const start = Date.now();
    task.schedule();
    await vi.advanceTimersByTimeAsync(50);
    task.schedule();
    expect(task.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    expect(runs).toEqual([start]);
    task.schedule();
    task.cancel();
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toHaveLength(1);
  });
});

describe('live profile while slot occupancy is unverified', () => {
  it('slot DOM changes cannot trigger a false same-page state change', async () => {
    vi.useFakeTimers();
    loadFc27('sbc-challenge-live-empty-pitch.en');
    const live = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, perfNow: () => Date.now() });
    let n = 0;
    const off = live.observe({ onContextChange: () => undefined, onScopeChange: () => (n += 1) });
    for (const item of document.querySelectorAll('.ut-item-view')) item.classList.add('player', 'rare');
    await vi.advanceTimersByTimeAsync(400);
    off();
    expect(n).toBe(0);
    expect(live.perf.snapshot().counters.fingerprintUnchanged).toBeGreaterThan(0);
  });
});
