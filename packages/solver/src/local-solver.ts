import { CONTRACTS_VERSION, ProvenanceSchema, SolveProblemSchema, SolverStrategySchema, validateContract } from '@fc/contracts';
import type {
  ClubItem,
  ExclusionReason,
  SbcRequirement,
  SelectedItem,
  SolveProblem,
  SolveResult,
  SolveStatus,
} from '@fc/contracts';
import { countBy, dimensionValue, evaluateAll, matchesFilter, qualityInRange, requirementSupport, squadRating } from '@fc/domain';
import { spareItemIds } from '@fc/club-engine';
import { strategyCost } from './cost.js';
import type { SolverRuntime } from './runtime.js';

export const LOCAL_SOLVER_ID = 'local-greedy';
export const LOCAL_SOLVER_VERSION = '0.2.0';
const MAX_UPGRADE_ITERATIONS = 200;
const ELIGIBLE_LOCATIONS = new Set<ClubItem['location']>(['CLUB', 'SBC_STORAGE', 'UNASSIGNED']);

interface Candidate {
  item: ClubItem;
  cost: number;
}

interface Pick extends Candidate {
  reason: SelectedItem['reason'];
  requirementId: string | null;
}

export interface LocalSolverDeps {
  /** Monotonic clock for timing only; never influences the result. */
  now?: () => number;
}

/**
 * Phase 0 demonstration solver: deterministic greedy construction followed by
 * rating-upgrade swaps. It is intentionally simple; its value is proving the
 * contract flow and explainability, not optimality.
 *
 * Determinism: all ordering ties are broken by item id; no randomness, no clock
 * influence on decisions.
 */
export function solveLocally(input: SolveProblem, deps: LocalSolverDeps = {}): SolveResult {
  const now = deps.now ?? (() => globalThis.performance.now());
  const startedAt = now();
  const notes: string[] = [];

  const validated = validateContract(SolveProblemSchema, input);
  if (!validated.ok) {
    return emptyResult(input, 'INVALID_PROBLEM', validated.issues.slice(0, 5), startedAt, now);
  }
  const problem = validated.value;
  const { challenge, options } = problem;
  const requirements = challenge.requirements;

  // Fail closed: if any requirement cannot be verified, no squad is proposed.
  const unsupported = requirements.flatMap((r) => {
    const support = requirementSupport(r);
    return support.supported ? [] : [{ id: r.id, reason: support.reason }];
  });
  if (unsupported.length > 0) {
    const reasons = [...new Set(unsupported.map((u) => u.reason))].map((r) => `cannot verify requirement(s): ${r}`);
    return { ...emptyResult(problem, 'UNSUPPORTED', reasons, startedAt, now), unsupportedRequirementIds: unsupported.map((u) => u.id) };
  }
  if (options.maxAdditionalCoins > 0) notes.push('buying missing items is not implemented; using owned items only');

  const excluded: Record<ExclusionReason, number> = {
    PROTECTED: 0,
    NOT_ELIGIBLE_LOCATION: 0,
    VIOLATES_PLAYER_RATING_RANGE: 0,
    VIOLATES_PLAYER_QUALITY: 0,
    LOCKED_ITEM_MISSING: 0,
  };
  const protectedIds = new Set(options.protectedItemIds);
  const ratingRanges = requirements.filter((r) => r.type === 'PLAYER_RATING_RANGE');
  const qualityRanges = requirements.filter((r) => r.type === 'PLAYER_QUALITY');
  const spare = spareItemIds(problem.candidates);

  const pool: Candidate[] = [];
  for (const item of problem.candidates) {
    if (protectedIds.has(item.id)) excluded.PROTECTED += 1;
    else if (!ELIGIBLE_LOCATIONS.has(item.location)) excluded.NOT_ELIGIBLE_LOCATION += 1;
    else if (ratingRanges.some((r) => (r.min !== undefined && item.rating < r.min) || (r.max !== undefined && item.rating > r.max)))
      excluded.VIOLATES_PLAYER_RATING_RANGE += 1;
    else if (qualityRanges.some((r) => !qualityInRange(item.rating, r.min, r.max))) excluded.VIOLATES_PLAYER_QUALITY += 1;
    else pool.push({ item, cost: strategyCost(item, options.strategy, spare.has(item.id)) });
  }
  pool.sort(byCostThenId);

  const squad: Pick[] = [];
  for (const lockedId of [...options.lockedItemIds].sort()) {
    const candidate = pool.find((c) => c.item.id === lockedId);
    if (!candidate) {
      excluded.LOCKED_ITEM_MISSING += 1;
      notes.push(`locked item ${lockedId} is not an eligible candidate`);
      continue;
    }
    squad.push({ ...candidate, reason: 'LOCKED', requirementId: null });
  }

  const size = challenge.squadSize;
  const inSquad = (c: Candidate) => squad.some((p) => p.item.id === c.item.id);
  const canAdd = (c: Candidate) => squad.length < size && !inSquad(c) && respectsCaps(squad.map((p) => p.item), c.item, requirements);

  // Phase A: satisfy minimum/exact-count requirements with the cheapest matching items.
  for (const req of requirements) {
    if (req.type !== 'MIN_COUNT' && req.type !== 'EXACT_COUNT') continue;
    let have = squad.filter((p) => matchesFilter(p.item, req.filter)).length;
    for (const c of pool) {
      if (have >= req.count) break;
      if (matchesFilter(c.item, req.filter) && canAdd(c)) {
        squad.push({ ...c, reason: 'SATISFIES_REQUIREMENT', requirementId: req.id });
        have += 1;
      }
    }
  }

  // Phase A2: satisfy "min same" by concentrating on the value with the cheapest group.
  for (const req of requirements) {
    if (req.type !== 'MIN_SAME') continue;
    const have = Math.max(0, ...countBy(squad.map((p) => p.item), req.dimension).values());
    if (have >= req.count) continue;
    const groups = new Map<number, Candidate[]>();
    for (const c of pool) {
      const v = dimensionValue(c.item, req.dimension);
      groups.set(v, [...(groups.get(v) ?? []), c]);
    }
    const best = [...groups.entries()]
      .map(([value, members]) => ({ value, members, cost: members.slice(0, req.count).reduce((a, m) => a + m.cost, 0) }))
      .filter((g) => g.members.length >= req.count)
      .sort((a, b) => a.cost - b.cost || a.value - b.value)[0];
    if (!best) continue;
    let n = squad.filter((p) => dimensionValue(p.item, req.dimension) === best.value).length;
    for (const c of best.members) {
      if (n >= req.count) break;
      if (canAdd(c)) {
        squad.push({ ...c, reason: 'SATISFIES_REQUIREMENT', requirementId: req.id });
        n += 1;
      }
    }
  }

  // Phase B: satisfy minimum-unique requirements by adding new dimension values.
  for (const req of requirements) {
    if (req.type !== 'MIN_UNIQUE') continue;
    const values = new Set(squad.map((p) => dimensionValue(p.item, req.dimension)));
    for (const c of pool) {
      if (values.size >= req.count) break;
      const v = dimensionValue(c.item, req.dimension);
      if (!values.has(v) && canAdd(c)) {
        squad.push({ ...c, reason: 'SATISFIES_REQUIREMENT', requirementId: req.id });
        values.add(v);
      }
    }
  }

  // Phase C: fill remaining slots with the most expendable items.
  for (const c of pool) {
    if (squad.length >= size) break;
    if (canAdd(c)) squad.push({ ...c, reason: 'FILLER_LOWEST_COST', requirementId: null });
  }

  // Phase D: raise squad rating with the cheapest cost-per-rating-point swaps.
  let upgradeIterations = 0;
  const ratingReq = requirements.find((r) => r.type === 'MIN_SQUAD_RATING');
  const structural = requirements.filter((r) => r.type !== 'MIN_SQUAD_RATING');
  if (ratingReq && squad.length === size) {
    while (upgradeIterations < MAX_UPGRADE_ITERATIONS && currentRating(squad, size) < ratingReq.value) {
      const swap = bestUpgrade(squad, pool, structural, size);
      if (!swap) break;
      squad[swap.index] = { ...swap.candidate, reason: 'RATING_UPGRADE', requirementId: ratingReq.id };
      upgradeIterations += 1;
    }
  }

  const items = squad.map((p) => p.item);
  const evaluations = evaluateAll(requirements, items, size);
  const complete = squad.length === size && excluded.LOCKED_ITEM_MISSING === 0;
  const status: SolveStatus = complete && evaluations.every((e) => e.satisfied) ? 'SOLVED' : 'NO_SOLUTION';
  if (squad.length < size) notes.push(`only ${squad.length} of ${size} slots could be filled`);

  return {
    schemaVersion: CONTRACTS_VERSION,
    status,
    challengeId: challenge.challengeId,
    strategy: options.strategy,
    inputProvenance: { challenge: challenge.provenance, candidates: problem.candidatesProvenance },
    selected: squad.map((p) => ({ itemId: p.item.id, reason: p.reason, requirementId: p.requirementId, cost: p.cost })),
    squadRating: squad.length > 0 ? squadRating(items.map((i) => i.rating), size) : null,
    totalCost: squad.reduce((acc, p) => acc + p.cost, 0),
    additionalCoinsRequired: 0,
    evaluations,
    unsupportedRequirementIds: [],
    debug: {
      solverId: LOCAL_SOLVER_ID,
      solverVersion: LOCAL_SOLVER_VERSION,
      candidatesConsidered: pool.length,
      excluded,
      upgradeIterations,
      durationMs: Math.max(0, now() - startedAt),
      notes,
    },
  };
}

function byCostThenId(a: Candidate, b: Candidate): number {
  return a.cost - b.cost || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);
}

function currentRating(squad: readonly Pick[], size: number): number {
  return squadRating(squad.map((p) => p.item.rating), size);
}

/** Would adding `item` break a MAX_* cap or reuse a definition already in the squad? */
function respectsCaps(squad: readonly ClubItem[], item: ClubItem, requirements: readonly SbcRequirement[]): boolean {
  if (squad.some((s) => s.definitionId === item.definitionId)) return false;
  for (const req of requirements) {
    if ((req.type === 'MAX_COUNT' || req.type === 'EXACT_COUNT') && matchesFilter(item, req.filter)) {
      if (squad.filter((s) => matchesFilter(s, req.filter)).length >= req.count) return false;
    }
    if (req.type === 'MAX_SAME') {
      const v = dimensionValue(item, req.dimension);
      if (squad.filter((s) => dimensionValue(s, req.dimension) === v).length >= req.count) return false;
    }
    if (req.type === 'MAX_UNIQUE') {
      const values = new Set(squad.map((s) => dimensionValue(s, req.dimension)));
      if (!values.has(dimensionValue(item, req.dimension)) && values.size >= req.count) return false;
    }
  }
  return true;
}

function bestUpgrade(
  squad: readonly Pick[],
  pool: readonly Candidate[],
  structural: readonly SbcRequirement[],
  size: number,
): { index: number; candidate: Candidate } | null {
  let best: { index: number; candidate: Candidate; score: number } | null = null;
  const ids = new Set(squad.map((p) => p.item.id));
  for (let index = 0; index < squad.length; index += 1) {
    const current = squad[index];
    if (!current || current.reason === 'LOCKED') continue;
    const others = squad.filter((_, i) => i !== index).map((p) => p.item);
    for (const candidate of pool) {
      if (ids.has(candidate.item.id)) continue;
      const gain = candidate.item.rating - current.item.rating;
      if (gain <= 0) continue;
      if (!respectsCaps(others, candidate.item, structural)) continue;
      const next = [...others, candidate.item];
      if (!evaluateAll(structural, next, size).every((e) => e.satisfied)) continue;
      const score = (candidate.cost - current.cost) / gain;
      if (!best || score < best.score || (score === best.score && candidate.item.id < best.candidate.item.id)) {
        best = { index, candidate, score };
      }
    }
  }
  return best && { index: best.index, candidate: best.candidate };
}

function emptyResult(
  problem: SolveProblem,
  status: SolveStatus,
  notes: string[],
  startedAt: number,
  now: () => number,
): SolveResult {
  const challengeId =
    typeof problem?.challenge?.challengeId === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(problem.challenge.challengeId)
      ? problem.challenge.challengeId
      : 'invalid';
  const strategy = SolverStrategySchema.safeParse(problem?.options?.strategy).data ?? 'BALANCED';
  const challengeProvenance = ProvenanceSchema.safeParse(problem?.challenge?.provenance).data ?? 'MANUAL';
  const candidatesProvenance = ProvenanceSchema.safeParse(problem?.candidatesProvenance).data ?? 'MANUAL';
  return {
    schemaVersion: CONTRACTS_VERSION,
    status,
    challengeId,
    strategy,
    inputProvenance: { challenge: challengeProvenance, candidates: candidatesProvenance },
    selected: [],
    squadRating: null,
    totalCost: 0,
    additionalCoinsRequired: 0,
    evaluations: [],
    unsupportedRequirementIds: [],
    debug: {
      solverId: LOCAL_SOLVER_ID,
      solverVersion: LOCAL_SOLVER_VERSION,
      candidatesConsidered: 0,
      excluded: { PROTECTED: 0, NOT_ELIGIBLE_LOCATION: 0, VIOLATES_PLAYER_RATING_RANGE: 0, VIOLATES_PLAYER_QUALITY: 0, LOCKED_ITEM_MISSING: 0 },
      upgradeIterations: 0,
      durationMs: Math.max(0, now() - startedAt),
      notes,
    },
  };
}

export class LocalSolverRuntime implements SolverRuntime {
  readonly runtimeId = LOCAL_SOLVER_ID;
  constructor(private readonly deps: LocalSolverDeps = {}) {}

  solve(problem: SolveProblem): Promise<SolveResult> {
    return Promise.resolve(solveLocally(problem, this.deps));
  }
}
