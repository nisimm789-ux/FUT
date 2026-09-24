import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FIXTURES_ROOT } from '@fc/ea-fixtures';
import { requirementSupport } from '@fc/domain';
import { createEaWebAdapter, fc27FixtureProfile } from '@fc/ea-adapter';
import { solveLocally } from '@fc/solver';
import { noopTelemetry } from '@fc/telemetry';
import { createContentController } from '../src/content/controller.js';
import { TabStateSchema, type TabState } from '../src/messaging/messages.js';
import { buildDemoProblem } from '../src/sidepanel/solve-demo.js';
import { LIVE_URL, loadFc27, loadHtml, loadPage } from './helpers.js';

afterEach(() => vi.useRealTimers());

function setup(url = 'http://localhost:4173/site/', safeModeThreshold?: number, fixtureSlots = false) {
  const states: TabState[] = [];
  const adapter = createEaWebAdapter({
    document,
    window,
    getUrl: () => url,
    now: () => 0,
    perfNow: () => Date.now(),
    ...(safeModeThreshold !== undefined && { safeModeThreshold }),
    ...(fixtureSlots && { profiles: [fc27FixtureProfile] }),
  });
  const controller = createContentController({ adapter, telemetry: noopTelemetry, now: () => 0, publishState: (s) => states.push(TabStateSchema.parse(s)) });
  const last = () => states.at(-1);
  return { controller, states, last, adapter };
}

describe('content controller (Phase 0 behaviour preserved)', () => {
  it('publishes validated tab state with context and health on start', () => {
    loadPage('home');
    const { controller, last } = setup();
    controller.start();
    controller.stop();
    expect(last()?.context.kind).toBe('HOME');
    expect(last()?.health.capabilities.actions).toBe('disabled');
  });

  it('keeps club and SBC snapshots across contexts, marking the one left behind as stale', () => {
    const { controller, last } = setup();
    loadPage('club');
    controller.refresh();
    loadPage('sbc-challenge');
    controller.refresh();
    const state = last();
    expect(state?.context.kind).toBe('SBC_CHALLENGE');
    expect(state?.sbc).toMatchObject({ freshness: 'current', snapshot: { challengeId: 'ch-1001', provenance: 'LOCAL_FIXTURE' } });
    expect(state?.club).toMatchObject({ freshness: 'stale', staleReason: 'CONTEXT_LEFT' });
    const problem = buildDemoProblem({ mode: 'observed-sbc', sbc: state?.sbc?.snapshot ?? null, club: state?.club?.snapshot ?? null, strategy: 'BALANCED' });
    expect(solveLocally(problem, { now: () => 0 }).status).toBe('SOLVED');
  });

  it('bundled demo is always labelled as fixture data', () => {
    const problem = buildDemoProblem({ mode: 'bundled', sbc: null, club: null, strategy: 'MINIMUM_COINS' });
    const result = solveLocally(problem, { now: () => 0 });
    expect(result.status).toBe('SOLVED');
    expect(result.inputProvenance).toEqual({ challenge: 'LOCAL_FIXTURE', candidates: 'LOCAL_FIXTURE' });
  });

  it('does not touch any EA write control', () => {
    loadPage('sbc-challenge');
    const submit = document.querySelector<HTMLButtonElement>('.ut-sbc-submit');
    let clicked = false;
    submit?.addEventListener('click', () => {
      clicked = true;
    });
    const { controller } = setup();
    controller.start();
    controller.refresh();
    controller.stop();
    expect(clicked).toBe(false);
  });
});

describe('content controller on FC 27 structure', () => {
  it('reads a live-origin challenge as EA_WEB_LIVE and a live SBC solve against the demo club is labelled mixed', () => {
    loadFc27('sbc-challenge-supported.en');
    const { controller, last } = setup(LIVE_URL);
    controller.start();
    controller.stop();
    const snapshot = last()?.sbc?.snapshot;
    expect(snapshot?.provenance).toBe('EA_WEB_LIVE');
    const result = solveLocally(buildDemoProblem({ mode: 'observed-sbc', sbc: snapshot ?? null, club: null, strategy: 'BALANCED' }), { now: () => 0 });
    expect(result.inputProvenance).toEqual({ challenge: 'EA_WEB_LIVE', candidates: 'LOCAL_FIXTURE' });
  });

  it('never offers a SOLVED state for a challenge with unverifiable requirements', () => {
    loadFc27('sbc-challenge.en');
    const { controller, last } = setup(LIVE_URL);
    controller.start();
    controller.stop();
    const snapshot = last()?.sbc?.snapshot;
    expect(snapshot?.requirements.filter((r) => !requirementSupport(r).supported).map((r) => r.type)).toEqual(['MIN_COUNT', 'MIN_CHEMISTRY']);
    const result = solveLocally(buildDemoProblem({ mode: 'observed-sbc', sbc: snapshot ?? null, club: null, strategy: 'BALANCED' }), { now: () => 0 });
    expect(result.status).toBe('UNSUPPORTED');
  });

  it('re-reads on meaningful same-page changes and suppresses identical re-reads (known slot signature)', async () => {
    vi.useFakeTimers();
    loadFc27('sbc-challenge.en');
    const { controller, states, last, adapter } = setup(LIVE_URL, undefined, true);
    controller.start();
    const initial = states.length;
    expect(last()?.sbc?.snapshot.filledSlots).toBe(4);

    document.querySelector('.ut-item-view.empty')?.classList.replace('empty', 'player');
    await vi.advanceTimersByTimeAsync(400);
    expect(last()?.sbc?.snapshot.filledSlots).toBe(5);
    const afterChange = states.length;
    expect(afterChange).toBe(initial + 1);

    // Same state re-rendered by EA: fingerprint equal -> no read, no publish.
    const view = document.querySelector('.ut-sbc-challenge-requirements-view');
    view?.replaceWith(view.cloneNode(true));
    await vi.advanceTimersByTimeAsync(400);
    expect(states.length).toBe(afterChange);
    // A forced refresh re-reads, but an identical snapshot is not re-published as new data.
    controller.refresh();
    expect(adapter.perf.snapshot().counters.duplicateSnapshotsSuppressed).toBeGreaterThan(0);
    controller.stop();
  });

  it('live profile: placing players publishes nothing new while occupancy is unknown', async () => {
    vi.useFakeTimers();
    loadFc27('sbc-challenge-live-empty-pitch.en');
    const { controller, states, last } = setup(LIVE_URL);
    controller.start();
    const before = states.length;
    expect(last()?.sbc?.snapshot).toMatchObject({ squadSize: 11, filledSlots: null, provenance: 'EA_WEB_LIVE' });
    for (const item of document.querySelectorAll('.ut-item-view')) item.classList.add('player');
    await vi.advanceTimersByTimeAsync(400);
    controller.stop();
    expect(states.length).toBe(before);
  });

  it('real captured pitch: place/remove a player publishes exactly one snapshot each (0 -> 1 -> 0), none for unchanged DOM', async () => {
    vi.useFakeTimers();
    loadHtml(readFileSync(join(FIXTURES_ROOT, 'captured', 'fc27-sbc-bronze11-empty.en.html'), 'utf8'));
    const { controller, states, last } = setup(LIVE_URL);
    controller.start();
    expect(last()?.sbc?.snapshot).toMatchObject({ filledSlots: 0, provenance: 'EA_WEB_LIVE' });
    const before = states.length;
    const card = document.querySelectorAll('.ut-squad-slot-view')[9]?.querySelector(':scope > .item.player');
    card?.classList.replace('ut-item-loading', 'ut-item-loaded');
    await vi.advanceTimersByTimeAsync(600);
    expect(states.length).toBe(before + 1);
    expect(last()?.sbc?.snapshot.filledSlots).toBe(1);
    card?.classList.replace('ut-item-loaded', 'ut-item-loading');
    await vi.advanceTimersByTimeAsync(600);
    expect(states.length).toBe(before + 2);
    expect(last()?.sbc?.snapshot.filledSlots).toBe(0);
    card?.classList.add('hover');
    await vi.advanceTimersByTimeAsync(600);
    controller.stop();
    expect(states.length).toBe(before + 2);
  });

  it('keeps the last snapshot but marks it stale (never fabricates) when a re-read fails', () => {
    loadFc27('sbc-challenge.en');
    const { controller, last } = setup(LIVE_URL);
    controller.start();
    controller.stop();
    const good = last()?.sbc?.snapshot;
    document.querySelector('.ut-sbc-challenge-requirements-list')?.replaceChildren();
    controller.refresh();
    expect(last()?.sbc).toMatchObject({ freshness: 'stale', staleReason: 'READ_FAILED', snapshot: good });
    expect(last()?.lastReadError).toMatchObject({ capability: 'sbcReading', category: 'STRUCTURE_NOT_FOUND' });
    expect(last()?.health.capabilities.sbcReading).toBe('degraded');
  });

  it('marks data stale with READS_DISABLED once SAFE_MODE engages', () => {
    loadFc27('sbc-challenge.en');
    const { controller, last } = setup(LIVE_URL, 2);
    controller.start();
    controller.stop();
    document.querySelector('.ut-sbc-challenge-requirements-list')?.replaceChildren();
    controller.refresh();
    controller.refresh();
    expect(last()?.health.safeMode).toBe(true);
    loadFc27('sbc-challenge.en');
    controller.refresh();
    expect(last()?.sbc).toMatchObject({ freshness: 'stale', staleReason: 'READS_DISABLED' });
    expect(last()?.lastReadError?.category).toBe('PROFILE_MISMATCH');
  });

  it('produces no snapshot at all when the first read fails', () => {
    loadFc27('sbc-challenge-no-requirements');
    const { controller, last } = setup(LIVE_URL);
    controller.start();
    controller.stop();
    expect(last()?.context.kind).toBe('SBC_CHALLENGE');
    expect(last()?.sbc).toBeNull();
    expect(last()?.lastReadError?.category).toBe('STRUCTURE_NOT_FOUND');
  });

  it('carries perf numbers in the published state', () => {
    loadFc27('sbc-challenge.en');
    const { controller, last } = setup(LIVE_URL);
    controller.start();
    controller.stop();
    expect(last()?.perf.timings.readSbc.count).toBeGreaterThan(0);
    expect(last()?.perf.timings.detectContext.count).toBeGreaterThan(0);
  });
});
