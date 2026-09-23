import { AttributeDimensionSchema, CONTRACTS_VERSION, RaritySchema } from '@fc/contracts';
import type { ItemFilter, SbcChallengeSnapshot, SbcRequirement } from '@fc/contracts';
import type { SbcSelectors } from '../profiles/types.js';
import { optionalInt, parseIntStrict, requireAttr, requireElement } from './parse.js';
import { ReadFailure, type SbcReader } from './types.js';

/**
 * Reads the visible SBC challenge using structural requirement kinds, never
 * the localized requirement text. Unknown kinds become UNKNOWN requirements
 * so downstream consumers fail closed instead of silently ignoring them.
 */
export function createSbcReader(selectors: SbcSelectors): SbcReader {
  return {
    capability: 'sbcReading',
    supported: true,
    read(doc, ctx) {
      const root = requireElement(doc, selectors.challengeRoot, 'challenge root');
      const { attrs } = selectors;
      const squadSize = parseIntStrict(root.getAttribute(attrs.squadSize), 'squad size', 1, 11);
      const rawRequirements = [...root.querySelectorAll(selectors.requirement)];
      if (rawRequirements.length === 0) throw new ReadFailure('STRUCTURE_NOT_FOUND', 'no requirements found');

      const requirements = rawRequirements.map((el, index) =>
        parseRequirement(el, el.getAttribute(attrs.requirementId) ?? `req-${index + 1}`, requireAttr(el, attrs.requirementKind, 'requirement kind')),
      );

      const snapshot: SbcChallengeSnapshot = {
        schemaVersion: CONTRACTS_VERSION,
        challengeId: requireAttr(root, attrs.challengeId, 'challenge id'),
        setId: root.getAttribute(attrs.setId),
        name: (root.querySelector(selectors.challengeName)?.textContent ?? '').trim() || 'Unnamed challenge',
        squadSize,
        requirements,
        source: 'ea-web',
        observedAt: ctx.now,
      };
      return { ok: true, value: snapshot };
    },
  };
}

function parseFilter(el: Element): ItemFilter {
  const filter: ItemFilter = {};
  const rarity = el.getAttribute('data-req-rarity');
  if (rarity !== null) {
    const parsed = RaritySchema.safeParse(rarity);
    if (!parsed.success) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'unknown rarity');
    filter.rarities = [parsed.data];
  }
  const nation = optionalInt(el.getAttribute('data-req-nation'), 'nation', 0, 999_999);
  if (nation !== undefined) filter.nationIds = [nation];
  const league = optionalInt(el.getAttribute('data-req-league'), 'league', 0, 999_999);
  if (league !== undefined) filter.leagueIds = [league];
  const club = optionalInt(el.getAttribute('data-req-club'), 'club', 0, 999_999);
  if (club !== undefined) filter.clubIds = [club];
  const minRating = optionalInt(el.getAttribute('data-req-min-rating'), 'min rating', 1, 99);
  if (minRating !== undefined) filter.minRating = minRating;
  if (Object.keys(filter).length === 0) throw new ReadFailure('FIELD_MISSING', 'count requirement without filter');
  return filter;
}

function parseRequirement(el: Element, id: string, kind: string): SbcRequirement {
  const count = () => parseIntStrict(el.getAttribute('data-req-count'), 'count', 0, 11);
  const value = (max: number) => parseIntStrict(el.getAttribute('data-req-value'), 'value', 1, max);
  const dimension = () => {
    const parsed = AttributeDimensionSchema.safeParse(el.getAttribute('data-req-dimension'));
    if (!parsed.success) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'unknown dimension');
    return parsed.data;
  };
  switch (kind) {
    case 'squad-rating':
      return { id, type: 'MIN_SQUAD_RATING', value: value(99) };
    case 'min-count':
      return { id, type: 'MIN_COUNT', count: count(), filter: parseFilter(el) };
    case 'max-count':
      return { id, type: 'MAX_COUNT', count: count(), filter: parseFilter(el) };
    case 'max-same':
      return { id, type: 'MAX_SAME', dimension: dimension(), count: count() };
    case 'min-unique':
      return { id, type: 'MIN_UNIQUE', dimension: dimension(), count: count() };
    case 'rating-range': {
      const min = optionalInt(el.getAttribute('data-req-min'), 'min', 1, 99);
      const max = optionalInt(el.getAttribute('data-req-max'), 'max', 1, 99);
      return { id, type: 'PLAYER_RATING_RANGE', ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
    }
    case 'chemistry':
      return { id, type: 'MIN_CHEMISTRY', value: value(33) };
    default:
      return { id, type: 'UNKNOWN', reason: `unrecognized requirement kind` };
  }
}
