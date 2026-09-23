import { describe, expect, it } from 'vitest';
import type { SbcRequirement } from '@fc/contracts';
import { evaluateRequirement, matchesFilter, requirementSupport, squadRating, type RatedItem } from '../src/index.js';

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

  const via = 'fixture' as const;
  const unknown: SbcRequirement = { id: 'r8', type: 'UNKNOWN', reason: 'UNRECOGNIZED_TEXT', structuralFingerprint: '00000000', rawSafeDescription: null };
  it.each<[SbcRequirement, boolean]>([
    [{ id: 'r1', via, type: 'MAX_SAME', dimension: 'club', count: 2 }, true],
    [{ id: 'r2', via, type: 'MAX_SAME', dimension: 'club', count: 1 }, false],
    [{ id: 'r3', via, type: 'MIN_UNIQUE', dimension: 'club', count: 2 }, true],
    [{ id: 'r4', via, type: 'MIN_COUNT', count: 2, filter: { minRating: 70 } }, true],
    [{ id: 'r5', via, type: 'MAX_COUNT', count: 0, filter: { qualities: ['BRONZE'] } }, false],
    [{ id: 'r6', via, type: 'PLAYER_RATING_RANGE', min: 60, max: 80 }, true],
    [{ id: 'r7', via, type: 'MIN_CHEMISTRY', value: 10 }, false],
    [unknown, false],
    [{ id: 'r9', via, type: 'EXACT_COUNT', count: 1, filter: { minRating: 80 } }, true],
    [{ id: 'r10', via, type: 'EXACT_COUNT', count: 2, filter: { minRating: 80 } }, false],
    [{ id: 'r11', via, type: 'MIN_SAME', dimension: 'club', count: 2 }, true],
    [{ id: 'r12', via, type: 'MIN_SAME', dimension: 'club', count: 3 }, false],
    [{ id: 'r13', via, type: 'MAX_UNIQUE', dimension: 'club', count: 2 }, true],
    [{ id: 'r14', via, type: 'MAX_UNIQUE', dimension: 'club', count: 1 }, false],
    [{ id: 'r15', via, type: 'PLAYER_QUALITY', max: 'SILVER' }, false],
    [{ id: 'r16', via, type: 'PLAYER_QUALITY', min: 'BRONZE' }, true],
    [{ id: 'r17', via, type: 'SQUAD_SIZE', count: 3 }, true],
    // Programme filters cannot be verified: MAX would otherwise be trivially "true".
    [{ id: 'r18', via, type: 'MAX_COUNT', count: 0, filter: { programs: ['TOTW'] } }, false],
  ])('%j -> %s', (requirement, expected) => {
    expect(evaluateRequirement(requirement, squad, 3).satisfied).toBe(expected);
  });
});

describe('requirementSupport', () => {
  const via = 'fixture' as const;
  it('flags what cannot be verified yet', () => {
    expect(requirementSupport({ id: 'a', via, type: 'MIN_CHEMISTRY', value: 20 })).toEqual({ supported: false, reason: 'CHEMISTRY_NOT_IMPLEMENTED' });
    expect(requirementSupport({ id: 'b', via, type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } })).toEqual({ supported: false, reason: 'ITEM_PROGRAM_DATA_UNAVAILABLE' });
    expect(requirementSupport({ id: 'c', type: 'UNKNOWN', reason: 'AMBIGUOUS_TEXT', structuralFingerprint: '00000000', rawSafeDescription: null })).toEqual({ supported: false, reason: 'UNRECOGNIZED' });
    expect(requirementSupport({ id: 'd', via, type: 'MIN_SQUAD_RATING', value: 80 })).toEqual({ supported: true });
  });
});
