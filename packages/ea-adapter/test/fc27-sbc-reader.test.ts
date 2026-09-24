import { describe, expect, it } from 'vitest';
import { CONTRACTS_VERSION, SbcChallengeSnapshotSchema, type SbcChallengeSnapshot } from '@fc/contracts';
import { loadClubFixture } from '@fc/ea-fixtures';
import { LocalSolverRuntime } from '@fc/solver';
import { DEFAULT_PROFILES, createEaWebAdapter, fc27FixtureProfile, type EaWebAdapter } from '../src/index.js';
import { LIVE_URL, LOCAL_URL, loadFc27 } from './helpers.js';

const adapterAt = (url: string, extra: { safeModeThreshold?: number; fixtureSlots?: boolean } = {}): EaWebAdapter =>
  createEaWebAdapter({
    document,
    window,
    getUrl: () => url,
    now: () => 1_000,
    ...(extra.safeModeThreshold !== undefined && { safeModeThreshold: extra.safeModeThreshold }),
    // Fixture profile: our synthetic slot markup has a KNOWN filled signature.
    ...(extra.fixtureSlots && { profiles: [fc27FixtureProfile] }),
  });

function readOk(url = LIVE_URL, fixtureSlots = false): SbcChallengeSnapshot {
  const result = adapterAt(url, { fixtureSlots }).readSbcChallenge();
  if (!result.ok) throw new Error(`${result.category}: ${result.message}`);
  return result.value;
}

const EXPECTED_REQUIREMENTS = [
  { id: 'req-1', via: 'text', type: 'MIN_SQUAD_RATING', value: 84 },
  { id: 'req-2', via: 'text', type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } },
  { id: 'req-3', via: 'text', type: 'MIN_CHEMISTRY', value: 24 },
  { id: 'req-4', via: 'text', type: 'MIN_COUNT', count: 2, filter: { rarities: ['RARE'] } },
  { id: 'req-5', via: 'text', type: 'MAX_SAME', dimension: 'club', count: 3 },
  { id: 'req-6', via: 'text', type: 'MIN_UNIQUE', dimension: 'league', count: 3 },
  { id: 'req-7', via: 'text', type: 'MIN_COUNT', count: 1, filter: { nationIds: [14] } },
  { id: 'req-8', via: 'text', type: 'SQUAD_SIZE', count: 11 },
];

describe('FC 27 candidate SBC reader', () => {
  it.each(['en', 'de', 'fr', 'es'] as const)('normalizes the %s challenge identically', (lang) => {
    loadFc27(`sbc-challenge.${lang}`);
    const snapshot = readOk();
    expect(SbcChallengeSnapshotSchema.parse(snapshot)).toBeTruthy();
    expect(snapshot.requirements).toEqual(EXPECTED_REQUIREMENTS);
    expect(snapshot).toMatchObject({
      schemaVersion: CONTRACTS_VERSION,
      squadSize: 11,
      // Live profile has no verified occupancy signature: unknown, not guessed.
      filledSlots: null,
      interpretationLocale: lang,
      name: 'Synthetic Upgrade 84',
      challengeIdKind: 'LOCAL_FINGERPRINT',
      observedAt: 1_000,
      adapter: { adapterVersion: '0.2.0', profileId: 'fc27-live', profileVerified: false },
    });
  });

  it('labels data EA_WEB_LIVE only on the real EA origin', () => {
    loadFc27('sbc-challenge.en');
    expect(readOk(LIVE_URL).provenance).toBe('EA_WEB_LIVE');
    expect(readOk(LOCAL_URL).provenance).toBe('LOCAL_FIXTURE');
    expect(readOk('https://www.ea.com.evil.example/ea-sports-fc/ultimate-team/web-app/').provenance).toBe('LOCAL_FIXTURE');
  });

  it('derives a stable local identity that ignores slot changes but not requirement changes', () => {
    loadFc27('sbc-challenge.en');
    const a = readOk(LIVE_URL, true);
    expect(a.filledSlots).toBe(4);
    document.querySelector('.ut-item-view.empty')?.classList.replace('empty', 'player');
    const b = readOk(LIVE_URL, true);
    expect(b.filledSlots).toBe(5);
    expect(b.challengeId).toBe(a.challengeId);
    expect(a.challengeId).toMatch(/^local-[0-9a-f]{8}$/);
    const label = document.querySelector('.ut-requirement-label');
    if (label) label.textContent = 'Team Rating: Min. 85';
    expect(readOk().challengeId).not.toBe(a.challengeId);
  });

  it('derives squad size from active (non-locked) slots when no size requirement exists', () => {
    loadFc27('sbc-challenge-seven.en');
    expect(readOk()).toMatchObject({ squadSize: 7, filledSlots: null });
    expect(readOk(LIVE_URL, true)).toMatchObject({ squadSize: 7, filledSlots: 2 });
  });

  describe('slot occupancy (tri-state, from the live empty / one-player capture pair)', () => {
    const slotHtml = (itemClasses: string, extra = '') =>
      `<div class="ut-squad-slot-view"><div class="ut-squad-slot-pedestal-view"></div><div class="item ut-squad-slot-chemistry-points-view"></div><div class="${itemClasses}"><div class="ut-item-view"><div class="empty"></div></div></div>${extra}</div>`;
    const EMPTY = 'droppable empty has-chemistry-breakdown item player small ut-item-loading';
    const FILLED = 'animatereplace common draggable droppable has-chemistry-breakdown item player small ut-item-loaded';
    function pitchWith(slots: string[]) {
      loadFc27('sbc-challenge-live-empty-pitch.en');
      const pitch = document.querySelector('.ut-squad-pitch-view');
      if (pitch) pitch.innerHTML = slots.join('');
    }
    const read = () => {
      const result = adapterAt(LIVE_URL).readSbcChallenge();
      if (!result.ok) throw new Error(result.message);
      return result;
    };

    it('11 empty (ut-item-loading) slots -> filledSlots 0', () => {
      pitchWith(Array.from({ length: 11 }, () => slotHtml(EMPTY)));
      expect(read().value).toMatchObject({ squadSize: 11, filledSlots: 0 });
    });

    it('one ut-item-loaded slot -> filledSlots 1 (descendant .empty inside a filled card is ignored)', () => {
      pitchWith(Array.from({ length: 11 }, (_, i) => slotHtml(i === 9 ? FILLED : EMPTY)));
      expect(read().value.filledSlots).toBe(1);
    });

    it('contradictory loaded + loading on one container -> UNKNOWN -> filledSlots null, with a diagnostic', () => {
      pitchWith(Array.from({ length: 11 }, (_, i) => slotHtml(i === 3 ? `${EMPTY} ut-item-loaded` : EMPTY)));
      const result = read();
      expect(result.value.filledSlots).toBeNull();
      expect(result.warnings?.join(' ')).toContain('slot 3: contradictory occupancy classes (ut-item-loaded + ut-item-loading)');
    });

    it('a slot with neither state class -> UNKNOWN -> filledSlots null (never a partial count)', () => {
      pitchWith(Array.from({ length: 11 }, (_, i) => slotHtml(i === 0 ? 'item player small' : i < 5 ? FILLED : EMPTY)));
      const result = read();
      expect(result.value.filledSlots).toBeNull();
      expect(result.warnings?.join(' ')).toContain('slot occupancy unknown for 1 of 11 active slots');
    });

    it('more than one occupancy container in a slot -> UNKNOWN', () => {
      pitchWith(Array.from({ length: 11 }, (_, i) => slotHtml(EMPTY, i === 2 ? `<div class="${FILLED}"></div>` : '')));
      expect(read().value.filledSlots).toBeNull();
    });

    it('does not infer occupancy from .ut-item-view, state-positioned or draggable alone', () => {
      pitchWith(
        Array.from({ length: 11 }, () =>
          '<div class="ut-squad-slot-view"><div class="ut-squad-slot-pedestal-view state-positioned"></div><div class="item player draggable"><div class="ut-item-view"></div></div></div>',
        ),
      );
      expect(read().value.filledSlots).toBeNull();
    });

    it('an unrecognised pitch structure (e.g. the pre-evidence hand fixture) stays unknown', () => {
      loadFc27('sbc-challenge-live-empty-pitch.en');
      const result = read();
      expect(result.value).toMatchObject({ squadSize: 11, filledSlots: null });
      expect(result.value.requirements).toEqual([
        { id: 'req-1', via: 'text', type: 'PLAYER_QUALITY', min: 'BRONZE', max: 'BRONZE' },
        { id: 'req-2', via: 'text', type: 'SQUAD_SIZE', count: 11 },
      ]);
    });

    it('profile: evidence-based occupancy signature verified, whole profile still unverified', () => {
      const live = DEFAULT_PROFILES.find((p) => p.id === 'fc27-live');
      expect(live?.sbc?.slots?.occupancy).toEqual({ container: ':scope > .item.player', filledClass: 'ut-item-loaded', emptyClass: 'ut-item-loading' });
      expect(live?.sbc?.slots?.filled).toBeUndefined();
      expect(live?.signatures?.['sbc:slotFilled']).toBe('verified');
      expect(live?.verified).toBe(false);
      expect(live?.signatures?.['sbc:slotLocked']).toBe('unverified');
      expect(DEFAULT_PROFILES.map((p) => p.id)).not.toContain('fc27-fixture');
      loadFc27('sbc-challenge-live-empty-pitch.en');
      expect(adapterAt(LIVE_URL).health.snapshot().profileSignatures['sbc:slotFilled']).toBe('verified');
    });
  });

  describe('failure behaviour (fail closed, no fabricated snapshot)', () => {
    it.each([
      ['sbc-challenge-no-requirements', 'STRUCTURE_NOT_FOUND'],
      ['sbc-challenge-no-squad-size', 'FIELD_MISSING'],
      ['sbc-challenge-inconsistent', 'CONTRACT_VALIDATION_FAILED'],
    ] as const)('%s -> %s, capability degraded', (page, category) => {
      loadFc27(page);
      const adapter = adapterAt(LIVE_URL);
      expect(adapter.readSbcChallenge()).toMatchObject({ ok: false, category });
      expect(adapter.health.snapshot().capabilities.sbcReading).toBe('degraded');
      expect(adapter.health.snapshot().lastFailure).toMatchObject({ capability: 'sbcReading', category });
    });

    it('treats a changed EA selector as STRUCTURE_NOT_FOUND', () => {
      loadFc27('sbc-challenge.en');
      document.querySelector('.ut-sbc-challenge-requirements-view')?.classList.replace('ut-sbc-challenge-requirements-view', 'ut-sbc-objectives-view');
      expect(adapterAt(LIVE_URL).readSbcChallenge()).toMatchObject({ ok: false, category: 'STRUCTURE_NOT_FOUND' });
    });

    it('rejects an implausible number of requirement rows', () => {
      loadFc27('sbc-challenge.en');
      const list = document.querySelector('.ut-sbc-challenge-requirements-list');
      for (let i = 0; i < 20; i += 1) list?.append(document.createElement('li'));
      expect(adapterAt(LIVE_URL).readSbcChallenge()).toMatchObject({ ok: false, category: 'VALUE_OUT_OF_RANGE' });
    });

    it('escalates to SAFE_MODE after the configured number of consecutive failures, then refuses to read', () => {
      loadFc27('sbc-challenge-no-requirements');
      const adapter = adapterAt(LIVE_URL, { safeModeThreshold: 2 });
      adapter.readSbcChallenge();
      expect(adapter.health.snapshot().safeMode).toBe(false);
      adapter.readSbcChallenge();
      expect(adapter.health.snapshot()).toMatchObject({ safeMode: true, capabilities: { sbcReading: 'disabled', actions: 'disabled' } });
      // SAFE_MODE disables reading, not context detection: the UI can still explain what is going on.
      expect(adapter.health.snapshot().capabilities.contextDetection).not.toBe('disabled');
      loadFc27('sbc-challenge.en');
      expect(adapter.readSbcChallenge()).toMatchObject({ ok: false, category: 'PROFILE_MISMATCH' });
      expect(adapter.health.snapshot().recentFailures).toHaveLength(2);
    });

    it('a successful read resets the consecutive-failure count', () => {
      const adapter = adapterAt(LIVE_URL, { safeModeThreshold: 2 });
      loadFc27('sbc-challenge-no-requirements');
      adapter.readSbcChallenge();
      loadFc27('sbc-challenge.en');
      expect(adapter.readSbcChallenge().ok).toBe(true);
      loadFc27('sbc-challenge-no-requirements');
      adapter.readSbcChallenge();
      expect(adapter.health.snapshot().safeMode).toBe(false);
    });
  });

  it('reports profile verification state in health', () => {
    loadFc27('sbc-challenge.en');
    const adapter = adapterAt(LIVE_URL);
    adapter.readSbcChallenge();
    expect(adapter.health.snapshot()).toMatchObject({ profileId: 'fc27-live', profileVerified: false, capabilities: { sbcReading: 'healthy', clubReading: 'unsupported' } });
  });
});

describe('FC 27 pipeline: page -> adapter -> snapshot -> solver', () => {
  const solve = (snapshot: SbcChallengeSnapshot) =>
    new LocalSolverRuntime({ now: () => 0 }).solve({
      schemaVersion: CONTRACTS_VERSION,
      challenge: snapshot,
      candidates: loadClubFixture().items,
      candidatesProvenance: 'LOCAL_FIXTURE',
      options: { strategy: 'BALANCED', protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
    });

  it('solves a challenge whose requirements are all verifiable', async () => {
    loadFc27('sbc-challenge-supported.en');
    const result = await solve(readOk());
    expect(result.status).toBe('SOLVED');
    expect(result.inputProvenance).toEqual({ challenge: 'EA_WEB_LIVE', candidates: 'LOCAL_FIXTURE' });
  });

  it.each(['sbc-challenge.en', 'sbc-challenge-unknown.en'] as const)('%s (TOTW / chemistry / unknown) is UNSUPPORTED, never SOLVED', async (page) => {
    loadFc27(page);
    const result = await solve(readOk());
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.selected).toEqual([]);
    expect(result.unsupportedRequirementIds.length).toBeGreaterThan(0);
  });
});
