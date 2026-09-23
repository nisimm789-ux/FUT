import type { EaAdapterProfile } from './types.js';

const assetIds = {
  nation: /\/flags\/(\d+)\.png(?:$|\?)/,
  league: /\/leagues\/(\d+)\.png(?:$|\?)/,
  club: /\/clubs\/(\d+)\.png(?:$|\?)/,
};

/**
 * Profile for the Phase 0 synthetic fixtures in /fixtures/ea (dev + CI). It
 * models the kind of structure we expect to rely on, but it is NOT EA markup.
 */
export const syntheticV1Profile: EaAdapterProfile = {
  id: 'synthetic-v1',
  fcVersion: 'SYNTHETIC',
  profileVersion: '1.1.0',
  verified: true,
  live: false,
  probe: (doc) => doc.querySelector('.ut-root-view[data-fixture-profile="synthetic-v1"]') !== null,
  contextRules: [
    { kind: 'SBC_CHALLENGE', view: '.ut-sbc-challenge-view', route: /#\/sbc-challenge/ },
    { kind: 'SBC_HUB', view: '.ut-sbc-hub-view', route: /#\/sbc-hub/ },
    { kind: 'PACK_RESULTS', view: '.ut-pack-results-view' },
    { kind: 'STORE', view: '.ut-store-view', route: /#\/store/ },
    { kind: 'CLUB', view: '.ut-club-items-view', route: /#\/club/ },
    { kind: 'SQUADS', view: '.ut-squads-view' },
    { kind: 'TRANSFERS', view: '.ut-transfers-view' },
    { kind: 'EVOLUTIONS', view: '.ut-evolutions-view' },
    { kind: 'HOME', view: '.ut-home-view' },
  ],
  navigation: { item: '.ut-tab-bar [data-page]', selectedClass: 'selected' },
  sbc: {
    requirementsRoot: '.ut-sbc-challenge-view .ut-sbc-challenge',
    requirementRow: '.ut-sbc-requirements > .ut-sbc-requirement',
    completedClasses: ['complete'],
    name: '.ut-sbc-challenge-view .ut-sbc-challenge-name',
    structural: {
      challengeIdAttr: 'data-challenge-id',
      setIdAttr: 'data-set-id',
      squadSizeAttr: 'data-squad-size',
      requirementIdAttr: 'data-req-id',
      requirementKindAttr: 'data-req-kind',
    },
    assetIdPatterns: assetIds,
  },
  club: {
    list: '.ut-club-items-view .ut-item-list',
    item: ':scope > .ut-list-item',
    rating: '.ut-item-rating',
    position: '.ut-item-position',
    name: '.ut-item-name',
    price: '.ut-item-price',
    portrait: 'img.ut-item-portrait',
    nation: 'img.ut-item-nation',
    league: 'img.ut-item-league',
    club: 'img.ut-item-club',
    attrs: {
      itemId: 'data-item-id',
      listLocation: 'data-location',
      listComplete: 'data-complete',
      position: 'data-position',
      coins: 'data-coins',
    },
    assetIdPatterns: {
      definition: /\/players\/(\d+)\.png(?:$|\?)/,
      ...assetIds,
    },
    rarityClasses: { COMMON: 'common', RARE: 'rare', SPECIAL: 'special' },
    untradeableClass: 'untradeable',
  },
};
