import { qualityOf } from '@fc/contracts';
import type { ClubSnapshot, Quality, Rarity } from '@fc/contracts';
import { findDuplicateGroups } from './duplicates.js';

export interface ClubSummary {
  total: number;
  tradeable: number;
  duplicateGroups: number;
  byQuality: Record<Quality, number>;
  byRarity: Record<Rarity, number>;
}

/** Aggregate-only view of a club; safe to display and to include in debug reports. */
export function summarizeClub(snapshot: ClubSnapshot): ClubSummary {
  const byQuality: Record<Quality, number> = { BRONZE: 0, SILVER: 0, GOLD: 0 };
  const byRarity: Record<Rarity, number> = { COMMON: 0, RARE: 0, SPECIAL: 0 };
  let tradeable = 0;
  for (const item of snapshot.items) {
    byQuality[qualityOf(item.rating)] += 1;
    byRarity[item.rarity] += 1;
    if (item.tradeable) tradeable += 1;
  }
  return {
    total: snapshot.items.length,
    tradeable,
    duplicateGroups: findDuplicateGroups(snapshot.items).length,
    byQuality,
    byRarity,
  };
}
