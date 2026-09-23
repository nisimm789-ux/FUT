import { describe, expect, it } from 'vitest';
import type { SbcRequirement } from '@fc/contracts';
import { evaluateRequirement, matchesFilter, squadRating, type RatedItem } from '../src/index.js';

const item = (id: string, rating: number, extra: Partial<RatedItem> = {}): RatedItem => ({
  id,
  rating,
  rarity: 'COMMON',
  nationId: 1,
  leagueId: 10,
  clubId: 100,
  ...extra,
});

describe('squadRating', () => {
  it('equals the rating when all players are identical', () => {
    expect(squadRating(Array.from({ length: 11 }, () => 80))).toBe(80);
  });

  it('rewards players above the average', () => {
    const ratings = [90, ...Array.from({ length: 10 }, () => 80)];
    // sum 890, avg 80.909, excess 9.09 -> round(899.09)=899 -> floor(81.72)=81
    expect(squadRating(ratings)).toBe(81);
  });

  it('counts missing slots as zero', () => {
    expect(squadRating([80], 11)).toBeLessThan(80);
  });
});

describe('matchesFilter', () => {
  it('ANDs fields and ORs values within a field', () => {
    const it1 = item('a', 76, { rarity: 'RARE', nationId: 5 });
    expect(matchesFilter(it1, { rarities: ['RARE', 'SPECIAL'], qualities: ['GOLD'] })).toBe(true);
    expect(matchesFilter(it1, { rarities: ['RARE'], nationIds: [6] })).toBe(false);
    expect(matchesFilter(it1, { minRating: 77 })).toBe(false);
  });
});

describe('evaluateRequirement', () => {
  const squad = [item('a', 80, { clubId: 1 }), item('b', 70, { clubId: 1 }), item('c', 60, { clubId: 2 })];

  it.each<[SbcRequirement, boolean]>([
    [{ id: 'r1', type: 'MAX_SAME', dimension: 'club', count: 2 }, true],
    [{ id: 'r2', type: 'MAX_SAME', dimension: 'club', count: 1 }, false],
    [{ id: 'r3', type: 'MIN_UNIQUE', dimension: 'club', count: 2 }, true],
    [{ id: 'r4', type: 'MIN_COUNT', count: 2, filter: { minRating: 70 } }, true],
    [{ id: 'r5', type: 'MAX_COUNT', count: 0, filter: { qualities: ['BRONZE'] } }, false],
    [{ id: 'r6', type: 'PLAYER_RATING_RANGE', min: 60, max: 80 }, true],
    [{ id: 'r7', type: 'MIN_CHEMISTRY', value: 10 }, false],
    [{ id: 'r8', type: 'UNKNOWN', reason: 'x' }, false],
  ])('%j -> %s', (requirement, expected) => {
    expect(evaluateRequirement(requirement, squad, 3).satisfied).toBe(expected);
  });
});
