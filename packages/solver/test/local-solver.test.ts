import { describe, expect, it } from 'vitest';
import { SolveResultSchema } from '@fc/contracts';
import { loadClubFixture, loadSbcFixture } from '@fc/ea-fixtures';
import { LocalSolverRuntime, solveLocally } from '../src/index.js';
import { makeItem, makeProblem } from './helpers.js';

const fixedClock = { now: () => 0 };

describe('solveLocally', () => {
  it('solves the synthetic fixture challenge and explains every pick', () => {
    const club = loadClubFixture();
    const result = solveLocally(makeProblem(loadSbcFixture(), club.items), fixedClock);
    expect(SolveResultSchema.parse(result)).toBeTruthy();
    expect(result.status).toBe('SOLVED');
    expect(result.selected).toHaveLength(11);
    expect(result.evaluations.every((e) => e.satisfied)).toBe(true);
    for (const pick of result.selected) {
      expect(['LOCKED', 'SATISFIES_REQUIREMENT', 'FILLER_LOWEST_COST', 'RATING_UPGRADE']).toContain(pick.reason);
      expect(Number.isFinite(pick.cost)).toBe(true);
    }
  });

  it('is deterministic, including under input reordering', () => {
    const club = loadClubFixture();
    const a = solveLocally(makeProblem(loadSbcFixture(), club.items), fixedClock);
    const b = solveLocally(makeProblem(loadSbcFixture(), [...club.items].reverse()), fixedClock);
    expect(b).toEqual(a);
  });

  it('never uses protected items and always keeps locked items', () => {
    const club = loadClubFixture();
    const first = solveLocally(makeProblem(loadSbcFixture(), club.items), fixedClock);
    const protectedIds = first.selected.slice(0, 3).map((s) => s.itemId);
    const locked = club.items.find((i) => i.rating >= 80 && !protectedIds.includes(i.id));
    expect(locked).toBeDefined();
    const result = solveLocally(
      makeProblem(loadSbcFixture(), club.items, { protectedItemIds: protectedIds, lockedItemIds: [locked?.id ?? ''] }),
      fixedClock,
    );
    const ids = result.selected.map((s) => s.itemId);
    expect(ids).toContain(locked?.id);
    for (const p of protectedIds) expect(ids).not.toContain(p);
    expect(result.debug.excluded.PROTECTED).toBe(3);
    expect(result.selected.find((s) => s.itemId === locked?.id)?.reason).toBe('LOCKED');
  });

  it('prefers spare duplicates under DUPLICATES_FIRST', () => {
    const club = loadClubFixture();
    const result = solveLocally(makeProblem(loadSbcFixture(), club.items, { strategy: 'DUPLICATES_FIRST' }), fixedClock);
    const storageIds = club.items.filter((i) => i.location === 'SBC_STORAGE').map((i) => i.id);
    const usedStorage = result.selected.filter((s) => storageIds.includes(s.itemId)).length;
    expect(usedStorage).toBeGreaterThan(0);
  });

  it('returns UNSUPPORTED (fail closed) for chemistry or unknown requirements', () => {
    const items = Array.from({ length: 11 }, (_, i) => makeItem(`p${i + 1}`));
    const result = solveLocally(
      makeProblem(
        { challengeId: 'c', squadSize: 11, requirements: [{ id: 'r1', type: 'MIN_CHEMISTRY', value: 20 }, { id: 'r2', type: 'UNKNOWN', reason: 'x' }] },
        items,
      ),
      fixedClock,
    );
    expect(result.status).toBe('UNSUPPORTED');
    expect(result.unsupportedRequirementIds).toEqual(['r1', 'r2']);
    expect(result.selected).toEqual([]);
  });

  it('returns NO_SOLUTION with evaluations when the club cannot satisfy it', () => {
    const items = Array.from({ length: 11 }, (_, i) => makeItem(`p${i + 1}`, { rating: 60 }));
    const result = solveLocally(makeProblem({ challengeId: 'c', squadSize: 11, requirements: [{ id: 'r1', type: 'MIN_SQUAD_RATING', value: 85 }] }, items), fixedClock);
    expect(result.status).toBe('NO_SOLUTION');
    expect(result.evaluations[0]?.satisfied).toBe(false);
  });

  it('returns INVALID_PROBLEM for malformed input instead of throwing', () => {
    const result = solveLocally({ nonsense: true } as never, fixedClock);
    expect(result.status).toBe('INVALID_PROBLEM');
    expect(SolveResultSchema.safeParse(result).success).toBe(true);
  });

  it('never selects two items with the same definition', () => {
    const items = [makeItem('p1', { definitionId: 7 }), makeItem('p2', { definitionId: 7 }), makeItem('p3', { definitionId: 8 })];
    const result = solveLocally(makeProblem({ challengeId: 'c', squadSize: 2, requirements: [{ id: 'r', type: 'MIN_SQUAD_RATING', value: 1 }] }, items), fixedClock);
    const defs = result.selected.map((s) => items.find((i) => i.id === s.itemId)?.definitionId);
    expect(new Set(defs).size).toBe(defs.length);
  });

  it('LocalSolverRuntime wraps the same solver', async () => {
    const runtime = new LocalSolverRuntime(fixedClock);
    const club = loadClubFixture();
    const problem = makeProblem(loadSbcFixture(), club.items);
    expect(await runtime.solve(problem)).toEqual(solveLocally(problem, fixedClock));
  });
});
