import { CONTRACTS_VERSION, ClubSnapshotSchema, SbcChallengeSnapshotSchema } from '@fc/contracts';
import type { ClubSnapshot, SbcChallengeSnapshot, SolveProblem, SolverStrategy } from '@fc/contracts';
import clubFixture from '@fc/ea-fixtures/data/club.synthetic.json';
import sbcFixture from '@fc/ea-fixtures/data/sbc-challenge.synthetic.json';

/** Bundled synthetic data (provenance LOCAL_FIXTURE), validated like any other input. */
export const BUNDLED_SBC: SbcChallengeSnapshot = SbcChallengeSnapshotSchema.parse(sbcFixture);
export const BUNDLED_CLUB: ClubSnapshot = ClubSnapshotSchema.parse(clubFixture);

export type DemoMode = 'bundled' | 'observed-sbc';

/**
 * - bundled:      synthetic SBC + synthetic club (always available).
 * - observed-sbc: the SBC read from the page (live or fixture) checked
 *                 against the club read from the page if there is one,
 *                 otherwise the synthetic club.
 * Provenance travels with both inputs; the result echoes it.
 */
export function buildDemoProblem(input: {
  mode: DemoMode;
  sbc: SbcChallengeSnapshot | null;
  club: ClubSnapshot | null;
  strategy: SolverStrategy;
}): SolveProblem {
  const challenge = input.mode === 'observed-sbc' && input.sbc ? input.sbc : BUNDLED_SBC;
  const club = input.mode === 'observed-sbc' && input.club ? input.club : BUNDLED_CLUB;
  return {
    schemaVersion: CONTRACTS_VERSION,
    challenge,
    candidates: club.items,
    candidatesProvenance: club.provenance,
    options: { strategy: input.strategy, protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
  };
}
