import { AttributeDimensionSchema, CONTRACTS_VERSION, RaritySchema } from '@fc/contracts';
import type { ItemFilter, SbcChallengeSnapshot, SbcRequirement, UnknownSbcRequirement } from '@fc/contracts';
import { fnv1a } from '../hash.js';
import { normalizeText } from '../interpretation/normalize.js';
import type { RequirementInterpreter } from '../interpretation/interpreter.js';
import type { SbcProfile } from '../profiles/types.js';
import { sanitizeText } from '../sanitize.js';
import { optionalInt, parseIntStrict, requireElement } from './parse.js';
import { extractRequirementRows, readSlots, sbcFingerprint, type RequirementRow } from './sbc-rows.js';
import { ReadFailure, type SbcReader } from './types.js';

/**
 * Reads the visible SBC challenge into a validated SbcChallengeSnapshot.
 *
 * Order of trust: explicit structure (attributes, asset ids) → the text
 * interpretation layer → UNKNOWN. Unrecognised requirements are kept as
 * UNKNOWN (never dropped, never guessed) so solving fails closed.
 */
export function createSbcReader(profile: SbcProfile, interpreter: RequirementInterpreter): SbcReader {
  return {
    capability: 'sbcReading',
    supported: true,
    fingerprint: (doc) => sbcFingerprint(doc, profile),
    read(doc, ctx) {
      const root = requireElement(doc, profile.requirementsRoot, 'requirements container');
      const rows = extractRequirementRows(root, profile);
      if (rows.length === 0) throw new ReadFailure('STRUCTURE_NOT_FOUND', 'no requirement rows found');
      if (rows.length > 20) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'implausible number of requirement rows');
      const warnings: string[] = [];
      const locales = new Set<string>();

      const requirements = rows.map((row, index): SbcRequirement => {
        const structural = profile.structural;
        const id = (structural && row.el.getAttribute(structural.requirementIdAttr)) || `req-${index + 1}`;
        const kind = structural ? row.el.getAttribute(structural.requirementKindAttr) : null;
        if (kind !== null) return parseStructural(row, id, kind);
        const interpretation = interpreter.interpret(row.evidence, ctx.locale);
        if (interpretation.ok) {
          locales.add(interpretation.locale);
          return { id, via: 'text', ...interpretation.requirement } as SbcRequirement;
        }
        return unknown(row, id, interpretation.reason);
      });

      const squadSize = resolveSquadSize(doc, root, profile, requirements, warnings);
      const slots = readSlots(doc, profile);
      let filledSlots: number | null = null;
      if (slots) {
        if (slots.filled <= squadSize) filledSlots = slots.filled;
        else warnings.push(`filled slots (${slots.filled}) exceed squad size (${squadSize}); ignoring slot state`);
      }

      const rawName = profile.name ? (doc.querySelector(profile.name)?.textContent ?? '') : '';
      const name = sanitizeText(rawName).text || null;
      const structural = profile.structural;
      const explicitId = structural ? root.getAttribute(structural.challengeIdAttr) : null;
      const challengeId =
        explicitId ?? `local-${fnv1a(JSON.stringify({ name, squadSize, rows: rows.map((r) => normalizeText(r.text)) }))}`;

      const snapshot: SbcChallengeSnapshot = {
        schemaVersion: CONTRACTS_VERSION,
        challengeId,
        challengeIdKind: explicitId === null ? 'LOCAL_FINGERPRINT' : ctx.provenance === 'EA_WEB_LIVE' ? 'EA' : 'FIXTURE',
        setId: structural ? root.getAttribute(structural.setIdAttr) : null,
        name,
        squadSize,
        filledSlots,
        requirements,
        interpretationLocale: locales.size === 0 ? null : ([...locales].sort()[0] ?? null),
        provenance: ctx.provenance,
        adapter: ctx.adapter,
        observedAt: ctx.now,
      };
      if (locales.size > 1) warnings.push(`requirements interpreted with several dictionaries: ${[...locales].sort().join(',')}`);
      return { ok: true, value: snapshot, warnings };
    },
  };
}

function resolveSquadSize(doc: Document, root: Element, profile: SbcProfile, requirements: SbcRequirement[], warnings: string[]): number {
  if (profile.structural) return parseIntStrict(root.getAttribute(profile.structural.squadSizeAttr), 'squad size', 1, 11);
  const declared = requirements.find((r) => r.type === 'SQUAD_SIZE');
  const slots = readSlots(doc, profile);
  if (declared?.type === 'SQUAD_SIZE') {
    if (slots && slots.active !== declared.count) warnings.push(`active slots (${slots.active}) differ from squad-size requirement (${declared.count})`);
    return declared.count;
  }
  if (slots && slots.active >= 1 && slots.active <= 11) return slots.active;
  throw new ReadFailure('FIELD_MISSING', 'squad size could not be determined');
}

function unknown(
  row: RequirementRow,
  id: string,
  reason: UnknownSbcRequirement['reason'],
  structuralFingerprint = row.structuralFingerprint,
): UnknownSbcRequirement {
  return { id, type: 'UNKNOWN', reason, structuralFingerprint, rawSafeDescription: sanitizeText(row.text).text || null };
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

/** Explicit structural encoding (fixtures). Unknown kinds become UNKNOWN. */
function parseStructural(row: RequirementRow, id: string, kind: string): SbcRequirement {
  const el = row.el;
  const via = 'structure' as const;
  const count = () => parseIntStrict(el.getAttribute('data-req-count'), 'count', 0, 11);
  const value = (max: number) => parseIntStrict(el.getAttribute('data-req-value'), 'value', 1, max);
  const dimension = () => {
    const parsed = AttributeDimensionSchema.safeParse(el.getAttribute('data-req-dimension'));
    if (!parsed.success) throw new ReadFailure('VALUE_OUT_OF_RANGE', 'unknown dimension');
    return parsed.data;
  };
  switch (kind) {
    case 'squad-rating':
      return { id, via, type: 'MIN_SQUAD_RATING', value: value(99) };
    case 'min-count':
      return { id, via, type: 'MIN_COUNT', count: count(), filter: parseFilter(el) };
    case 'max-count':
      return { id, via, type: 'MAX_COUNT', count: count(), filter: parseFilter(el) };
    case 'max-same':
      return { id, via, type: 'MAX_SAME', dimension: dimension(), count: count() };
    case 'min-unique':
      return { id, via, type: 'MIN_UNIQUE', dimension: dimension(), count: count() };
    case 'rating-range': {
      const min = optionalInt(el.getAttribute('data-req-min'), 'min', 1, 99);
      const max = optionalInt(el.getAttribute('data-req-max'), 'max', 1, 99);
      return { id, via, type: 'PLAYER_RATING_RANGE', ...(min !== undefined && { min }), ...(max !== undefined && { max }) };
    }
    case 'chemistry':
      return { id, via, type: 'MIN_CHEMISTRY', value: value(33) };
    default:
      return unknown(row, id, 'UNRECOGNIZED_KIND', fnv1a(`kind:${kind}`));
  }
}

