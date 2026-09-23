import type { EaContextKind } from '@fc/contracts';

export type KnownContext = Exclude<EaContextKind, 'UNKNOWN'>;

/**
 * A selector profile is the ONLY place that knows EA page structure.
 * When EA ships a UI change we add/replace a profile, not edit readers or UI.
 *
 * Rules:
 * - Prefer structural signals (class names, attributes, element nesting,
 *   numeric text, asset URL ids) over visible text; users run the Web App
 *   in many languages.
 * - Readers that a profile cannot support are simply left undefined; the
 *   adapter then reports the capability as `unsupported`.
 */
export interface SelectorProfile {
  readonly id: string;
  /** False until the profile has been validated against the live Web App. */
  readonly verified: boolean;
  /** Returns true if the document looks like the app shell this profile targets. */
  probe(doc: Document): boolean;
  /** Selector for the mounted view of each context, checked in the listed order. */
  readonly contextViews: readonly (readonly [KnownContext, string])[];
  /** Weak URL/hash hints, used only when no view structure matches. */
  readonly urlHints: readonly (readonly [KnownContext, RegExp])[];
  readonly sbc?: SbcSelectors;
  readonly club?: ClubSelectors;
}

export interface SbcSelectors {
  challengeRoot: string;
  challengeName: string;
  requirement: string;
  attrs: {
    challengeId: string;
    setId: string;
    squadSize: string;
    requirementId: string;
    requirementKind: string;
  };
}

export interface ClubSelectors {
  list: string;
  item: string;
  rating: string;
  position: string;
  name: string;
  price: string;
  portrait: string;
  nation: string;
  league: string;
  club: string;
  attrs: {
    itemId: string;
    listLocation: string;
    listComplete: string;
    position: string;
    coins: string;
  };
  /** Extract numeric ids from asset URLs (language-neutral). */
  assetIdPatterns: { definition: RegExp; nation: RegExp; league: RegExp; club: RegExp };
  rarityClasses: { COMMON: string; RARE: string; SPECIAL: string };
  untradeableClass: string;
}
