import type { EaContextKind } from '@fc/contracts';

export type KnownContext = Exclude<EaContextKind, 'UNKNOWN'>;

/**
 * One way of recognising a context. Signals are scored and summed:
 *   view (+requires) = 3   structural marker of the mounted view (strongest)
 *   activeNav        = 2   selected navigation item (language-neutral icon class)
 *   route            = 1   URL path/hash pattern (weak: the Web App is an SPA)
 * `high` confidence requires the structural view signal.
 */
export interface ContextRule {
  readonly kind: KnownContext;
  readonly view?: string;
  /** Extra structure that must ALSO exist for `view` to count (disambiguation). */
  readonly requires?: string;
  readonly activeNav?: string;
  readonly route?: RegExp;
}

export const SIGNAL_WEIGHTS = { view: 3, activeNav: 2, route: 1 } as const;

/**
 * Evidence status of an individual selector/signature, tracked separately so a
 * profile can be partly proven against the live Web App.
 * - verified:   confirmed by a sanitized live inspection report
 * - unverified: hypothesis, still in use
 * - disabled:   known wrong or unproven and deliberately NOT used (result = unknown)
 */
export type SignatureStatus = 'verified' | 'unverified' | 'disabled';

/**
 * An EA adapter profile is the ONLY place that knows EA page structure.
 * When EA ships a UI change we add/replace a profile, not edit readers or UI.
 *
 * Rules:
 * - Prefer structural signals (class names, attributes, element nesting,
 *   numeric text, asset URL ids) over visible text; users run the Web App
 *   in many languages. Text interpretation lives only in /interpretation.
 * - Readers a profile cannot support are left undefined; the adapter then
 *   reports the capability as `unsupported`.
 */
export interface EaAdapterProfile {
  readonly id: string;
  readonly fcVersion: 'SYNTHETIC' | 'FC27';
  readonly profileVersion: string;
  /** False until the WHOLE profile is validated against the live Web App (shown in health + UI). */
  readonly verified: boolean;
  /** Per-signature evidence status (see SignatureStatus). */
  readonly signatures?: Readonly<Record<string, SignatureStatus>>;
  /** Targets the real EA Web App. Combined with an origin check to decide provenance. */
  readonly live: boolean;
  /** Returns true if the document looks like the app shell this profile targets. */
  probe(doc: Document): boolean;
  readonly contextRules: readonly ContextRule[];
  /** Navigation items, used by inspection mode to describe the shell. */
  readonly navigation?: { item: string; selectedClass: string };
  readonly sbc?: SbcProfile;
  readonly club?: ClubSelectors;
}

/** @deprecated Phase 0 name, kept for compatibility. */
export type SelectorProfile = EaAdapterProfile;

export interface AssetIdPatterns {
  nation: RegExp;
  league: RegExp;
  club: RegExp;
}

export interface SbcProfile {
  /** Document-level selector of the requirements container (observation scope #1). */
  requirementsRoot: string;
  /** Requirement rows, relative to requirementsRoot. */
  requirementRow: string;
  /** Any of these classes on a row marks it as currently met in EA's UI. */
  completedClasses: readonly string[];
  /** Document-level selector of the squad pitch (observation scope #2). */
  pitchRoot?: string;
  /**
   * Slots relative to pitchRoot; `filled`/`locked` are matched on or inside the
   * slot. Without a `filled` signature, occupancy is UNKNOWN (filledSlots = null)
   * rather than guessed.
   */
  slots?: { slot: string; filled?: string; locked?: string };
  /** Document-level selector for the challenge title (display only). */
  name?: string;
  /** Explicit structural encodings, when the page provides them (fixtures). */
  structural?: {
    challengeIdAttr: string;
    setIdAttr: string;
    squadSizeAttr: string;
    requirementIdAttr: string;
    requirementKindAttr: string;
  };
  assetIdPatterns: AssetIdPatterns;
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
