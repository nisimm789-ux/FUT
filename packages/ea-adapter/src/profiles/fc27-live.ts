import type { EaAdapterProfile } from './types.js';

/**
 * FC 27 live profile — CANDIDATE, NOT YET VERIFIED.
 *
 * Every selector below is a hypothesis about the FC 27 Web App, based on the
 * long-standing convention that EA view classes are named `ut-<name>-view`
 * after their `UT<Name>View` classes. None has been confirmed against a live,
 * logged-in FC 27 session (the development environment cannot reach or log in
 * to ea.com). `verified: false` is surfaced in AdapterHealth and in the UI.
 *
 * Validation workflow (docs/architecture.md §13):
 *   1. Load the dev build on the FC 27 Web App, open each screen.
 *   2. Side panel → Developer → Inspect Current EA Screen → Export report.
 *   3. Correct selectors here, convert the report into a sanitized fixture
 *      (`pnpm fixtures:from-report`), add a regression test, bump
 *      profileVersion, and only then flip `verified` to true.
 *
 * Readers fail closed: if these selectors do not match, sbcReading reports
 * `degraded` with STRUCTURE_NOT_FOUND and no snapshot is produced.
 */
export const fc27LiveProfile: EaAdapterProfile = {
  id: 'fc27-live',
  fcVersion: 'FC27',
  profileVersion: '0.3.0',
  verified: false,
  // Evidence from the first sanitized live report (2026-09-24, en, one SBC with
  // "Player Quality: Exactly Bronze" + "Number of Players in the Squad: 11"):
  signatures: {
    appShell: 'verified',
    'context:SBC_CHALLENGE': 'verified',
    'sbc:requirementsRoot': 'verified',
    'sbc:requirementRow': 'verified',
    'sbc:pitchRoot': 'verified',
    'sbc:slot': 'verified',
    'requirement:SQUAD_SIZE': 'verified',
    'requirement:PLAYER_QUALITY': 'verified',
    // Verified 2026-09-24 from a live capture pair of the same SBC (all 11 slots
    // empty vs exactly one player in slot 9), both committed as regression
    // fixtures under fixtures/ea/captured/. The earlier `.ut-item-view:not(.empty)`
    // guess was refuted (it counted an empty pitch as 11/11 filled).
    'sbc:slotFilled': 'verified',
    'sbc:slotLocked': 'unverified',
    'sbc:challengeName': 'unverified',
    'requirement:other-types': 'unverified',
    'context:other': 'unverified',
  },
  live: true,
  probe: (doc) => doc.querySelector('.ut-root-view, .ut-tab-bar-view, .ut-navigation-bar-view') !== null,
  // The Web App URL does not track in-app navigation, so no route rules:
  // only structure (views) and the selected tab-bar icon (language-neutral).
  //
  // Each tab icon belongs to exactly ONE rule (the tab's hub context); screens
  // reached inside a tab (SBC challenge, pack results) need structural proof,
  // so a nav-only match can never be mistaken for them.
  contextRules: [
    { kind: 'SBC_CHALLENGE', view: '.ut-sbc-challenge-requirements-view', requires: '.ut-squad-pitch-view' },
    { kind: 'SBC_HUB', view: '.ut-sbc-hub-view, .ut-sbc-challenges-view', activeNav: '.ut-tab-bar-item.selected.icon-sbc' },
    { kind: 'PACK_RESULTS', view: '.ut-store-reveal-modal-list-view, .ut-unassigned-view' },
    { kind: 'STORE', view: '.ut-store-hub-view, .ut-store-view', activeNav: '.ut-tab-bar-item.selected.icon-store' },
    { kind: 'EVOLUTIONS', view: '.ut-academy-hub-view, .ut-academy-view' },
    { kind: 'TRANSFERS', view: '.ut-transfers-hub-view, .ut-transfer-list-view, .ut-market-search-filters-view', activeNav: '.ut-tab-bar-item.selected.icon-transfer' },
    { kind: 'CLUB', view: '.ut-club-hub-view, .ut-club-search-results-view', activeNav: '.ut-tab-bar-item.selected.icon-club' },
    { kind: 'SQUADS', view: '.ut-squads-hub-view, .ut-squad-builder-view', activeNav: '.ut-tab-bar-item.selected.icon-squad' },
    { kind: 'HOME', view: '.ut-home-hub-view, .ut-home-view', activeNav: '.ut-tab-bar-item.selected.icon-home' },
  ],
  navigation: { item: '.ut-tab-bar-item', selectedClass: 'selected' },
  sbc: {
    requirementsRoot: '.ut-sbc-challenge-requirements-view',
    requirementRow: 'li',
    completedClasses: ['complete', 'completed', 'is-complete'],
    pitchRoot: '.ut-squad-pitch-view',
    slots: {
      slot: '.ut-squad-slot-view',
      locked: '.locked, .disabled',
      // Live evidence: each slot has exactly one direct `.item.player` child
      // (the other direct `.item` is the chemistry-points view).
      //   empty : .item.player.ut-item-loading (+ .empty, .droppable)
      //   filled: .item.player.ut-item-loaded  (+ .draggable, .animatereplace)
      // Deliberately NOT used as signals: .ut-item-view (present in both),
      // `.empty` on descendants (a filled card still has one inside), the
      // pedestal's state-positioned class and `draggable` alone.
      occupancy: { container: ':scope > .item.player', filledClass: 'ut-item-loaded', emptyClass: 'ut-item-loading' },
    },
    name: '.ut-navigation-bar-view h1',
    assetIdPatterns: {
      nation: /\/flags?\/(?:[a-z0-9_-]+\/)*(\d+)\.(?:png|webp|jpg)(?:$|\?)/,
      league: /\/leagues?(?:logos?)?\/(?:[a-z0-9_-]+\/)*(\d+)\.(?:png|webp|jpg)(?:$|\?)/,
      club: /\/clubs?(?:badges?)?\/(?:[a-z0-9_-]+\/)*(\d+)\.(?:png|webp|jpg)(?:$|\?)/,
    },
  },
  // Club reading is Phase 1B.
};
