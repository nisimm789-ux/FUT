import { QUALITY_ORDER, qualityOf } from '@fc/contracts';
import type { AttributeDimension, ClubItem, ItemFilter, Quality, RequirementEvaluation, SbcRequirement } from '@fc/contracts';

/** Fields the requirement logic reads; lets callers pass full ClubItems or lighter shapes. */
export type RatedItem = Pick<ClubItem, 'id' | 'rating' | 'rarity' | 'nationId' | 'leagueId' | 'clubId'>;

export type RequirementSupport =
  | { supported: true }
  | { supported: false; reason: 'UNRECOGNIZED' | 'CHEMISTRY_NOT_IMPLEMENTED' | 'ITEM_PROGRAM_DATA_UNAVAILABLE' };

/**
 * Single source of truth for which requirements can be VERIFIED today.
 * Anything unsupported must make a solve UNSUPPORTED, never SOLVED.
 */
export function requirementSupport(requirement: SbcRequirement): RequirementSupport {
  switch (requirement.type) {
    case 'UNKNOWN':
      return { supported: false, reason: 'UNRECOGNIZED' };
    case 'MIN_CHEMISTRY':
      return { supported: false, reason: 'CHEMISTRY_NOT_IMPLEMENTED' };
    case 'MIN_COUNT':
    case 'MAX_COUNT':
    case 'EXACT_COUNT':
      // Club items do not carry programme membership (TOTW, TOTS...) yet, so a
      // programme filter cannot be evaluated — in particular MAX/EXACT would be
      // trivially (and wrongly) satisfied.
      return requirement.filter.programs ? { supported: false, reason: 'ITEM_PROGRAM_DATA_UNAVAILABLE' } : { supported: true };
    default:
      return { supported: true };
  }
}

export function matchesFilter(item: RatedItem, filter: ItemFilter): boolean {
  if (filter.programs) return false; // no programme data on items; see requirementSupport
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
 * NOTE: must be validated against live EA values.
 */
export function squadRating(ratings: readonly number[], squadSize = 11): number {
  if (squadSize <= 0) return 0;
  const sum = ratings.reduce((acc, r) => acc + r, 0);
  const average = sum / squadSize;
  const excess = ratings.reduce((acc, r) => acc + Math.max(0, r - average), 0);
  return Math.floor(Math.round(sum + excess) / squadSize);
}

export function countBy(items: readonly RatedItem[], dimension: AttributeDimension): Map<number, number> {
  const counts = new Map<number, number>();
  for (const item of items) {
    const key = dimensionValue(item, dimension);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function qualityInRange(rating: number, min: Quality | undefined, max: Quality | undefined): boolean {
  const q = QUALITY_ORDER.indexOf(qualityOf(rating));
  const lo = min === undefined ? 0 : QUALITY_ORDER.indexOf(min);
  const hi = max === undefined ? QUALITY_ORDER.length - 1 : QUALITY_ORDER.indexOf(max);
  return q >= lo && q <= hi;
}

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
  const support = requirementSupport(requirement);
  if (!support.supported) return result(false, `cannot verify: ${support.reason}`);

  switch (requirement.type) {
    case 'MIN_SQUAD_RATING': {
      const rating = squadRating(squad.map((i) => i.rating), squadSize);
      return result(rating >= requirement.value, `squad rating ${rating} >= ${requirement.value}`);
    }
    case 'SQUAD_SIZE':
      return result(squad.length === requirement.count, `${squad.length} players == ${requirement.count}`);
    case 'MIN_COUNT': {
      const n = squad.filter((i) => matchesFilter(i, requirement.filter)).length;
      return result(n >= requirement.count, `${n} matching >= ${requirement.count}`);
    }
    case 'MAX_COUNT': {
      const n = squad.filter((i) => matchesFilter(i, requirement.filter)).length;
      return result(n <= requirement.count, `${n} matching <= ${requirement.count}`);
    }
    case 'EXACT_COUNT': {
      const n = squad.filter((i) => matchesFilter(i, requirement.filter)).length;
      return result(n === requirement.count, `${n} matching == ${requirement.count}`);
    }
    case 'PLAYER_RATING_RANGE': {
      const bad = squad.filter(
        (i) =>
          (requirement.min !== undefined && i.rating < requirement.min) ||
          (requirement.max !== undefined && i.rating > requirement.max),
      ).length;
      return result(bad === 0, `${bad} players outside range [${requirement.min ?? 1}, ${requirement.max ?? 99}]`);
    }
    case 'PLAYER_QUALITY': {
      const bad = squad.filter((i) => !qualityInRange(i.rating, requirement.min, requirement.max)).length;
      return result(bad === 0, `${bad} players outside quality [${requirement.min ?? 'BRONZE'}, ${requirement.max ?? 'GOLD'}]`);
    }
    case 'MAX_SAME': {
      const max = Math.max(0, ...countBy(squad, requirement.dimension).values());
      return result(max <= requirement.count, `max same ${requirement.dimension} ${max} <= ${requirement.count}`);
    }
    case 'MIN_SAME': {
      const max = Math.max(0, ...countBy(squad, requirement.dimension).values());
      return result(max >= requirement.count, `max same ${requirement.dimension} ${max} >= ${requirement.count}`);
    }
    case 'MIN_UNIQUE': {
      const unique = countBy(squad, requirement.dimension).size;
      return result(unique >= requirement.count, `unique ${requirement.dimension} ${unique} >= ${requirement.count}`);
    }
    case 'MAX_UNIQUE': {
      const unique = countBy(squad, requirement.dimension).size;
      return result(unique <= requirement.count, `unique ${requirement.dimension} ${unique} <= ${requirement.count}`);
    }
    case 'MIN_CHEMISTRY':
    case 'UNKNOWN':
      return result(false, 'cannot verify');
  }
}

export function evaluateAll(
  requirements: readonly SbcRequirement[],
  squad: readonly RatedItem[],
  squadSize: number,
): RequirementEvaluation[] {
  return requirements.map((r) => evaluateRequirement(r, squad, squadSize));
}
