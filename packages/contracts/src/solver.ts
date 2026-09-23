import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { CoinsSchema, IdSchema } from './primitives.js';
import { ClubItemSchema } from './club.js';
import { SbcChallengeSnapshotSchema } from './sbc.js';

export const SolverStrategySchema = z.enum([
  'DUPLICATES_FIRST',
  'MINIMUM_COINS',
  'PRESERVE_HIGH_RATED',
  'PRESERVE_TRADEABLES',
  'BALANCED',
]);
export type SolverStrategy = z.infer<typeof SolverStrategySchema>;

export const SolverOptionsSchema = z.object({
  strategy: SolverStrategySchema,
  /** Never used in a solution. */
  protectedItemIds: z.array(IdSchema).max(20_000),
  /** Always used in a solution (if the solution is feasible at all). */
  lockedItemIds: z.array(IdSchema).max(11),
  /** Coins the user accepts spending on items they do not own. 0 = owned items only. */
  maxAdditionalCoins: CoinsSchema,
}).superRefine((options, ctx) => {
  const protectedSet = new Set(options.protectedItemIds);
  for (const id of options.lockedItemIds) {
    if (protectedSet.has(id)) ctx.addIssue({ code: 'custom', message: `Item ${id} is both locked and protected` });
  }
});
export type SolverOptions = z.infer<typeof SolverOptionsSchema>;

export const SolveProblemSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  challenge: SbcChallengeSnapshotSchema,
  candidates: z.array(ClubItemSchema).max(20_000),
  options: SolverOptionsSchema,
});
export type SolveProblem = z.infer<typeof SolveProblemSchema>;

export const SelectionReasonSchema = z.enum([
  'LOCKED',
  'SATISFIES_REQUIREMENT',
  'FILLER_LOWEST_COST',
  'RATING_UPGRADE',
]);
export type SelectionReason = z.infer<typeof SelectionReasonSchema>;

export const ExclusionReasonSchema = z.enum([
  'PROTECTED',
  'NOT_ELIGIBLE_LOCATION',
  'VIOLATES_PLAYER_RATING_RANGE',
  'LOCKED_ITEM_MISSING',
]);
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;

export const SelectedItemSchema = z.object({
  itemId: IdSchema,
  reason: SelectionReasonSchema,
  /** Requirement that motivated the pick, if any. */
  requirementId: IdSchema.nullable(),
  /** Strategy cost of using this item (lower = more "expendable"). */
  cost: z.number().finite(),
});
export type SelectedItem = z.infer<typeof SelectedItemSchema>;

export const RequirementEvaluationSchema = z.object({
  requirementId: IdSchema,
  type: z.string(),
  satisfied: z.boolean(),
  /** Human-readable, language-neutral detail such as "rating 84 >= 84". */
  detail: z.string().max(200),
});
export type RequirementEvaluation = z.infer<typeof RequirementEvaluationSchema>;

export const SolveStatusSchema = z.enum(['SOLVED', 'NO_SOLUTION', 'UNSUPPORTED', 'INVALID_PROBLEM']);
export type SolveStatus = z.infer<typeof SolveStatusSchema>;

export const SolveResultSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  status: SolveStatusSchema,
  challengeId: IdSchema,
  strategy: SolverStrategySchema,
  selected: z.array(SelectedItemSchema).max(11),
  squadRating: z.number().int().nullable(),
  totalCost: z.number().finite(),
  additionalCoinsRequired: CoinsSchema,
  evaluations: z.array(RequirementEvaluationSchema),
  /** Requirement types this solver version does not handle (status UNSUPPORTED). */
  unsupportedRequirementIds: z.array(IdSchema),
  debug: z.object({
    solverId: z.string(),
    solverVersion: z.string(),
    candidatesConsidered: z.number().int().nonnegative(),
    excluded: z.record(ExclusionReasonSchema, z.number().int().nonnegative()),
    upgradeIterations: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    notes: z.array(z.string().max(200)).max(20),
  }),
});
export type SolveResult = z.infer<typeof SolveResultSchema>;
