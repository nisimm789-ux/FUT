import { fc27LiveProfile } from './fc27-live.js';
import type { EaAdapterProfile } from './types.js';

/**
 * TEST/FIXTURE-ONLY profile for the synthetic FC 27-shaped fixtures, whose
 * slot markup is authored by us (filled = `.ut-item-view.player`). It lets
 * tests exercise slot-driven observation and filledSlots logic without
 * pretending that signature is known for the live Web App.
 * Not part of DEFAULT_PROFILES; never `live`.
 */
export const fc27FixtureProfile: EaAdapterProfile = {
  ...fc27LiveProfile,
  id: 'fc27-fixture',
  live: false,
  verified: true,
  signatures: { 'sbc:slotFilled': 'verified' },
  ...(fc27LiveProfile.sbc && {
    sbc: { ...fc27LiveProfile.sbc, slots: { slot: '.ut-squad-slot-view', filled: '.ut-item-view.player', locked: '.locked' } },
  }),
};
