import type { SelectorProfile } from './types.js';

/**
 * Profile for the synthetic fixtures in /fixtures/ea (dev + CI). It models the
 * kind of structure we expect to rely on, but it is NOT the real EA markup.
 */
export const syntheticV1Profile: SelectorProfile = {
  id: 'synthetic-v1',
  verified: true,
  probe: (doc) => doc.querySelector('.ut-root-view[data-fixture-profile="synthetic-v1"]') !== null,
  contextViews: [
    ['SBC_CHALLENGE', '.ut-sbc-challenge-view'],
    ['SBC_HUB', '.ut-sbc-hub-view'],
    ['PACK_RESULTS', '.ut-pack-results-view'],
    ['STORE', '.ut-store-view'],
    ['CLUB', '.ut-club-items-view'],
    ['SQUADS', '.ut-squads-view'],
    ['TRANSFERS', '.ut-transfers-view'],
    ['EVOLUTIONS', '.ut-evolutions-view'],
    ['HOME', '.ut-home-view'],
  ],
  urlHints: [
    ['SBC_CHALLENGE', /#\/sbc-challenge/],
    ['SBC_HUB', /#\/sbc-hub/],
    ['CLUB', /#\/club/],
    ['STORE', /#\/store/],
  ],
  sbc: {
    challengeRoot: '.ut-sbc-challenge-view .ut-sbc-challenge',
    challengeName: '.ut-sbc-challenge-name',
    requirement: '.ut-sbc-requirements > .ut-sbc-requirement',
    attrs: {
      challengeId: 'data-challenge-id',
      setId: 'data-set-id',
      squadSize: 'data-squad-size',
      requirementId: 'data-req-id',
      requirementKind: 'data-req-kind',
    },
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
      nation: /\/flags\/(\d+)\.png(?:$|\?)/,
      league: /\/leagues\/(\d+)\.png(?:$|\?)/,
      club: /\/clubs\/(\d+)\.png(?:$|\?)/,
    },
    rarityClasses: { COMMON: 'common', RARE: 'rare', SPECIAL: 'special' },
    untradeableClass: 'untradeable',
  },
};
