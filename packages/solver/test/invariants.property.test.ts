import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { qualityOf } from '@fc/contracts';
import type { ClubItem, SbcRequirement, SolverStrategy } from '@fc/contracts';
import { solveLocally } from '../src/index.js';
import { makeProblem } from './helpers.js';

/**
 * Independent re-implementation of the requirement checks (does NOT reuse
 * @fc/domain) so a bug in the shared evaluator cannot hide a solver bug.
 */
function independentlySatisfied(req: SbcRequirement, squad: ClubItem[], size: number): boolean {
  const matches = (i: ClubItem, f: Extract<SbcRequirement, { type: 'MIN_COUNT' }>['filter']) =>
    (!f.rarities || f.rarities.includes(i.rarity)) &&
    (!f.qualities || f.qualities.includes(qualityOf(i.rating))) &&
    (!f.nationIds || f.nationIds.includes(i.nationId)) &&
    (!f.leagueIds || f.leagueIds.includes(i.leagueId)) &&
    (!f.clubIds || f.clubIds.includes(i.clubId)) &&
    (f.minRating === undefined || i.rating >= f.minRating) &&
    (f.maxRating === undefined || i.rating <= f.maxRating);
  const key = (i: ClubItem, d: 'nation' | 'league' | 'club') => (d === 'nation' ? i.nationId : d === 'league' ? i.leagueId : i.clubId);
  switch (req.type) {
    case 'MIN_SQUAD_RATING': {
      const sum = squad.reduce((a, i) => a + i.rating, 0);
      const avg = sum / size;
      const excess = squad.reduce((a, i) => a + Math.max(0, i.rating - avg), 0);
      return Math.floor(Math.round(sum + excess) / size) >= req.value;
    }
    case 'MIN_COUNT':
      return squad.filter((i) => matches(i, req.filter)).length >= req.count;
    case 'MAX_COUNT':
      return squad.filter((i) => matches(i, req.filter)).length <= req.count;
    case 'PLAYER_RATING_RANGE':
      return squad.every((i) => (req.min === undefined || i.rating >= req.min) && (req.max === undefined || i.rating <= req.max));
    case 'MAX_SAME': {
      const counts = new Map<number, number>();
      for (const i of squad) counts.set(key(i, req.dimension), (counts.get(key(i, req.dimension)) ?? 0) + 1);
      return Math.max(0, ...counts.values()) <= req.count;
    }
    case 'MIN_UNIQUE':
      return new Set(squad.map((i) => key(i, req.dimension))).size >= req.count;
    default:
      return false;
  }
}

const itemArb = (index: number) =>
  fc.record({
    rating: fc.integer({ min: 55, max: 92 }),
    rarity: fc.constantFrom('COMMON', 'RARE', 'SPECIAL') as fc.Arbitrary<ClubItem['rarity']>,
    nationId: fc.constantFrom(14, 18, 21, 45),
    leagueId: fc.constantFrom(13, 16, 19, 53),
    clubId: fc.integer({ min: 1, max: 8 }),
    tradeable: fc.boolean(),
    location: fc.constantFrom('CLUB', 'SBC_STORAGE', 'TRANSFER_LIST') as fc.Arbitrary<ClubItem['location']>,
    price: fc.option(fc.integer({ min: 200, max: 50_000 }), { nil: null }),
    definitionId: fc.integer({ min: 1, max: 60 }),
  }).map(
    (r): ClubItem => ({
      id: `p${index}`,
      definitionId: r.definitionId,
      name: `Synthetic ${index}`,
      rating: r.rating,
      rarity: r.rarity,
      positions: ['CM'],
      nationId: r.nationId,
      leagueId: r.leagueId,
      clubId: r.clubId,
      tradeable: r.tradeable,
      location: r.location,
      estimatedPrice: r.tradeable ? r.price : null,
    }),
  );

const clubArb = fc.integer({ min: 0, max: 45 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => itemArb(i + 1))));

const requirementsArb: fc.Arbitrary<SbcRequirement[]> = fc
  .record({
    rating: fc.option(fc.integer({ min: 60, max: 86 }), { nil: undefined }),
    rare: fc.option(fc.integer({ min: 1, max: 5 }), { nil: undefined }),
    maxSame: fc.option(fc.integer({ min: 2, max: 6 }), { nil: undefined }),
    minUnique: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
    maxBronze: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
    minRating: fc.option(fc.integer({ min: 55, max: 75 }), { nil: undefined }),
  })
  .map((r) => {
    const reqs: SbcRequirement[] = [];
    if (r.rating !== undefined) reqs.push({ id: 'r-rating', type: 'MIN_SQUAD_RATING', value: r.rating });
    if (r.rare !== undefined) reqs.push({ id: 'r-rare', type: 'MIN_COUNT', count: r.rare, filter: { rarities: ['RARE'] } });
    if (r.maxSame !== undefined) reqs.push({ id: 'r-same', type: 'MAX_SAME', dimension: 'club', count: r.maxSame });
    if (r.minUnique !== undefined) reqs.push({ id: 'r-unique', type: 'MIN_UNIQUE', dimension: 'league', count: r.minUnique });
    if (r.maxBronze !== undefined) reqs.push({ id: 'r-bronze', type: 'MAX_COUNT', count: r.maxBronze, filter: { qualities: ['BRONZE'] } });
    if (r.minRating !== undefined) reqs.push({ id: 'r-range', type: 'PLAYER_RATING_RANGE', min: r.minRating });
    if (reqs.length === 0) reqs.push({ id: 'r-rating', type: 'MIN_SQUAD_RATING', value: 60 });
    return reqs;
  });

const strategyArb = fc.constantFrom<SolverStrategy>('DUPLICATES_FIRST', 'MINIMUM_COINS', 'PRESERVE_HIGH_RATED', 'PRESERVE_TRADEABLES', 'BALANCED');

describe('solver invariants (property-based)', () => {
  it('every SOLVED result satisfies all requirements and respects protection, locks and eligibility', () => {
    fc.assert(
      fc.property(clubArb, requirementsArb, strategyArb, fc.integer({ min: 0, max: 1_000 }), (club, requirements, strategy, seed) => {
        const eligible = club.filter((i) => i.location !== 'TRANSFER_LIST');
        const protectedIds = eligible.filter((_, i) => (i + seed) % 7 === 0).map((i) => i.id);
        const lockCandidate = eligible.find((i) => !protectedIds.includes(i.id) && requirements.every((r) => r.type !== 'PLAYER_RATING_RANGE' || i.rating >= (r.min ?? 0)));
        const lockedIds = lockCandidate && seed % 2 === 0 ? [lockCandidate.id] : [];
        const size = 11;
        const problem = makeProblem({ challengeId: 'prop', squadSize: size, requirements }, club, { strategy, protectedItemIds: protectedIds, lockedItemIds: lockedIds });
        const result = solveLocally(problem, { now: () => 0 });

        // Determinism
        expect(solveLocally(problem, { now: () => 0 })).toEqual(result);

        if (result.status !== 'SOLVED') return;
        const byId = new Map(club.map((i) => [i.id, i]));
        const squad = result.selected.map((s) => byId.get(s.itemId)).filter((i): i is ClubItem => i !== undefined);
        expect(squad).toHaveLength(size);
        expect(new Set(squad.map((i) => i.id)).size).toBe(size);
        expect(new Set(squad.map((i) => i.definitionId)).size).toBe(size);
        for (const i of squad) {
          expect(protectedIds).not.toContain(i.id);
          expect(i.location).not.toBe('TRANSFER_LIST');
        }
        for (const id of lockedIds) expect(squad.map((i) => i.id)).toContain(id);
        for (const req of requirements) expect(independentlySatisfied(req, squad, size)).toBe(true);
      }),
      { numRuns: 300, seed: 42 },
    );
  });
});
