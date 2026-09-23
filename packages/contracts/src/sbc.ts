import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { CatalogRefSchema, EpochMsSchema, IdSchema, RatingSchema } from './primitives.js';
import { QualitySchema, RaritySchema } from './club.js';
import { ProvenanceSchema } from './provenance.js';

export const AttributeDimensionSchema = z.enum(['nation', 'league', 'club']);
export type AttributeDimension = z.infer<typeof AttributeDimensionSchema>;

/**
 * Card programme / special-card group such as TOTW, TOTS or IN_FORM.
 * Normalized tokens, never localized text.
 */
export const ProgramTagSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,31}$/);
export type ProgramTag = z.infer<typeof ProgramTagSchema>;

/**
 * A predicate over a single item. All present fields must match (AND);
 * array fields match if the item value is any of the listed values (OR).
 * An empty filter matches every item.
 */
export const ItemFilterSchema = z
  .object({
    rarities: z.array(RaritySchema).min(1).optional(),
    qualities: z.array(QualitySchema).min(1).optional(),
    programs: z.array(ProgramTagSchema).min(1).optional(),
    nationIds: z.array(CatalogRefSchema).min(1).optional(),
    leagueIds: z.array(CatalogRefSchema).min(1).optional(),
    clubIds: z.array(CatalogRefSchema).min(1).optional(),
    minRating: RatingSchema.optional(),
    maxRating: RatingSchema.optional(),
  })
  .strict();
export type ItemFilter = z.infer<typeof ItemFilterSchema>;

/**
 * How a requirement was obtained: explicit structure (attributes, asset ids),
 * the replaceable text-interpretation layer, or authored fixture data.
 */
export const RequirementViaSchema = z.enum(['structure', 'text', 'fixture']);
export type RequirementVia = z.infer<typeof RequirementViaSchema>;

const base = { id: IdSchema, via: RequirementViaSchema };
const count = z.number().int().min(0).max(11);

export const KNOWN_REQUIREMENT_TYPES = [
  'MIN_SQUAD_RATING',
  'MIN_CHEMISTRY',
  'SQUAD_SIZE',
  'MIN_COUNT',
  'MAX_COUNT',
  'EXACT_COUNT',
  'PLAYER_RATING_RANGE',
  'PLAYER_QUALITY',
  'MAX_SAME',
  'MIN_SAME',
  'MIN_UNIQUE',
  'MAX_UNIQUE',
] as const;

export const SbcRequirementSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('MIN_SQUAD_RATING'), value: RatingSchema }),
  /** Total squad chemistry. Needs positional assignment; represented, not yet solved. */
  z.object({ ...base, type: z.literal('MIN_CHEMISTRY'), value: z.number().int().min(0).max(33) }),
  /** "Number of players in the squad: N". Must agree with the snapshot's squadSize. */
  z.object({ ...base, type: z.literal('SQUAD_SIZE'), count: z.number().int().min(1).max(11) }),
  /** At least `count` players matching `filter`. */
  z.object({ ...base, type: z.literal('MIN_COUNT'), count: z.number().int().min(1).max(11), filter: ItemFilterSchema }),
  /** At most `count` players matching `filter`. */
  z.object({ ...base, type: z.literal('MAX_COUNT'), count, filter: ItemFilterSchema }),
  /** Exactly `count` players matching `filter`. */
  z.object({ ...base, type: z.literal('EXACT_COUNT'), count, filter: ItemFilterSchema }),
  /** Every player's rating must fall in [min, max]. */
  z
    .object({ ...base, type: z.literal('PLAYER_RATING_RANGE'), min: RatingSchema.optional(), max: RatingSchema.optional() })
    .refine((r) => r.min !== undefined || r.max !== undefined, 'range needs min or max'),
  /** Every player's quality (bronze/silver/gold) must fall in [min, max]. */
  z
    .object({ ...base, type: z.literal('PLAYER_QUALITY'), min: QualitySchema.optional(), max: QualitySchema.optional() })
    .refine((r) => r.min !== undefined || r.max !== undefined, 'quality needs min or max'),
  /** At most `count` players sharing one value of `dimension` ("Max 3 from same club"). */
  z.object({ ...base, type: z.literal('MAX_SAME'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /** At least `count` players sharing one value of `dimension` ("Same league count: min 5"). */
  z.object({ ...base, type: z.literal('MIN_SAME'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /** At least `count` distinct values of `dimension`. */
  z.object({ ...base, type: z.literal('MIN_UNIQUE'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /** At most `count` distinct values of `dimension`. */
  z.object({ ...base, type: z.literal('MAX_UNIQUE'), dimension: AttributeDimensionSchema, count: z.number().int().min(1).max(11) }),
  /**
   * A requirement the adapter saw but could not interpret. Consumers must fail
   * closed: a challenge containing UNKNOWN is never reported as solved.
   */
  z.object({
    id: IdSchema,
    type: z.literal('UNKNOWN'),
    reason: z.enum([
      'UNRECOGNIZED_KIND',
      'UNRECOGNIZED_TEXT',
      'AMBIGUOUS_TEXT',
      'AMBIGUOUS_LANGUAGE',
      'ENTITY_ID_UNAVAILABLE',
      'VALUE_UNPARSEABLE',
    ]),
    /** Stable hash of the requirement's shape with values masked; groups identical unknowns. */
    structuralFingerprint: z.string().regex(/^[0-9a-f]{8}$/),
    /** Sanitized, length-limited label for diagnostics. Never used for logic. */
    rawSafeDescription: z.string().max(120).nullable(),
  }),
]);
export type SbcRequirement = z.infer<typeof SbcRequirementSchema>;
export type SbcRequirementType = SbcRequirement['type'];
export type KnownSbcRequirement = Exclude<SbcRequirement, { type: 'UNKNOWN' }>;
export type UnknownSbcRequirement = Extract<SbcRequirement, { type: 'UNKNOWN' }>;

export const ChallengeIdKindSchema = z.enum(['EA', 'LOCAL_FINGERPRINT', 'FIXTURE']);
export type ChallengeIdKind = z.infer<typeof ChallengeIdKindSchema>;

export const SnapshotAdapterInfoSchema = z.object({
  adapterVersion: z.string().min(1).max(32),
  profileId: z.string().min(1).max(64),
  profileVerified: z.boolean(),
});
export type SnapshotAdapterInfo = z.infer<typeof SnapshotAdapterInfoSchema>;

export const SbcChallengeSnapshotSchema = z
  .object({
    schemaVersion: z.literal(CONTRACTS_VERSION),
    /** EA's id when exposed; otherwise a stable local fingerprint (`local-xxxxxxxx`). */
    challengeId: IdSchema,
    challengeIdKind: ChallengeIdKindSchema,
    setId: IdSchema.nullable(),
    /** Display name when safely available. */
    name: z.string().min(1).max(120).nullable(),
    /** Number of players the squad must contain. */
    squadSize: z.number().int().min(1).max(11),
    /** Player slots currently populated in EA's squad view, if observable. */
    filledSlots: z.number().int().min(0).max(11).nullable(),
    requirements: z.array(SbcRequirementSchema).min(1).max(20),
    /** Locale used to interpret text-derived requirements (null = none needed). */
    interpretationLocale: z.string().regex(/^[a-z]{2}(-[a-z0-9]{2,8})?$/).nullable(),
    provenance: ProvenanceSchema,
    /** Which adapter/profile produced it; null for authored fixtures/manual input. */
    adapter: SnapshotAdapterInfoSchema.nullable(),
    observedAt: EpochMsSchema,
  })
  .superRefine((snapshot, ctx) => {
    const ids = new Set<string>();
    for (const req of snapshot.requirements) {
      if (ids.has(req.id)) ctx.addIssue({ code: 'custom', message: `Duplicate requirement id ${req.id}` });
      ids.add(req.id);
      if ((req.type === 'MIN_COUNT' || req.type === 'MAX_COUNT' || req.type === 'EXACT_COUNT') && req.count > snapshot.squadSize) {
        ctx.addIssue({ code: 'custom', message: `Requirement ${req.id} count exceeds squad size` });
      }
      if (req.type === 'SQUAD_SIZE' && req.count !== snapshot.squadSize) {
        ctx.addIssue({ code: 'custom', message: `Requirement ${req.id} disagrees with squad size` });
      }
    }
    if (snapshot.filledSlots !== null && snapshot.filledSlots > snapshot.squadSize) {
      ctx.addIssue({ code: 'custom', message: 'filledSlots exceeds squadSize' });
    }
    if ((snapshot.challengeIdKind === 'LOCAL_FINGERPRINT') !== snapshot.challengeId.startsWith('local-')) {
      ctx.addIssue({ code: 'custom', message: 'challengeId/challengeIdKind mismatch' });
    }
  });
export type SbcChallengeSnapshot = z.infer<typeof SbcChallengeSnapshotSchema>;
