import type { ClubItem, SbcChallengeSnapshot, SolveProblem, SolverOptions } from '@fc/contracts';

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

export function makeProblem(
  challenge: Omit<SbcChallengeSnapshot, 'schemaVersion' | 'source' | 'observedAt' | 'setId' | 'name'>,
  candidates: ClubItem[],
  options: Partial<SolverOptions> = {},
): SolveProblem {
  return {
    schemaVersion: 1,
    challenge: { schemaVersion: 1, setId: null, name: 'Test', source: 'fixture', observedAt: 0, ...challenge },
    candidates,
    options: { strategy: 'BALANCED', protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0, ...options },
  };
}
