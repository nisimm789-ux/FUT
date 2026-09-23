import type { ClubItem, SbcChallengeSnapshot, SbcRequirement, SolveProblem, SolverOptions } from '@fc/contracts';

export function makeItem(id: string, overrides: Partial<ClubItem> = {}): ClubItem {
  return {
    id,
    definitionId: Number(id.replace(/\D/g, '')) || 1,
    name: `Synthetic ${id}`,
    rating: 70,
    rarity: 'COMMON',
    positions: ['CM'],
    nationId: 14,
    leagueId: 13,
    clubId: 1,
    tradeable: false,
    location: 'CLUB',
    estimatedPrice: null,
    ...overrides,
  };
}

type ChallengeInput = Pick<SbcChallengeSnapshot, 'challengeId' | 'squadSize'> & {
  requirements: DistributiveOmit<SbcRequirement, 'via'>[];
} & Partial<SbcChallengeSnapshot>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function makeProblem(challenge: ChallengeInput, candidates: ClubItem[], options: Partial<SolverOptions> = {}): SolveProblem {
  const requirements = challenge.requirements.map((r) => (r.type === 'UNKNOWN' ? r : { via: 'fixture' as const, ...r })) as SbcRequirement[];
  return {
    schemaVersion: 2,
    challenge: {
      schemaVersion: 2,
      challengeIdKind: 'FIXTURE',
      setId: null,
      name: 'Test',
      filledSlots: null,
      interpretationLocale: null,
      provenance: 'LOCAL_FIXTURE',
      adapter: null,
      observedAt: 0,
      ...challenge,
      requirements,
    },
    candidates,
    candidatesProvenance: 'LOCAL_FIXTURE',
    options: { strategy: 'BALANCED', protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0, ...options },
  };
}
