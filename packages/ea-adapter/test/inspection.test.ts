import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT } from '@fc/ea-fixtures';
import { InspectionReportSchema, type InspectionReport } from '@fc/contracts';
import { createEaWebAdapter, fc27FixtureProfile, findSensitiveContent, inspectCurrentScreen, reportToFixtureHtml } from '../src/index.js';
import { LIVE_URL, loadFc27, loadHtml } from './helpers.js';

const SECRETS = {
  email: 'jane.doe@example.com',
  persona: 'PersonaNameXYZ',
  typed: 'typed-by-user-42',
  password: 'hunter2hunter2',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig',
  cookie: 'cookieSecretValue',
  storage: 'storageSecretValue',
  query: 'QuerySecretValue',
  clubName: 'My Private Club FC',
};

function inspect(url = LIVE_URL): InspectionReport {
  const adapter = createEaWebAdapter({ document, window, getUrl: () => url, now: () => 0 });
  const result = inspectCurrentScreen({ adapter, document, url, extensionVersion: '0.2.0', now: 0 });
  if (!result.ok) throw new Error(`${result.reason}: ${result.details.join('; ')}`);
  return result.report;
}

function plantSecrets() {
  const header = document.querySelector('.ut-navigation-bar-view');
  header?.insertAdjacentHTML(
    'beforeend',
    `<div class="ut-club-info"><span class="persona">${SECRETS.persona}</span><span class="club-name">${SECRETS.clubName}</span><a href="mailto:${SECRETS.email}">${SECRETS.email}</a></div>
     <form><input type="password" value="${SECRETS.password}"><input type="text" value="${SECRETS.typed}"><textarea>${SECRETS.typed}</textarea></form>
     <div data-token="${SECRETS.jwt}" data-user="${SECRETS.persona}"></div>`,
  );
  document.cookie = `x-ut-sid=${SECRETS.cookie}`;
  localStorage.setItem('session', SECRETS.storage);
}

describe('inspection mode', () => {
  it('produces a schema-valid structural report of an SBC screen', () => {
    loadFc27('sbc-challenge.de');
    const report = inspect();
    expect(InspectionReportSchema.parse(report)).toBeTruthy();
    expect(report.context).toMatchObject({ kind: 'SBC_CHALLENGE', confidence: 'high' });
    expect(report.meta).toMatchObject({ profileId: 'fc27-live', profileVerified: false, fcVersion: 'FC27' });
    expect(report.document.lang).toBe('de');
    expect(report.sbc.rootFound).toBe(true);
    expect(report.sbc.slots).toEqual({ total: 11, filled: null, locked: 0 });
    expect(report.sbc.pitchFound).toBe(true);
    expect(report.sbc.slotDetails).toHaveLength(11);
    expect(report.meta.signatures['sbc:slotFilled']).toBe('verified');
    // Synthetic fc27 markup lacks the live occupancy classes -> UNKNOWN, never guessed.
    expect(new Set(report.sbc.slotDetails.map((s) => s.occupancy))).toEqual(new Set(['UNKNOWN']));
    expect(report.sbc.requirementRows.map((r) => r.interpretedAs)).toEqual([
      'MIN_SQUAD_RATING', 'MIN_COUNT', 'MIN_CHEMISTRY', 'MIN_COUNT', 'MAX_SAME', 'MIN_UNIQUE', 'MIN_COUNT', 'SQUAD_SIZE',
    ]);
    expect(report.sbc.requirementRows[6]?.assets).toEqual([{ kind: 'nation', id: 14 }]);
    expect(report.navigation.find((n) => n.selected)?.classes).toContain('icon-sbc');
    expect(report.views.map((v) => v.className)).toContain('ut-sbc-challenge-requirements-view');
    expect(report.candidates.length).toBeGreaterThan(0);
    expect(report.readerDiagnostics.sbc).toMatchObject({ ok: true, unknownCount: 0 });
  });

  it('never exports cookies, storage, input values, account text, attribute values or query values', () => {
    loadFc27('sbc-challenge.en');
    plantSecrets();
    const report = inspect(`${LIVE_URL}?token=${SECRETS.query}&lang=en#/sbc/123456789`);
    const json = JSON.stringify(report);
    for (const [name, secret] of Object.entries(SECRETS)) expect(json, name).not.toContain(secret);
    expect(report.location).toEqual({ origin: 'https://www.ea.com', path: '/ea-sports-fc/ultimate-team/web-app/', route: '/sbc/:id', queryKeys: ['lang', 'token'] });
    expect(report.safety.neverCollected).toEqual(expect.arrayContaining(['cookies', 'web storage', 'input values', 'full HTML', 'account identifiers']));
    expect(findSensitiveContent(json)).toEqual([]);
  });

  it('sanitizes text inside requirement rows and counts redactions', () => {
    loadFc27('sbc-challenge.en');
    const label = document.querySelector('.ut-requirement-label');
    if (label) label.textContent = `Team Rating: Min. 84 ${SECRETS.email} 1234567890`;
    const report = inspect();
    expect(report.sbc.requirementRows[0]?.text).toBe('Team Rating: Min. 84 [email] [n]');
    expect(report.safety.redactions).toBeGreaterThan(0);
  });

  it('blocks export when sensitive-looking content survives sanitization', () => {
    loadFc27('sbc-challenge.en');
    const label = document.querySelector('.ut-requirement-label');
    if (label) label.textContent = 'Enter your password to continue';
    const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0 });
    const result = inspectCurrentScreen({ adapter, document, url: LIVE_URL, extensionVersion: '0.2.0', now: 0 });
    expect(result).toMatchObject({ ok: false, reason: 'SENSITIVE_CONTENT_DETECTED' });
  });

  it('is deterministic apart from meta.generatedAt', () => {
    loadFc27('sbc-challenge.fr');
    const a = inspect();
    const b = inspect();
    expect({ ...b, meta: { ...b.meta, generatedAt: a.meta.generatedAt } }).toEqual(a);
  });

  it('does not affect adapter health (diagnostic dry read)', () => {
    loadFc27('sbc-challenge-no-requirements');
    const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0 });
    const before = adapter.health.snapshot().capabilities.sbcReading;
    const result = inspectCurrentScreen({ adapter, document, url: LIVE_URL, extensionVersion: '0.2.0', now: 0 });
    expect(result.ok && result.report.readerDiagnostics.sbc).toMatchObject({ ok: false, category: 'STRUCTURE_NOT_FOUND' });
    expect(adapter.health.snapshot().capabilities.sbcReading).toBe(before);
  });

  it('describes non-SBC screens without an SBC tree', () => {
    loadFc27('store');
    const report = inspect();
    expect(report.context.kind).toBe('STORE');
    expect(report.sbc).toMatchObject({ rootFound: false, requirementRows: [], tree: null });
  });

  describe('report -> sanitized fixture', () => {
    it.each(['en', 'de', 'fr', 'es'] as const)('round-trips the %s challenge to an equivalent minimal fixture', (lang) => {
      loadFc27(`sbc-challenge.${lang}`);
      const report = inspect();
      const original = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0 }).readSbcChallenge();
      const html = reportToFixtureHtml(report, `roundtrip-${lang}`);
      expect(findSensitiveContent(html)).toEqual([]);
      expect(html.length).toBeLessThan(12_000);
      loadHtml(html);
      const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0 });
      expect(adapter.detectContext().kind).toBe('SBC_CHALLENGE');
      const replayed = adapter.readSbcChallenge();
      if (!original.ok || !replayed.ok) throw new Error('read failed');
      expect(replayed.value.requirements).toEqual(original.value.requirements);
      expect(replayed.value).toMatchObject({ squadSize: original.value.squadSize, filledSlots: original.value.filledSlots });
    });

    it('refuses to build a fixture from a report containing sensitive content', () => {
      loadFc27('sbc-challenge.en');
      const report = inspect();
      const tampered = structuredClone(report);
      const row = tampered.sbc.requirementRows[0];
      if (row) row.text = SECRETS.email;
      if (tampered.sbc.tree) tampered.sbc.tree.text = SECRETS.email;
      expect(() => reportToFixtureHtml(tampered, 'bad')).toThrow(/refusing/);
    });

    it('rejects reports with unexpected fields', () => {
      loadFc27('sbc-challenge.en');
      const report = { ...inspect(), cookies: 'x=y' };
      expect(() => reportToFixtureHtml(report, 'bad')).toThrow();
    });
  });
});

describe('per-slot evidence (empty vs filled pitch)', () => {
  it('exposes enough structure to tell an empty slot from a filled one, without text or ids', () => {
    loadFc27('sbc-challenge.en'); // synthetic: slots 0-3 hold players, 4-10 empty
    const player = document.querySelector('.ut-item-view.player');
    player?.insertAdjacentHTML('beforeend', '<img src="/content/fut/players/231747.png" alt=""><span class="name">Kylian</span><div data-index="3" data-name="kylian" data-player-id="231747"></div>');
    const [filled, , , , empty] = inspect().sbc.slotDetails;
    if (!filled || !empty) throw new Error('slots missing');
    expect(filled.structuralFingerprint).not.toBe(empty.structuralFingerprint);
    expect(filled.descendantClasses.map((c) => c.className)).toContain('player');
    expect(empty.descendantClasses.map((c) => c.className)).toContain('empty');
    expect(filled.textNodes.withDigits).toBeGreaterThan(0);
    expect(empty.textNodes.total).toBe(0);
    expect(filled.assetKinds).toEqual(['players']);
    expect(filled.imgCount).toBe(1);
    expect(filled.dataAttributes).toEqual(['data-index', 'data-name', 'data-player-id']);
    // Only tiny structural values survive; names and ids never do.
    expect(filled.safeDataValues).toEqual([{ name: 'data-index', value: '3' }]);
    expect(filled.filledBySignature).toBeNull(); // live profile: unknown
    const json = JSON.stringify(filled);
    expect(json).not.toContain('Kylian');
    expect(json).not.toContain('kylian');
    expect(json).not.toContain('231747');
  });

  it('reports what the active profile concludes per slot (fixture profile knows occupancy)', () => {
    loadFc27('sbc-challenge.en');
    const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0, profiles: [fc27FixtureProfile] });
    const result = inspectCurrentScreen({ adapter, document, url: LIVE_URL, extensionVersion: '0.2.0', now: 0 });
    if (!result.ok) throw new Error(result.reason);
    expect(result.report.sbc.slotDetails.map((s) => s.filledBySignature)).toEqual([true, true, true, true, false, false, false, false, false, false, false]);
    expect(result.report.sbc.slots).toEqual({ total: 11, filled: 4, locked: 0 });
  });

  it('an empty live-style pitch yields identical slot fingerprints and unknown occupancy', () => {
    loadFc27('sbc-challenge-live-empty-pitch.en');
    const report = inspect();
    expect(report.sbc.slots).toEqual({ total: 11, filled: null, locked: 0 });
    expect(new Set(report.sbc.slotDetails.map((s) => s.structuralFingerprint)).size).toBe(1);
    expect(report.sbc.slotDetails[0]?.descendantClasses.map((c) => c.className)).toEqual(['ut-item-view', 'ut-item-view--main']);
  });

  it('a report pair (empty vs one player) can be diffed and replayed as fixtures', () => {
    loadFc27('sbc-challenge-live-empty-pitch.en');
    const a = inspect();
    const first = document.querySelector('.ut-item-view');
    first?.classList.add('player');
    first?.insertAdjacentHTML('beforeend', '<span class="rating">84</span>');
    const b = inspect();
    const changed = b.sbc.slotDetails.filter((s, i) => s.structuralFingerprint !== a.sbc.slotDetails[i]?.structuralFingerprint).map((s) => s.index);
    expect(changed).toEqual([0]);
    // Replaying B reproduces the per-slot structure exactly.
    loadHtml(reportToFixtureHtml(b, 'pair-b'));
    const replay = inspect();
    expect(replay.sbc.slotDetails.map((s) => s.structuralFingerprint)).toEqual(b.sbc.slotDetails.map((s) => s.structuralFingerprint));
  });
});

describe('per-slot occupancy in reports of the real captures', () => {
  it.each([
    ['fc27-sbc-bronze11-empty.en', 'EEEEEEEEEEE', 0],
    ['fc27-sbc-bronze11-one-player.en', 'EEEEEEEEEFE', 1],
  ] as const)('%s -> %s', (name, states, filled) => {
    loadHtml(readFileSync(join(FIXTURES_ROOT, 'captured', `${name}.html`), 'utf8'));
    const report = inspect();
    expect(report.sbc.slotDetails.map((s) => (s.occupancy ?? '?')[0]).join('')).toBe(states);
    expect(report.sbc.slots).toEqual({ total: 11, filled, locked: 0 });
    expect(findSensitiveContent(JSON.stringify(report))).toEqual([]);
  });
});
