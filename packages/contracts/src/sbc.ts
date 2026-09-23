import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { CatalogRefSchema, EpochMsSchema, IdSchema, RatingSchema } from './primitives.js';
import { QualitySchema, RaritySchema } from './club.js';

export const AttributeDimensionSchema = z.enum(['nation', 'league', 'club']);
export type AttributeDimension = z.infer<typeof AttributeDimensionSchema>;

/**
 * A predicate over a single item. All present fields must match (AND);
 * array fields match if the item value is any of the listed values (OR).
 */
export const ItemFilterSchema = z
  .object({
    rarities: z.array(RaritySchema).min(1).optional(),
    qualities: z.array(QualitySchema).min(1).optional(),
    nationIds: z.array(CatalogRefSchema).min(1).optional(),
    leagueIds: z.array(CatalogRefSchema).min(1).optional(),
    clubIds: z.array(CatalogRefSchema).min(1).optional(),
    minRating: RatingSchema.optional(),
    maxRating: RatingSchema.optional(),
  })
  .strict();
export type ItemFilter = z.infer<typeof ItemFilterSchema>;

const base = { id: IdSchema };

export const SbcRequirementSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('MIN_SQUAD_RATING'), value: RatingSchema }),
  /** At least `count` players matching `filter`. */
  z.object({ ...base, type: z.literal('MIN_COUNT'), count: z.number().int().min(1).max(11), filter: ItemFilterSchema }),
  /** At most `count` players matching `filter`. */
  z.object({ ...base, type: z.literal('MAX_COUNT'), count: z.number().int().min(0).max(11), filter: ItemFilterSchema }),
  /** Every player's rating must fall in [min, max]. */
  z.object({ ...base, type: z.literal('PLAYER_RATING_RANGE'), min: RatingSchema.optional(), max: RatingSchema.optional() }),
  /** At most `count` players sharing the same value of `dimension` (e.g. "Max 3 from same club"). */
  z.object({ ...base, type: z.literal('MAX_SAME'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /** At least `count` distinct values of `dimension`. */
  z.object({ ...base, type: z.literal('MIN_UNIQUE'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /** Chemistry needs positional assignment; represented now, solved in a later phase. */
  z.object({ ...base, type: z.literal('MIN_CHEMISTRY'), value: z.number().int().min(0).max(33) }),
  /**
   * The adapter saw a requirement it could not interpret. Consumers must fail
   * closed: a challenge containing UNKNOWN is never reported as solved.
   */
  z.object({ ...base, type: z.literal('UNKNOWN'), reason: z.string().max(120) }),
]);
export type SbcRequirement = z.infer<typeof SbcRequirementSchema>;
export type SbcRequirementType = SbcRequirement['type'];

export const SbcChallengeSnapshotSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  challengeId: IdSchema,
  setId: IdSchema.nullable(),
  name: z.string().min(1).max(120),
  /** Number of players the squad must contain. */
  squadSize: z.number().int().min(1).max(11),
  requirements: z.array(SbcRequirementSchema).min(1).max(20),
  source: z.enum(['ea-web', 'fixture', 'import']),
  observedAt: EpochMsSchema,
}).superRefine((snapshot, ctx) => {
  const ids = new Set<string>();
  for (const req of snapshot.requirements) {
    if (ids.has(req.id)) ctx.addIssue({ code: 'custom', message: `Duplicate requirement id ${req.id}` });
    ids.add(req.id);
    if ((req.type === 'MIN_COUNT' || req.type === 'MAX_COUNT') && req.count > snapshot.squadSize) {
      ctx.addIssue({ code: 'custom', message: `Requirement ${req.id} count exceeds squad size` });
    }
  }
});
export type SbcChallengeSnapshot = z.infer<typeof SbcChallengeSnapshotSchema>;
