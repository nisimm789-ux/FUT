import { qualityOf } from '@fc/contracts';
import type { AttributeDimension, ClubItem, ItemFilter, RequirementEvaluation, SbcRequirement } from '@fc/contracts';

/** Fields the requirement logic reads; lets callers pass full ClubItems or lighter shapes. */
export type RatedItem = Pick<ClubItem, 'id' | 'rating' | 'rarity' | 'nationId' | 'leagueId' | 'clubId'>;

export function matchesFilter(item: RatedItem, filter: ItemFilter): boolean {
  if (filter.rarities && !filter.rarities.includes(item.rarity)) return false;
  if (filter.qualities && !filter.qualities.includes(qualityOf(item.rating))) return false;
  if (filter.nationIds && !filter.nationIds.includes(item.nationId)) return false;
  if (filter.leagueIds && !filter.leagueIds.includes(item.leagueId)) return false;
  if (filter.clubIds && !filter.clubIds.includes(item.clubId)) return false;
  if (filter.minRating !== undefined && item.rating < filter.minRating) return false;
  if (filter.maxRating !== undefined && item.rating > filter.maxRating) return false;
  return true;
}

export function dimensionValue(item: RatedItem, dimension: AttributeDimension): number {
  switch (dimension) {
    case 'nation':
      return item.nationId;
    case 'league':
      return item.leagueId;
    case 'club':
      return item.clubId;
  }
}

/**
 * Squad rating as commonly documented by the FC community:
 * each rating above the average contributes its excess once more,
 * then the total is rounded and divided by the squad size (floored).
 * Squads smaller than `squadSize` count missing slots as 0.
 * NOTE: must be validated against live EA values before Phase 1.
 */
export function squadRating(ratings: readonly number[], squadSize = 11): number {
  if (squadSize <= 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  const average = sum / squadSize;
  const excess = ratings.reduce((acc, r) => acc + Math.max(0, r - average), 0);
  return Math.floor(Math.round(sum + excess) / squadSize);
}

function countBy(items: readonly RatedItem[], dimension: AttributeDimension): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of items) {
    const key = dimensionValue(item, dimension);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Requirement types the Phase 0 evaluator can decide. */
export const EVALUABLE_REQUIREMENT_TYPES = new Set<SbcRequirement['type']>([
  'MIN_SQUAD_RATING',
  'MIN_COUNT',
  'MAX_COUNT',
  'PLAYER_RATING_RANGE',
  'MAX_SAME',
  'MIN_UNIQUE',
]);

export function evaluateRequirement(
  requirement: SbcRequirement,
  squad: readonly RatedItem[],
  squadSize: number,
): RequirementEvaluation {
  const result = (satisfied: boolean, detail: string): RequirementEvaluation => ({
    requirementId: requirement.id,
    type: requirement.type,
    satisfied,
    detail,
  });

  switch (requirement.type) {
    case 'MIN_SQUAD_RATING': {
      const rating = squadRating(squad.map((i) => i.rating), squadSize);
      return result(rating >= requirement.value, `squad rating ${rating} >= ${requirement.value}`);
    }
    case 'MIN_COUNT': {
      const n = squad.filter((i) => matchesFilter(i, requirement.filter)).length;
      return result(n >= requirement.count, `${n} matching >= ${requirement.count}`);
    }
    case 'MAX_COUNT': {
      const n = squad.filter((i) => matchesFilter(i, requirement.filter)).length;
      return result(n <= requirement.count, `${n} matching <= ${requirement.count}`);
    }
    case 'PLAYER_RATING_RANGE': {
      const bad = squad.filter(
        (i) =>
          (requirement.min !== undefined && i.rating < requirement.min) ||
          (requirement.max !== undefined && i.rating > requirement.max),
      ).length;
      return result(bad === 0, `${bad} players outside range [${requirement.min ?? 1}, ${requirement.max ?? 99}]`);
    }
    case 'MAX_SAME': {
      const max = Math.max(0, ...countBy(squad, requirement.dimension).values());
      return result(max <= requirement.count, `max same ${requirement.dimension} ${max} <= ${requirement.count}`);
    }
    case 'MIN_UNIQUE': {
      const unique = countBy(squad, requirement.dimension).size;
      return result(unique >= requirement.count, `unique ${requirement.dimension} ${unique} >= ${requirement.count}`);
    }
    case 'MIN_CHEMISTRY':
      return result(false, 'chemistry evaluation not supported yet');
    case 'UNKNOWN':
      return result(false, `unrecognized requirement: ${requirement.reason}`);
  }
}

export function evaluateAll(
  requirements: readonly SbcRequirement[],
  squad: readonly RatedItem[],
  squadSize: number,
): RequirementEvaluation[] {
  return requirements.map((r) => evaluateRequirement(r, squad, squadSize));
}
