import { z } from 'zod';
import { AdapterFailureSchema, AdapterHealthSchema, AdapterPerfSchema } from './adapter.js';
import { DetectionSignalSchema, EaContextKindSchema } from './context.js';

/**
 * Sanitized, structural description of the current EA screen, produced by the
 * development-only Inspection Mode. Every schema is `.strict()` so nothing
 * outside this allow-list (cookies, storage, headers, raw HTML, input values,
 * account identifiers) can be carried, even by mistake.
 *
 * Deterministic: arrays are sorted, and the only timestamp lives in `meta`,
 * which the fixture converter drops.
 */

const Token = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
const AttrName = z.string().regex(/^data-[a-z0-9-]{1,48}$/);
/** Sanitized, length-limited text. Only captured inside SBC requirement rows. */
const SafeText = z.string().max(120);

export const TextShapeSchema = z
  .object({
    length: z.enum(['0', '1-8', '9-32', '33-120', '120+']),
    hasDigits: z.boolean(),
    hasLetters: z.boolean(),
  })
  .strict();
export type TextShape = z.infer<typeof TextShapeSchema>;

export interface InspectionNode {
  tag: string;
  role: string | null;
  classes: string[];
  otherClassCount: number;
  dataAttributes: string[];
  asset: { kind: string; id: number | null } | null;
  textShape: TextShape | null;
  text: string | null;
  children: InspectionNode[];
  truncatedChildren: number;
}

export const InspectionNodeSchema: z.ZodType<InspectionNode> = z.lazy(() =>
  z
    .object({
      tag: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
      role: Token.nullable(),
      /** Only EA `ut-*` view/component classes and an allow-list of state classes. */
      classes: z.array(Token).max(16),
      otherClassCount: z.number().int().nonnegative(),
      /** data-* attribute NAMES only; values are never exported. */
      dataAttributes: z.array(AttrName).max(16),
      /** Kind of image asset (e.g. "flags"); ids only for catalog entities in requirement rows. */
      asset: z.object({ kind: Token, id: z.number().int().nonnegative().nullable() }).strict().nullable(),
      textShape: TextShapeSchema.nullable(),
      text: SafeText.nullable(),
      children: z.array(InspectionNodeSchema).max(24),
      truncatedChildren: z.number().int().nonnegative(),
    })
    .strict(),
);

export const InspectionRequirementRowSchema = z
  .object({
    index: z.number().int().nonnegative(),
    structuralFingerprint: z.string().regex(/^[0-9a-f]{8}$/),
    text: SafeText.nullable(),
    completed: z.boolean().nullable(),
    assets: z.array(z.object({ kind: Token, id: z.number().int().nonnegative().nullable() }).strict()).max(8),
    /** What the interpreter made of the row: a known type, or UNKNOWN:<reason>. */
    interpretedAs: z.string().regex(/^[A-Z_]+(:[A-Z_]+)?$/),
  })
  .strict();

/**
 * Per-slot structural evidence for the SBC pitch, so an empty pitch can be
 * diffed against one with a player placed. Only structure and counts: no
 * text, no attribute values except tiny structural ones, no asset ids.
 */
export const InspectionSlotSchema = z
  .object({
    index: z.number().int().nonnegative(),
    /** What the ACTIVE profile concludes (null = no signature / unknown). */
    lockedBySignature: z.boolean().nullable(),
    filledBySignature: z.boolean().nullable(),
    /** Tri-state occupancy per the active profile (absent in reports from adapter < 0.3). */
    occupancy: z.enum(['EMPTY', 'FILLED', 'UNKNOWN', 'LOCKED']).optional(),
    /** Class tokens on the slot element itself (lowercased, id-like tokens dropped). */
    classes: z.array(Token).max(24),
    /** Class tokens found on descendants, with occurrence counts. */
    descendantClasses: z.array(z.object({ className: Token, count: z.number().int().positive() }).strict()).max(64),
    tagCounts: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,31}$/), z.number().int().positive()),
    descendantCount: z.number().int().nonnegative(),
    maxDepth: z.number().int().nonnegative(),
    imgCount: z.number().int().nonnegative(),
    canvasCount: z.number().int().nonnegative(),
    svgCount: z.number().int().nonnegative(),
    /** Image asset kinds only (e.g. "players"); never ids. */
    assetKinds: z.array(Token).max(8),
    /** Counts of non-empty text nodes; the text itself is never captured. */
    textNodes: z.object({ total: z.number().int().nonnegative(), withDigits: z.number().int().nonnegative(), withLetters: z.number().int().nonnegative() }).strict(),
    /** data-* attribute NAMES on the slot and its descendants. */
    dataAttributes: z.array(AttrName).max(24),
    /** Only tiny structural values (0-99 or short lowercase tokens), e.g. data-index="3". */
    safeDataValues: z.array(z.object({ name: AttrName, value: z.string().regex(/^([0-9]{1,2}|[a-z][a-z_-]{0,15})$/) }).strict()).max(16),
    /** Hash of the slot's structure (tags + classes + nesting), text-free. */
    structuralFingerprint: z.string().regex(/^[0-9a-f]{8}$/),
    tree: InspectionNodeSchema.nullable(),
  })
  .strict();
export type InspectionSlot = z.infer<typeof InspectionSlotSchema>;

export const InspectionReportSchema = z
  .object({
    reportVersion: z.literal(1),
    meta: z
      .object({
        generatedAt: z.string().datetime(),
        extensionVersion: z.string().max(32),
        adapterVersion: z.string().max(32),
        profileId: z.string().max(64),
        profileVerified: z.boolean(),
        profileVersion: z.string().max(16),
        signatures: z.record(z.string().regex(/^[a-z][A-Za-z0-9:_-]{0,63}$/), z.enum(['verified', 'unverified', 'disabled'])),
        fcVersion: z.string().max(16),
      })
      .strict(),
    location: z
      .object({
        origin: z.string().regex(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/),
        /** Path with id-like segments replaced by ":id". */
        path: z.string().max(200),
        /** Hash route, sanitized the same way. */
        route: z.string().max(200),
        /** Query parameter NAMES only. */
        queryKeys: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/)).max(16),
      })
      .strict(),
    document: z.object({ lang: z.string().max(16).nullable() }).strict(),
    context: z
      .object({ kind: EaContextKindSchema, confidence: z.enum(['high', 'low', 'none']), signals: z.array(DetectionSignalSchema) })
      .strict(),
    ruleScores: z
      .array(z.object({ kind: EaContextKindSchema, score: z.number().int().nonnegative(), signals: z.array(DetectionSignalSchema) }).strict())
      .max(16),
    views: z.array(z.object({ className: Token, count: z.number().int().positive() }).strict()).max(64),
    navigation: z.array(z.object({ classes: z.array(Token).max(8), selected: z.boolean() }).strict()).max(16),
    landmarks: z.record(z.string().regex(/^[a-z-]{1,24}$/), z.number().int().nonnegative()),
    sbc: z
      .object({
        rootFound: z.boolean(),
        requirementRows: z.array(InspectionRequirementRowSchema).max(20),
        pitchFound: z.boolean(),
        /** `filled` is null when the profile has no occupancy signature (unknown). */
        slots: z.object({ total: z.number().int(), filled: z.number().int().nullable(), locked: z.number().int() }).strict().nullable(),
        slotDetails: z.array(InspectionSlotSchema).max(30),
        tree: InspectionNodeSchema.nullable(),
      })
      .strict(),
    /** Heuristic: lists that look like requirement lists, for when the profile's selectors miss. */
    candidates: z
      .array(
        z
          .object({
            ancestry: z.array(Token).max(6),
            listTag: z.enum(['ul', 'ol', 'div']),
            rowCount: z.number().int().nonnegative(),
            rowClasses: z.array(Token).max(8),
            sample: InspectionNodeSchema.nullable(),
          })
          .strict(),
      )
      .max(10),
    readerDiagnostics: z
      .object({
        sbc: z
          .object({
            ok: z.boolean(),
            category: z.string().max(40).nullable(),
            message: z.string().max(200).nullable(),
            requirementTypes: z.array(z.string().max(24)),
            unknownCount: z.number().int().nonnegative(),
            warnings: z.array(z.string().max(160)).max(10),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    health: AdapterHealthSchema,
    validationFailures: z.array(AdapterFailureSchema).max(10),
    perf: AdapterPerfSchema,
    safety: z
      .object({
        redactions: z.number().int().nonnegative(),
        neverCollected: z.array(z.string().max(40)),
      })
      .strict(),
  })
  .strict();
export type InspectionReport = z.infer<typeof InspectionReportSchema>;
