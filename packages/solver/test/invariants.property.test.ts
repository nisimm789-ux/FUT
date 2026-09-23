import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { QUALITY_ORDER, qualityOf } from '@fc/contracts';
import type { ClubItem, SbcRequirement, SolverStrategy } from '@fc/contracts';
import { SolveResultSchema } from '@fc/contracts';
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
    case 'EXACT_COUNT':
      return squad.filter((i) => matches(i, req.filter)).length === req.count;
    case 'SQUAD_SIZE':
      return squad.length === req.count;
    case 'PLAYER_QUALITY': {
      const idx = (q: string) => QUALITY_ORDER.indexOf(q as (typeof QUALITY_ORDER)[number]);
      return squad.every((i) => (req.min === undefined || idx(qualityOf(i.rating)) >= idx(req.min)) && (req.max === undefined || idx(qualityOf(i.rating)) <= idx(req.max)));
    }
    case 'MIN_SAME':
    case 'MAX_UNIQUE': {
      const counts = new Map<number, number>();
      for (const i of squad) counts.set(key(i, req.dimension), (counts.get(key(i, req.dimension)) ?? 0) + 1);
      return req.type === 'MIN_SAME' ? Math.max(0, ...counts.values()) >= req.count : counts.size <= req.count;
    }
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

const clubArb = fc.oneof({ arbitrary: fc.integer({ min: 0, max: 12 }), weight: 1 }, { arbitrary: fc.integer({ min: 20, max: 45 }), weight: 4 }).chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => itemArb(i + 1))));

/** Present in ~40% of cases, so combinations stay varied but often satisfiable. */
const sometimes = <T,>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> =>
  fc.oneof({ arbitrary: fc.constant(undefined), weight: 3 }, { arbitrary: arb, weight: 2 });

const requirementsArb: fc.Arbitrary<SbcRequirement[]> = fc
  .record({
    rating: sometimes(fc.integer({ min: 60, max: 86 })),
    rare: sometimes(fc.integer({ min: 1, max: 5 })),
    maxSame: sometimes(fc.integer({ min: 2, max: 6 })),
    minUnique: sometimes(fc.integer({ min: 1, max: 4 })),
    maxBronze: sometimes(fc.integer({ min: 0, max: 3 })),
    minRating: sometimes(fc.integer({ min: 55, max: 75 })),
    exactRare: sometimes(fc.integer({ min: 0, max: 3 })),
    minSameLeague: sometimes(fc.integer({ min: 2, max: 6 })),
    maxUniqueNation: sometimes(fc.integer({ min: 2, max: 4 })),
    minQuality: sometimes(fc.constantFrom('BRONZE', 'SILVER', 'GOLD') as fc.Arbitrary<'BRONZE' | 'SILVER' | 'GOLD'>),
    squadSize: fc.boolean(),
  })
  .map((r) => {
    const reqs: SbcRequirement[] = [];
    const via = 'fixture' as const;
    if (r.rating !== undefined) reqs.push({ id: 'r-rating', via, type: 'MIN_SQUAD_RATING', value: r.rating });
    if (r.rare !== undefined && r.exactRare === undefined) reqs.push({ id: 'r-rare', via, type: 'MIN_COUNT', count: r.rare, filter: { rarities: ['RARE'] } });
    if (r.maxSame !== undefined) reqs.push({ id: 'r-same', via, type: 'MAX_SAME', dimension: 'club', count: r.maxSame });
    if (r.minUnique !== undefined) reqs.push({ id: 'r-unique', via, type: 'MIN_UNIQUE', dimension: 'league', count: r.minUnique });
    if (r.maxBronze !== undefined) reqs.push({ id: 'r-bronze', via, type: 'MAX_COUNT', count: r.maxBronze, filter: { qualities: ['BRONZE'] } });
    if (r.minRating !== undefined) reqs.push({ id: 'r-range', via, type: 'PLAYER_RATING_RANGE', min: r.minRating });
    if (r.exactRare !== undefined) reqs.push({ id: 'r-exact', via, type: 'EXACT_COUNT', count: r.exactRare, filter: { rarities: ['RARE'] } });
    if (r.minSameLeague !== undefined) reqs.push({ id: 'r-minsame', via, type: 'MIN_SAME', dimension: 'league', count: r.minSameLeague });
    if (r.maxUniqueNation !== undefined) reqs.push({ id: 'r-maxuniq', via, type: 'MAX_UNIQUE', dimension: 'nation', count: r.maxUniqueNation });
    if (r.minQuality !== undefined) reqs.push({ id: 'r-quality', via, type: 'PLAYER_QUALITY', min: r.minQuality });
    if (r.squadSize) reqs.push({ id: 'r-size', via, type: 'SQUAD_SIZE', count: 11 });
    if (reqs.length === 0) reqs.push({ id: 'r-rating', via, type: 'MIN_SQUAD_RATING', value: 60 });
    return reqs;
  });

const strategyArb = fc.constantFrom<SolverStrategy>('DUPLICATES_FIRST', 'MINIMUM_COINS', 'PRESERVE_HIGH_RATED', 'PRESERVE_TRADEABLES', 'BALANCED');

describe('solver invariants (property-based)', () => {
  it('every SOLVED result satisfies all requirements and respects protection, locks and eligibility', () => {
    let solved = 0;
    fc.assert(
      fc.property(clubArb, requirementsArb, strategyArb, fc.integer({ min: 0, max: 1_000 }), (club, requirements, strategy, seed) => {
        const eligible = club.filter((i) => i.location !== 'TRANSFER_LIST');
        const protectedIds = eligible.filter((_, i) => (i + seed) % 7 === 0).map((i) => i.id);
        const lockCandidate = eligible.find(
          (i) =>
            !protectedIds.includes(i.id) &&
            requirements.every((r) => (r.type !== 'PLAYER_RATING_RANGE' && r.type !== 'PLAYER_QUALITY') || independentlySatisfied(r, [i], 11)),
        );
        const lockedIds = lockCandidate && seed % 2 === 0 ? [lockCandidate.id] : [];
        const size = 11;
        const problem = makeProblem({ challengeId: 'prop', squadSize: size, requirements }, club, { strategy, protectedItemIds: protectedIds, lockedItemIds: lockedIds });
        // Every result, whatever its status, must satisfy the output contract.
        expect(SolveResultSchema.safeParse(solveLocally(problem, { now: () => 0 })).success).toBe(true);
        const result = solveLocally(problem, { now: () => 0 });

        // Determinism
        expect(solveLocally(problem, { now: () => 0 })).toEqual(result);

        if (result.status !== 'SOLVED') return;
        solved += 1;
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
      { numRuns: 400, seed: 42 },
    );
    // Guard against a vacuous property: enough generated cases must actually be solved.
    expect(solved).toBeGreaterThan(40);
  });
});

describe('fail-closed invariant (property-based)', () => {
  it('any challenge containing an unverifiable requirement is never SOLVED', () => {
    const unverifiable = fc.constantFrom<SbcRequirement>(
      { id: 'u-chem', via: 'fixture', type: 'MIN_CHEMISTRY', value: 10 },
      { id: 'u-totw', via: 'fixture', type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } },
      { id: 'u-tots', via: 'fixture', type: 'MAX_COUNT', count: 3, filter: { programs: ['TOTS'] } },
      { id: 'u-unknown', type: 'UNKNOWN', reason: 'UNRECOGNIZED_TEXT', structuralFingerprint: '12345678', rawSafeDescription: null },
    );
    fc.assert(
      fc.property(clubArb, requirementsArb, unverifiable, (club, requirements, extra) => {
        const result = solveLocally(makeProblem({ challengeId: 'u', squadSize: 11, requirements: [...requirements, extra] }, club), { now: () => 0 });
        expect(result.status).not.toBe('SOLVED');
        expect(result.status).toBe('UNSUPPORTED');
        expect(result.selected).toEqual([]);
      }),
      { numRuns: 150, seed: 7 },
    );
  });
});
