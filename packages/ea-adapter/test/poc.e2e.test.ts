import { describe, expect, it } from 'vitest';
import { CONTRACTS_VERSION, SolveResultSchema } from '@fc/contracts';
import { summarizeClub } from '@fc/club-engine';
import { LocalSolverRuntime } from '@fc/solver';
import { createEaWebAdapter } from '../src/index.js';
import { loadPage } from './helpers.js';

/**
 * Phase 0 end-to-end (internal): fixture page -> EA adapter -> normalized
 * snapshots -> solver -> SolveResult. No browser extension runtime and no
 * live EA site involved.
 */
describe('POC pipeline: fixture -> adapter -> snapshot -> solver -> result', () => {
  it('produces a deterministic, valid, satisfying solution', async () => {
    const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href, now: () => 0 });

    loadPage('club');
    expect(adapter.detectContext().kind).toBe('CLUB');
    const club = adapter.readClub();
    if (!club.ok) throw new Error(club.message);
    expect(summarizeClub(club.value).total).toBe(42);

    loadPage('sbc-challenge');
    expect(adapter.detectContext().kind).toBe('SBC_CHALLENGE');
    const sbc = adapter.readSbcChallenge();
    if (!sbc.ok) throw new Error(sbc.message);

    const runtime = new LocalSolverRuntime({ now: () => 0 });
    const problem = {
      schemaVersion: CONTRACTS_VERSION,
      challenge: sbc.value,
      candidates: club.value.items,
      candidatesProvenance: club.value.provenance,
      options: { strategy: 'BALANCED' as const, protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
    };
    const result = SolveResultSchema.parse(await runtime.solve(problem));
    expect(result.status).toBe('SOLVED');
    expect(result.evaluations.every((e) => e.satisfied)).toBe(true);
    expect(await runtime.solve(problem)).toEqual(result);

    const health = adapter.health.snapshot();
    expect(health.capabilities).toMatchObject({ contextDetection: 'healthy', sbcReading: 'healthy', clubReading: 'healthy', actions: 'disabled' });
  });
});
