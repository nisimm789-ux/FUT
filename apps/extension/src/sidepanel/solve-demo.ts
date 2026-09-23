import { CONTRACTS_VERSION, ClubSnapshotSchema, SbcChallengeSnapshotSchema } from '@fc/contracts';
import type { ClubSnapshot, SbcChallengeSnapshot, SolveProblem, SolverStrategy } from '@fc/contracts';
import clubFixture from '@fc/ea-fixtures/data/club.synthetic.json';
import sbcFixture from '@fc/ea-fixtures/data/sbc-challenge.synthetic.json';

export type ProblemSource = 'live-page' | 'bundled-fixture';

/** Bundled synthetic data, validated like any other untrusted input. */
export const BUNDLED_SBC: SbcChallengeSnapshot = SbcChallengeSnapshotSchema.parse(sbcFixture);
export const BUNDLED_CLUB: ClubSnapshot = ClubSnapshotSchema.parse(clubFixture);

/**
 * Uses the SBC + club observed on the page when both exist; otherwise falls
 * back to the bundled synthetic fixtures so the pipeline can always be demoed.
 */
export function buildDemoProblem(input: {
  sbc: SbcChallengeSnapshot | null;
  club: ClubSnapshot | null;
  strategy: SolverStrategy;
}): { problem: SolveProblem; source: ProblemSource } {
  const live = input.sbc !== null && input.club !== null;
  const challenge = live && input.sbc ? input.sbc : BUNDLED_SBC;
  const club = live && input.club ? input.club : BUNDLED_CLUB;
  return {
    source: live ? 'live-page' : 'bundled-fixture',
    problem: {
      schemaVersion: CONTRACTS_VERSION,
      challenge,
      candidates: club.items,
      options: { strategy: input.strategy, protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
    },
  };
}
