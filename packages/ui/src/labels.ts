import type { ItemFilter, Provenance, SbcRequirement } from '@fc/contracts';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  EA_WEB_LIVE: 'LIVE EA',
  LOCAL_FIXTURE: 'FIXTURE',
  IMPORTED_FIXTURE: 'IMPORTED FIXTURE',
  MANUAL: 'MANUAL',
};

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

function filterLabel(filter: ItemFilter): string {
  const parts: string[] = [];
  if (filter.programs) parts.push(filter.programs.join('/'));
  if (filter.rarities) parts.push(filter.rarities.map(title).join('/'));
  if (filter.qualities) parts.push(filter.qualities.map(title).join('/'));
  if (filter.nationIds) parts.push(`Nation #${filter.nationIds.join('/#')}`);
  if (filter.leagueIds) parts.push(`League #${filter.leagueIds.join('/#')}`);
  if (filter.clubIds) parts.push(`Club #${filter.clubIds.join('/#')}`);
  if (filter.minRating !== undefined) parts.push(`OVR ≥ ${filter.minRating}`);
  if (filter.maxRating !== undefined) parts.push(`OVR ≤ ${filter.maxRating}`);
  return parts.length > 0 ? parts.join(', ') : 'Players';
}

const plural = { club: 'Clubs', league: 'Leagues', nation: 'Nations' } as const;

/** Human-readable, language-neutral (English UI) label for a normalized requirement. */
export function requirementLabel(r: SbcRequirement): string {
  switch (r.type) {
    case 'MIN_SQUAD_RATING':
      return `Squad Rating: ≥ ${r.value}`;
    case 'MIN_CHEMISTRY':
      return `Chemistry: ≥ ${r.value}`;
    case 'SQUAD_SIZE':
      return `Players in squad: ${r.count}`;
    case 'MIN_COUNT':
      return `${filterLabel(r.filter)}: ≥ ${r.count}`;
    case 'MAX_COUNT':
      return `${filterLabel(r.filter)}: ≤ ${r.count}`;
    case 'EXACT_COUNT':
      return `${filterLabel(r.filter)}: exactly ${r.count}`;
    case 'PLAYER_RATING_RANGE':
      return `Player rating: ${r.min !== undefined ? `≥ ${r.min}` : ''}${r.min !== undefined && r.max !== undefined ? ', ' : ''}${r.max !== undefined ? `≤ ${r.max}` : ''}`;
    case 'PLAYER_QUALITY':
      return r.min === r.max && r.min ? `Player quality: exactly ${title(r.min)}` : `Player quality: ${r.min ? `≥ ${title(r.min)}` : ''}${r.min && r.max ? ', ' : ''}${r.max ? `≤ ${title(r.max)}` : ''}`;
    case 'MAX_SAME':
      return `Same ${r.dimension}: ≤ ${r.count}`;
    case 'MIN_SAME':
      return `Same ${r.dimension}: ≥ ${r.count}`;
    case 'MIN_UNIQUE':
      return `${plural[r.dimension]}: ≥ ${r.count}`;
    case 'MAX_UNIQUE':
      return `${plural[r.dimension]}: ≤ ${r.count}`;
    case 'UNKNOWN':
      return `Not understood (${r.reason})${r.rawSafeDescription ? `: “${r.rawSafeDescription}”` : ''}`;
  }
}
