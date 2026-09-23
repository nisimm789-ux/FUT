import type { ItemFilter, KnownSbcRequirement, Quality, UnknownSbcRequirement } from '@fc/contracts';
import { DEFAULT_DICTIONARIES } from './dictionaries/index.js';
import { containsPhrase, normalizeText } from './normalize.js';
import type { Operator, RequirementDictionary, RequirementEvidence, Subject } from './types.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequirementBody = DistributiveOmit<KnownSbcRequirement, 'id' | 'via'>;
export type UnknownReason = UnknownSbcRequirement['reason'];

export type Interpretation =
  | { ok: true; requirement: RequirementBody; locale: string }
  | { ok: false; reason: UnknownReason; locale: string | null };

export interface RequirementInterpreter {
  /** `preferredLocale` is usually <html lang>; others are tried if it does not recognise the row. */
  interpret(evidence: RequirementEvidence, preferredLocale: string | null): Interpretation;
  readonly locales: readonly string[];
}

/**
 * The ONLY place where visible (localized) requirement text is given meaning.
 * Readers hand over evidence; dictionaries are data and can be replaced.
 * Every doubt resolves to UNKNOWN (fail closed), never to a guess.
 */
export function createRequirementInterpreter(dictionaries: readonly RequirementDictionary[] = DEFAULT_DICTIONARIES): RequirementInterpreter {
  return {
    locales: dictionaries.map((d) => d.locale),
    interpret(evidence, preferredLocale) {
      const base = preferredLocale?.toLowerCase().split('-')[0] ?? null;
      const preferred = dictionaries.find((d) => d.locale === base);
      if (preferred) {
        const own = interpretWith(preferred, evidence);
        if (own) return own;
      }
      const others = dictionaries.filter((d) => d !== preferred).map((d) => interpretWith(d, evidence)).filter((r) => r !== null);
      if (others.length === 0) return { ok: false, reason: 'UNRECOGNIZED_TEXT', locale: null };
      const first = others[0];
      if (!first) return { ok: false, reason: 'UNRECOGNIZED_TEXT', locale: null };
      const same = others.every((r) => JSON.stringify(r.ok ? r.requirement : r.reason) === JSON.stringify(first.ok ? first.requirement : first.reason));
      return same ? first : { ok: false, reason: 'AMBIGUOUS_LANGUAGE', locale: null };
    },
  };
}

/** Returns null when this dictionary does not recognise any subject in the text. */
function interpretWith(dict: RequirementDictionary, evidence: RequirementEvidence): Interpretation | null {
  const text = normalizeText(evidence.text);
  const fail = (reason: UnknownReason): Interpretation => ({ ok: false, reason, locale: dict.locale });
  const ok = (requirement: RequirementBody): Interpretation => ({ ok: true, requirement, locale: dict.locale });

  const subject = findSubject(dict, text);
  if (subject === null) return null;
  if (subject === 'AMBIGUOUS') return fail('AMBIGUOUS_TEXT');
  if (subject === 'OTHER') return fail('UNRECOGNIZED_TEXT');

  const ops = (Object.keys(dict.operators) as Operator[]).filter((op) => dict.operators[op].some((p) => containsPhrase(text, p)));
  if (ops.length > 1) return fail('AMBIGUOUS_TEXT');
  const op: Operator | null = ops[0] ?? null;
  const numbers = (text.match(/\d+/g) ?? []).map(Number);
  const single = numbers.length === 1 ? (numbers[0] ?? null) : null;

  switch (subject) {
    case 'TEAM_RATING':
      if (op !== null && op !== 'min') return fail('AMBIGUOUS_TEXT');
      return single !== null && single >= 1 && single <= 99 ? ok({ type: 'MIN_SQUAD_RATING', value: single }) : fail('VALUE_UNPARSEABLE');
    case 'CHEMISTRY':
      if (op !== null && op !== 'min') return fail('AMBIGUOUS_TEXT');
      return single !== null && single <= 33 ? ok({ type: 'MIN_CHEMISTRY', value: single }) : fail('VALUE_UNPARSEABLE');
    case 'SQUAD_SIZE':
      if (op !== null && op !== 'exact') return fail('AMBIGUOUS_TEXT');
      return single !== null && single >= 1 && single <= 11 ? ok({ type: 'SQUAD_SIZE', count: single }) : fail('VALUE_UNPARSEABLE');
    case 'PLAYER_RATING':
      if (single === null || single < 1 || single > 99) return fail('VALUE_UNPARSEABLE');
      if (op === 'min') return ok({ type: 'PLAYER_RATING_RANGE', min: single });
      if (op === 'max') return ok({ type: 'PLAYER_RATING_RANGE', max: single });
      return fail('AMBIGUOUS_TEXT');
    case 'PLAYER_QUALITY': {
      const qualities = (Object.keys(dict.qualities) as Quality[]).filter((q) => dict.qualities[q].some((p) => containsPhrase(text, p)));
      const quality = qualities.length === 1 ? qualities[0] : undefined;
      if (!quality || numbers.length > 0) return fail('VALUE_UNPARSEABLE');
      if (op === 'min') return ok({ type: 'PLAYER_QUALITY', min: quality });
      if (op === 'max') return ok({ type: 'PLAYER_QUALITY', max: quality });
      return ok({ type: 'PLAYER_QUALITY', min: quality, max: quality });
    }
    case 'SAME_CLUB':
    case 'SAME_LEAGUE':
    case 'SAME_NATION': {
      const dimension = subject === 'SAME_CLUB' ? 'club' : subject === 'SAME_LEAGUE' ? 'league' : 'nation';
      if (single === null || single < 1 || single > 11) return fail('VALUE_UNPARSEABLE');
      if (op === 'max') return ok({ type: 'MAX_SAME', dimension, count: single });
      if (op === 'min') return ok({ type: 'MIN_SAME', dimension, count: single });
      return fail('AMBIGUOUS_TEXT');
    }
    case 'UNIQUE_CLUBS':
    case 'UNIQUE_LEAGUES':
    case 'UNIQUE_NATIONS': {
      const dimension = subject === 'UNIQUE_CLUBS' ? 'club' : subject === 'UNIQUE_LEAGUES' ? 'league' : 'nation';
      if (single === null || single < 1 || single > 11) return fail('VALUE_UNPARSEABLE');
      if (op === 'min') return ok({ type: 'MIN_UNIQUE', dimension, count: single });
      if (op === 'max') return ok({ type: 'MAX_UNIQUE', dimension, count: single });
      return fail('AMBIGUOUS_TEXT');
    }
    default: {
      const filter = countFilter(subject, evidence);
      if (filter === null) return fail('ENTITY_ID_UNAVAILABLE');
      if (single === null || single > 11) return fail('VALUE_UNPARSEABLE');
      if (op === 'min') return single >= 1 ? ok({ type: 'MIN_COUNT', count: single, filter }) : fail('VALUE_UNPARSEABLE');
      if (op === 'max') return ok({ type: 'MAX_COUNT', count: single, filter });
      if (op === 'exact') return ok({ type: 'EXACT_COUNT', count: single, filter });
      return fail('AMBIGUOUS_TEXT');
    }
  }
}

function findSubject(dict: RequirementDictionary, text: string): Subject | 'AMBIGUOUS' | null {
  let bestLength = 0;
  let best = new Set<Subject>();
  for (const [subject, phrases] of Object.entries(dict.subjects) as [Subject, readonly string[]][]) {
    for (const phrase of phrases) {
      if (!containsPhrase(text, phrase)) continue;
      if (phrase.length > bestLength) {
        bestLength = phrase.length;
        best = new Set([subject]);
      } else if (phrase.length === bestLength) {
        best.add(subject);
      }
    }
  }
  if (best.size === 0) return null;
  return best.size === 1 ? [...best][0] ?? null : 'AMBIGUOUS';
}

function countFilter(subject: Subject, evidence: RequirementEvidence): ItemFilter | null {
  switch (subject) {
    case 'RARE':
      return { rarities: ['RARE'] };
    case 'GOLD':
      return { qualities: ['GOLD'] };
    case 'SILVER':
      return { qualities: ['SILVER'] };
    case 'BRONZE':
      return { qualities: ['BRONZE'] };
    case 'TOTW':
      return { programs: ['TOTW'] };
    case 'TOTS':
      return { programs: ['TOTS'] };
    case 'IN_FORM':
      return { programs: ['IN_FORM'] };
    // Named entities need language-neutral ids (from badge/flag asset URLs);
    // names are never mapped from text.
    case 'FROM_NATION':
      return evidence.assetIds.nation.length > 0 ? { nationIds: [...evidence.assetIds.nation].sort((a, b) => a - b) } : null;
    case 'FROM_LEAGUE':
      return evidence.assetIds.league.length > 0 ? { leagueIds: [...evidence.assetIds.league].sort((a, b) => a - b) } : null;
    case 'FROM_CLUB':
      return evidence.assetIds.club.length > 0 ? { clubIds: [...evidence.assetIds.club].sort((a, b) => a - b) } : null;
    default:
      return null;
  }
}
