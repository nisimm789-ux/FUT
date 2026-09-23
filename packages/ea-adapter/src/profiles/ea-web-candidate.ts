import type { SelectorProfile } from './types.js';

/**
 * UNVERIFIED best-guess profile for the live EA FC Web App.
 *
 * Only context detection is attempted, with low-risk structural guesses.
 * No readers are defined, so SBC/club reading report `unsupported` on the
 * live site until selectors are validated against a real session
 * (see docs/architecture.md, "Live validation backlog").
 */
export const eaWebCandidateProfile: SelectorProfile = {
  id: 'ea-web-candidate-0',
  verified: false,
  probe: (doc) => doc.querySelector('.ut-root-view, .ut-content') !== null,
  contextViews: [
    ['SBC_CHALLENGE', '.ut-sbc-challenge-view, .ut-squad-builder-view'],
    ['SBC_HUB', '.ut-sbc-hub-view'],
    ['PACK_RESULTS', '.ut-pack-results-view'],
    ['STORE', '.ut-store-view, .ut-store-hub-view'],
    ['CLUB', '.ut-club-hub-view, .ut-club-search-results-view'],
    ['SQUADS', '.ut-squads-hub-view'],
    ['TRANSFERS', '.ut-transfers-hub-view, .ut-transfer-list-view'],
    ['EVOLUTIONS', '.ut-academy-hub-view'],
    ['HOME', '.ut-home-view, .ut-home-hub-view'],
  ],
  urlHints: [],
};
