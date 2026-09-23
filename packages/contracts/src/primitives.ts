import { z } from 'zod';

/** Opaque identifier for items, challenges, etc. Never contains markup or whitespace. */
export const IdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.:-]{1,80}$/, 'Invalid identifier');

/** EA ratings are bounded; anything outside is a parser failure, not data. */
export const RatingSchema = z.number().int().min(1).max(99);

export const EpochMsSchema = z.number().int().nonnegative();

/** Coins are non-negative integers. `null` means "unknown price", never zero. */
export const CoinsSchema = z.number().int().nonnegative();

export const CatalogRefSchema = z.number().int().nonnegative();
