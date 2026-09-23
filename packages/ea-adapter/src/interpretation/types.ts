import type { Quality } from '@fc/contracts';

/**
 * Language-independent requirement subjects. Dictionaries map localized
 * phrases onto these; the interpreter maps subjects onto contracts.
 */
export const SUBJECTS = [
  'TEAM_RATING',
  'CHEMISTRY',
  'SQUAD_SIZE',
  'PLAYER_RATING',
  'PLAYER_QUALITY',
  'RARE',
  'GOLD',
  'SILVER',
  'BRONZE',
  'SAME_CLUB',
  'SAME_LEAGUE',
  'SAME_NATION',
  'UNIQUE_CLUBS',
  'UNIQUE_LEAGUES',
  'UNIQUE_NATIONS',
  'TOTW',
  'TOTS',
  'IN_FORM',
  'FROM_NATION',
  'FROM_LEAGUE',
  'FROM_CLUB',
  /**
   * Known phrasings of concepts we do not model (per-player chemistry,
   * loyalty, first owner...). Matching it forces UNKNOWN, so a longer
   * unsupported phrase can never be misread as a shorter supported one.
   */
  'OTHER',
] as const;
export type Subject = (typeof SUBJECTS)[number];

export type Operator = 'min' | 'max' | 'exact';

/**
 * Replaceable, data-only dictionary for one UI language. Phrases are written
 * in NORMALIZED form (lowercase, no diacritics, punctuation → spaces).
 * `verified` stays false until wording is confirmed against the live UI.
 */
export interface RequirementDictionary {
  locale: string;
  verified: boolean;
  operators: Record<Operator, readonly string[]>;
  subjects: Partial<Record<Subject, readonly string[]>>;
  qualities: Record<Quality, readonly string[]>;
}

/** Everything a reader can observe about one requirement row, without DOM nodes. */
export interface RequirementEvidence {
  text: string;
  assetIds: { nation: number[]; league: number[]; club: number[] };
}
