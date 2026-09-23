import { z } from 'zod';
import { CONTRACTS_VERSION } from './version.js';
import { CatalogRefSchema, CoinsSchema, EpochMsSchema, IdSchema, RatingSchema } from './primitives.js';
import { ProvenanceSchema } from './provenance.js';

export const RaritySchema = z.enum(['COMMON', 'RARE', 'SPECIAL']);
export type Rarity = z.infer<typeof RaritySchema>;

/** Derived from rating in FC: bronze <= 64, silver 65-74, gold >= 75. */
export const QualitySchema = z.enum(['BRONZE', 'SILVER', 'GOLD']);
export type Quality = z.infer<typeof QualitySchema>;

export const ItemLocationSchema = z.enum(['CLUB', 'SBC_STORAGE', 'UNASSIGNED', 'TRANSFER_LIST']);
export type ItemLocation = z.infer<typeof ItemLocationSchema>;

export const PositionSchema = z.enum([
  'GK', 'RB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RM', 'LM', 'RW', 'LW', 'ST',
]);
export type Position = z.infer<typeof PositionSchema>;

export const ClubItemSchema = z.object({
  /** Unique instance id of the owned item. */
  id: IdSchema,
  /** Catalog definition (the "card"); two items with the same definition are duplicates. */
  definitionId: CatalogRefSchema,
  name: z.string().min(1).max(80),
  rating: RatingSchema,
  rarity: RaritySchema,
  positions: z.array(PositionSchema).min(1).max(5),
  nationId: CatalogRefSchema,
  leagueId: CatalogRefSchema,
  clubId: CatalogRefSchema,
  tradeable: z.boolean(),
  location: ItemLocationSchema,
  /** Market estimate, if known. `null` = unknown, never interpret as free. */
  estimatedPrice: CoinsSchema.nullable(),
});
export type ClubItem = z.infer<typeof ClubItemSchema>;

export const ClubSnapshotSchema = z.object({
  schemaVersion: z.literal(CONTRACTS_VERSION),
  /** `complete` only if the source guarantees the whole club was read. */
  coverage: z.enum(['complete', 'partial']),
  items: z.array(ClubItemSchema).max(20_000),
  provenance: ProvenanceSchema,
  observedAt: EpochMsSchema,
}).superRefine((snapshot, ctx) => {
  const seen = new Set<string>();
  for (const item of snapshot.items) {
    if (seen.has(item.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate item id ${item.id}` });
      return;
    }
    seen.add(item.id);
  }
});
export type ClubSnapshot = z.infer<typeof ClubSnapshotSchema>;

export const QUALITY_ORDER: readonly Quality[] = ['BRONZE', 'SILVER', 'GOLD'];

export function qualityOf(rating: number): Quality {
  if (rating >= 75) return 'GOLD';
  if (rating >= 65) return 'SILVER';
  return 'BRONZE';
}
