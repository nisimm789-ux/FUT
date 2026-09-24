// Generates the synthetic EA-like fixture pages and their expected normalized
// output. Deterministic (seeded PRNG) so regenerated files diff cleanly.
// Run: node fixtures/ea/scripts/generate.mjs
// All players/names are synthetic. No real EA markup or data is copied.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = 'synthetic-v1';

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260923);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const leagues = [
  { leagueId: 13, nations: [14, 18, 54], clubs: [1, 5, 9, 10] },
  { leagueId: 53, nations: [45, 52, 54], clubs: [240, 241, 243] },
  { leagueId: 19, nations: [21, 18], clubs: [21, 22, 32] },
  { leagueId: 31, nations: [27, 52], clubs: [44, 45, 46] },
  { leagueId: 16, nations: [18, 14], clubs: [73, 219] },
];
const positions = ['GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST'];

const items = [];
for (let i = 1; i <= 40; i += 1) {
  const league = pick(leagues);
  const rating = 60 + Math.floor(rand() * 27); // 60..86
  const rarity = rand() < 0.35 ? 'RARE' : 'COMMON';
  const tradeable = rand() < 0.45;
  const primary = pick(positions);
  const inStorage = i % 9 === 0;
  items.push({
    id: `it-${String(i).padStart(4, '0')}`,
    definitionId: 900000 + i,
    name: `Synthetic Player ${String(i).padStart(2, '0')}`,
    rating,
    rarity,
    positions: [primary],
    nationId: pick(league.nations),
    leagueId: league.leagueId,
    clubId: pick(league.clubs),
    tradeable,
    location: inStorage ? 'SBC_STORAGE' : 'CLUB',
    estimatedPrice: tradeable && rand() < 0.7 ? Math.round((rating < 75 ? 250 : 400 * 2 ** ((rating - 75) / 2)) / 50) * 50 : null,
  });
}
// Two explicit duplicates (same definition) so duplicate handling is exercised.
items.push({ ...items[2], id: 'it-0041', location: 'SBC_STORAGE', tradeable: false, estimatedPrice: null });
items.push({ ...items[5], id: 'it-0042', location: 'SBC_STORAGE', tradeable: false, estimatedPrice: null });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout(title, lang, body) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(title)} - FC Web App (synthetic fixture)</title>
</head>
<body>
<div class="ut-root-view" data-fixture-profile="${PROFILE}">
<nav class="ut-tab-bar" aria-label="fixture navigation"></nav>
<main class="ut-content">
${body}
</main>
</div>
</body>
</html>
`;
}

function itemTile(item) {
  const price = item.estimatedPrice === null ? '' : `\n      <span class="ut-item-price" data-coins="${item.estimatedPrice}">${item.estimatedPrice}</span>`;
  return `    <li class="ut-list-item" data-item-id="${item.id}">
      <div class="ut-item player ${item.rarity.toLowerCase()}${item.tradeable ? '' : ' untradeable'}">
        <span class="ut-item-rating">${item.rating}</span>
        <span class="ut-item-position" data-position="${item.positions[0]}">${item.positions[0]}</span>
        <span class="ut-item-name">${esc(item.name)}</span>
        <img class="ut-item-portrait" alt="" src="../site/img/players/${item.definitionId}.png">
        <img class="ut-item-nation" alt="" src="../site/img/flags/${item.nationId}.png">
        <img class="ut-item-league" alt="" src="../site/img/leagues/${item.leagueId}.png">
        <img class="ut-item-club" alt="" src="../site/img/clubs/${item.clubId}.png">${price}
      </div>
    </li>`;
}

function clubPage(list) {
  const club = list.filter((i) => i.location === 'CLUB');
  const storage = list.filter((i) => i.location === 'SBC_STORAGE');
  return layout('Club', 'en', `<section class="ut-view ut-club-items-view">
  <header class="ut-view-header"><h1>Club Players</h1></header>
  <ul class="ut-item-list" data-location="club" data-complete="true">
${club.map(itemTile).join('\n')}
  </ul>
  <h2>SBC Storage</h2>
  <ul class="ut-item-list" data-location="sbc-storage" data-complete="true">
${storage.map(itemTile).join('\n')}
  </ul>
</section>`);
}

const via = 'structure';
const challenge = {
  schemaVersion: 2,
  challengeId: 'ch-1001',
  challengeIdKind: 'FIXTURE',
  setId: 'set-10',
  name: 'Fixture Challenge: Squad Foundations',
  squadSize: 11,
  filledSlots: null,
  requirements: [
    { id: 'req-1', via, type: 'MIN_SQUAD_RATING', value: 75 },
    { id: 'req-2', via, type: 'MIN_COUNT', count: 2, filter: { rarities: ['RARE'] } },
    { id: 'req-3', via, type: 'MIN_COUNT', count: 1, filter: { nationIds: [14] } },
    { id: 'req-4', via, type: 'MAX_SAME', dimension: 'club', count: 4 },
    { id: 'req-5', via, type: 'MIN_UNIQUE', dimension: 'league', count: 3 },
    { id: 'req-6', via, type: 'PLAYER_RATING_RANGE', min: 65 },
  ],
  interpretationLocale: null,
  provenance: 'LOCAL_FIXTURE',
  adapter: null,
  observedAt: 0,
};

// Labels are deliberately German: the reader must rely on structure, not text.
const requirementMarkup = `      <li class="ut-sbc-requirement" data-req-id="req-1" data-req-kind="squad-rating" data-req-value="75"><span class="ut-label">Min. Teambewertung: 75</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-2" data-req-kind="min-count" data-req-count="2" data-req-rarity="RARE"><span class="ut-label">Seltene: Min. 2</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-3" data-req-kind="min-count" data-req-count="1" data-req-nation="14"><span class="ut-label">Nation: England Min. 1</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-4" data-req-kind="max-same" data-req-dimension="club" data-req-count="4"><span class="ut-label">Gleicher Verein: Max. 4</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-5" data-req-kind="min-unique" data-req-dimension="league" data-req-count="3"><span class="ut-label">Ligen: Min. 3</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-6" data-req-kind="rating-range" data-req-min="65"><span class="ut-label">Spielerbewertung: Min. 65</span></li>`;

function challengePage(id, name, reqs, lang) {
  return layout(name, lang, `<section class="ut-view ut-sbc-challenge-view">
  <header class="ut-view-header"><h1>${esc(name)}</h1></header>
  <div class="ut-sbc-challenge" data-challenge-id="${id}" data-set-id="set-10" data-squad-size="11">
    <h2 class="ut-sbc-challenge-name">${esc(name)}</h2>
    <ul class="ut-sbc-requirements">
${reqs}
    </ul>
    <!-- Write actions (submit/apply) deliberately exist in the page but the extension never triggers them. -->
    <button class="ut-sbc-submit" type="button" disabled>Einreichen</button>
  </div>
</section>`);
}

const simple = (title, cls, lang = 'en') =>
  layout(title, lang, `<section class="ut-view ${cls}">\n  <header class="ut-view-header"><h1>${esc(title)}</h1></header>\n</section>`);

const files = {
  'pages/home.html': simple('Home', 'ut-home-view', 'fr'),
  'pages/squads.html': simple('Squads', 'ut-squads-view'),
  'pages/sbc-hub.html': simple('SBC', 'ut-sbc-hub-view', 'es'),
  'pages/store.html': simple('Store', 'ut-store-view'),
  'pages/pack-results.html': simple('Pack Results', 'ut-pack-results-view'),
  'pages/transfers.html': simple('Transfers', 'ut-transfers-view'),
  'pages/evolutions.html': simple('Evolutions', 'ut-evolutions-view'),
  'pages/unknown.html': simple('Something new', 'ut-some-future-view'),
  'pages/not-ea.html': `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Unrelated page</title></head>\n<body><main><h1>Not the FC Web App</h1></main></body></html>\n`,
  'pages/club.html': clubPage(items),
  'pages/sbc-challenge.html': challengePage('ch-1001', challenge.name, requirementMarkup, 'de'),
  'pages/sbc-challenge-unsupported.html': challengePage(
    'ch-1002',
    'Fixture Challenge: Chemistry',
    `      <li class="ut-sbc-requirement" data-req-id="req-1" data-req-kind="squad-rating" data-req-value="70"><span class="ut-label">Min. Team Rating: 70</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-2" data-req-kind="chemistry" data-req-value="20"><span class="ut-label">Min. Team Chemistry: 20</span></li>
      <li class="ut-sbc-requirement" data-req-id="req-3" data-req-kind="brand-new-kind" data-req-value="1"><span class="ut-label">Something EA added later</span></li>`,
    'en',
  ),
  // Corrupted: rating out of range + missing definition image. Reader must fail closed.
  'pages/club-malformed.html': clubPage(items.slice(0, 3)).replace('<span class="ut-item-rating">', '<span class="ut-item-rating">1').replace(/<img class="ut-item-portrait"[^>]*>/, ''),
  'data/club.synthetic.json': JSON.stringify({ schemaVersion: 2, coverage: 'complete', items: sortForClubPage(items), provenance: 'LOCAL_FIXTURE', observedAt: 0 }, null, 2) + '\n',
  'data/sbc-challenge.synthetic.json': JSON.stringify(challenge, null, 2) + '\n',
};

// The reader returns club-list items first, then storage items (DOM order).
function sortForClubPage(list) {
  return [...list.filter((i) => i.location === 'CLUB'), ...list.filter((i) => i.location === 'SBC_STORAGE')];
}


// ---------------------------------------------------------------------------
// FC 27 CANDIDATE structure fixtures (fc27/*.html)
//
// SYNTHETIC. They model the *candidate* selectors of the fc27-live profile
// (packages/ea-adapter/src/profiles/fc27-live.ts) so the live reader pipeline,
// text interpretation, observation and failure handling can be tested in CI.
// They are NOT captured from EA and do not prove the live selectors are right.
// Real captures go to fixtures/ea/captured/ via `pnpm fixtures:from-report`.
// ---------------------------------------------------------------------------

const NAV = ['home', 'squad', 'sbc', 'transfer', 'store', 'club'];

function fc27Layout({ lang, title, selectedTab, body, heading = '' }) {
  const nav = NAV.map((t) => `    <button class="ut-tab-bar-item icon-${t}${t === selectedTab ? ' selected' : ''}"></button>`).join('\n');
  return `<!doctype html>
<!-- SYNTHETIC fixture modelling the CANDIDATE fc27-live profile (unverified). Not captured from EA. -->
<html lang="${lang}">
<head><meta charset="utf-8"><title>${esc(title)} - FC 27 candidate structure (synthetic)</title></head>
<body>
<div class="ut-root-view">
  <nav class="ut-tab-bar-view">
${nav}
  </nav>
  <div class="ut-navigation-bar-view"><h1 class="title">${esc(heading)}</h1></div>
  <main class="ut-content">
${body}
  </main>
</div>
</body>
</html>
`;
}

// Localized labels. Each entry also documents the normalized requirement the
// reader must produce (see packages/ea-adapter/test/fc27-*.test.ts).
const FC27_REQS = {
  rating: { en: 'Team Rating: Min. 84', de: 'Teambewertung: Mind. 84', fr: "Note d'équipe : Min. 84", es: 'Valoración del equipo: Mín. 84' },
  totw: { en: 'Team of the Week: Min. 1 Players', de: 'Team der Woche: Mind. 1 Spieler', fr: 'Équipe de la semaine : Min. 1 joueur', es: 'Equipo de la semana: Mín. 1 jugador' },
  chem: { en: 'Total Chemistry: Min. 24', de: 'Gesamtchemie: Mind. 24', fr: 'Collectif : Min. 24', es: 'Química total: Mín. 24' },
  rare: { en: 'Rare: Min. 2 Players', de: 'Seltene: Mind. 2 Spieler', fr: 'Rares : Min. 2 joueurs', es: 'Raros: Mín. 2 jugadores' },
  sameClub: { en: 'Same Club Count: Max. 3', de: 'Gleicher Verein: Max. 3', fr: 'Même club : Max. 3', es: 'Mismo club: Máx. 3' },
  leagues: { en: 'Leagues: Min. 3', de: 'Ligen: Mind. 3', fr: 'Championnats : Min. 3', es: 'Ligas: Mín. 3' },
  nation: { en: 'Nation: Min. 1 Players', de: 'Nation: Mind. 1 Spieler', fr: 'Nation : Min. 1 joueur', es: 'Nacionalidad: Mín. 1 jugador' },
  size: { en: '# of Players in the Squad: 11', de: 'Anzahl der Spieler im Team: 11', fr: "Nombre de joueurs dans l'équipe : 11", es: 'Número de jugadores en la plantilla: 11' },
};
const FLAG = '<img class="ut-requirement-flag" alt="" src="/fixture-assets/flags/14.png">';

function reqRow(text, { complete = false, img = '' } = {}) {
  return `        <li class="ut-sbc-challenge-requirements-row${complete ? ' complete' : ''}"><span class="ut-requirement-label">${esc(text)}</span>${img}</li>`;
}

function pitch(filled, locked = 0) {
  return Array.from({ length: 11 }, (_, i) => {
    if (i >= 11 - locked) return '        <div class="ut-squad-slot-view locked"></div>';
    return i < filled
      ? `        <div class="ut-squad-slot-view"><div class="ut-item-view player"><span class="rating">${70 + i}</span></div></div>`
      : '        <div class="ut-squad-slot-view"><div class="ut-item-view empty"></div></div>';
  }).join('\n');
}

function fc27Challenge({ lang, rows, filled = 4, locked = 0, heading, withPitch = true, withRequirements = true }) {
  const pitchHtml = withPitch ? `      <div class="ut-squad-pitch-view">\n${pitch(filled, locked)}\n      </div>\n` : '';
  const reqHtml = withRequirements
    ? `      <div class="ut-sbc-challenge-requirements-view">\n        <ul class="ut-sbc-challenge-requirements-list">\n${rows.join('\n')}\n        </ul>\n      </div>`
    : '      <div class="ut-sbc-challenge-requirements-view"></div>';
  return fc27Layout({
    lang,
    title: heading,
    heading,
    selectedTab: 'sbc',
    body: `    <section class="ut-sbc-squad-overview-view">\n${pitchHtml}${reqHtml}\n    </section>`,
  });
}

const allRows = (lang) => [
  reqRow(FC27_REQS.rating[lang]),
  reqRow(FC27_REQS.totw[lang]),
  reqRow(FC27_REQS.chem[lang]),
  reqRow(FC27_REQS.rare[lang], { complete: true }),
  reqRow(FC27_REQS.sameClub[lang], { complete: true }),
  reqRow(FC27_REQS.leagues[lang]),
  reqRow(FC27_REQS.nation[lang], { img: FLAG }),
  reqRow(FC27_REQS.size[lang]),
];

const simpleFc27 = (view, tab, lang = 'en') =>
  fc27Layout({ lang, title: view, selectedTab: tab, body: view ? `    <div class="${view}"></div>` : '' });

function fc27Files() {
  const out = {};
  for (const lang of ['en', 'de', 'fr', 'es']) {
    out[`fc27/sbc-challenge.${lang}.html`] = fc27Challenge({ lang, rows: allRows(lang), heading: 'Synthetic Upgrade 84' });
  }
  out['fc27/sbc-challenge-no-lang.html'] = fc27Challenge({ lang: '', rows: [reqRow('Mismo club: Máx. 3'), reqRow('Team Rating: Min. 84')], heading: 'Synthetic' }).replace('<html lang="">', '<html>');
  out['fc27/sbc-challenge-supported.en.html'] = fc27Challenge({
    lang: 'en',
    heading: 'Synthetic Foundations',
    filled: 0,
    rows: [
      reqRow('Team Rating: Min. 75'),
      reqRow('Rare: Min. 2 Players'),
      reqRow('Same Club Count: Max. 4'),
      reqRow('Leagues: Min. 3'),
      reqRow('Player Quality: Min. Silver'),
      reqRow('Nation: Min. 1 Players', { img: FLAG }),
      reqRow('# of Players in the Squad: 11'),
    ],
  });
  out['fc27/sbc-challenge-unknown.en.html'] = fc27Challenge({
    lang: 'en',
    heading: 'Synthetic Unknowns',
    rows: [
      reqRow('Team Rating: Min. 80'),
      reqRow('Min. 2 Chemistry Points per Player'),
      reqRow('Icon Players: Min. 1'),
      reqRow('Nation: Min. 1 Players'),
      reqRow('# of Players in the Squad: 11'),
    ],
  });
  out['fc27/sbc-challenge-seven.en.html'] = fc27Challenge({
    lang: 'en',
    heading: 'Synthetic Seven',
    filled: 2,
    locked: 4,
    rows: [reqRow('Team Rating: Min. 70'), reqRow('Rare: Min. 1 Players')],
  });
  out['fc27/sbc-challenge-no-requirements.html'] = fc27Challenge({ lang: 'en', rows: [], withRequirements: false, heading: 'Broken' });
  out['fc27/sbc-challenge-no-squad-size.html'] = fc27Challenge({ lang: 'en', rows: [reqRow('Team Rating: Min. 84')], withPitch: false, heading: 'Broken' }).replace(
    'class="ut-sbc-squad-overview-view"',
    'class="ut-sbc-squad-overview-view"',
  );
  out['fc27/sbc-challenge-inconsistent.html'] = fc27Challenge({
    lang: 'en',
    heading: 'Broken',
    rows: [reqRow('Rare: Min. 9 Players'), reqRow('# of Players in the Squad: 5')],
  });
  // Regression for the first LIVE finding (2026-09-24): on the real FC 27
  // Web App an EMPTY pitch still has an .ut-item-view in every slot and no
  // .empty class, so `.ut-item-view:not(.empty)` reported 11/11 filled.
  // Hand-reconstructed from the reported facts (not a raw capture); the reader
  // must report filledSlots = null (unknown) until a verified signature exists.
  out['fc27/sbc-challenge-live-empty-pitch.en.html'] = fc27Layout({
    lang: 'en',
    title: 'Live empty pitch',
    heading: 'Synthetic Bronze Challenge',
    selectedTab: 'sbc',
    body: `    <section class="ut-sbc-squad-overview-view">
      <div class="ut-squad-pitch-view">
${Array.from({ length: 11 }, () => '        <div class="ut-squad-slot-view"><div class="ut-item-view"><div class="ut-item-view--main"></div></div></div>').join('\n')}
      </div>
      <div class="ut-sbc-challenge-requirements-view">
        <ul class="ut-sbc-challenge-requirements-list">
${reqRow('Player Quality: Exactly Bronze')}
${reqRow('Number of Players in the Squad: 11')}
        </ul>
      </div>
    </section>`,
  });
  out['fc27/home.html'] = simpleFc27('ut-home-hub-view', 'home', 'fr');
  out['fc27/squads.html'] = simpleFc27('ut-squads-hub-view', 'squad', 'de');
  out['fc27/sbc-hub.html'] = simpleFc27('ut-sbc-hub-view', 'sbc', 'es');
  out['fc27/store.html'] = simpleFc27('ut-store-hub-view', 'store');
  out['fc27/pack-results.html'] = simpleFc27('ut-unassigned-view', 'store');
  out['fc27/transfers.html'] = simpleFc27('ut-transfers-hub-view', 'transfer');
  out['fc27/club.html'] = simpleFc27('ut-club-hub-view', 'club');
  out['fc27/evolutions.html'] = simpleFc27('ut-academy-hub-view', '');
  out['fc27/nav-only-store.html'] = simpleFc27('', 'store');
  out['fc27/unknown.html'] = simpleFc27('ut-some-future-view', '');
  return out;
}

Object.assign(files, fc27Files());
mkdirSync(join(root, 'fc27'), { recursive: true });
for (const [rel, content] of Object.entries(files)) writeFileSync(join(root, rel), content);
console.log(`wrote ${Object.keys(files).length} fixture files`);
