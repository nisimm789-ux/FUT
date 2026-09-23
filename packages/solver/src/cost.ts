import type { ClubItem, SolverStrategy } from '@fc/contracts';

/**
 * Fallback coin estimate when a tradeable item has no price. Deliberately
 * conservative (never 0) so unknown prices are not treated as free.
 */
export function fallbackPrice(rating: number): number {
  if (rating < 75) return 300;
  return Math.round(500 * 2 ** ((rating - 75) / 2));
}

export function coinValue(item: ClubItem): number {
  if (!item.tradeable) return 0;
  return item.estimatedPrice ?? fallbackPrice(item.rating);
}

/**
 * Cost of consuming `item` in an SBC under a strategy. Lower = more expendable.
 * Weights are Phase 0 heuristics; the contract (a single finite number per item)
 * is what the future optimisation engine will keep.
 */
export function strategyCost(item: ClubItem, strategy: SolverStrategy, isSpare: boolean): number {
  const coins = coinValue(item);
  switch (strategy) {
    case 'MINIMUM_COINS':
      return coins + item.rating * 0.01;
    case 'DUPLICATES_FIRST':
      return (isSpare ? 0 : 100_000) + coins + item.rating;
    case 'PRESERVE_HIGH_RATED':
      return item.rating * 1_000 + coins * 0.001;
    case 'PRESERVE_TRADEABLES':
      return (item.tradeable ? 100_000 : 0) + item.rating * 10 + coins * 0.01;
    case 'BALANCED':
      return coins + item.rating * 50 - (isSpare ? 2_000 : 0);
  }
}
