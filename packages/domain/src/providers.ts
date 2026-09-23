import type { ClubItem, ClubSnapshot, SbcChallengeSnapshot } from '@fc/contracts';

/**
 * Data-source ports. The domain depends on these, never on a concrete source.
 * Concrete providers: EaWebProvider (extension/DOM, Phase 0),
 * EaCommunityApiProvider / server-side providers (future).
 */

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ProviderError };

export interface ProviderError {
  /** Stable machine code, e.g. "UNSUPPORTED", "UNAVAILABLE", "PARSE_FAILED". */
  code: 'UNSUPPORTED' | 'UNAVAILABLE' | 'PARSE_FAILED' | 'DISABLED';
  message: string;
}

export interface ClubProvider {
  readonly providerId: string;
  getClubSnapshot(): Promise<ProviderResult<ClubSnapshot>>;
}

export interface SbcProvider {
  readonly providerId: string;
  getCurrentChallenge(): Promise<ProviderResult<SbcChallengeSnapshot>>;
}

export interface CatalogEntry {
  definitionId: number;
  name: string;
  rating: number;
}

export interface CatalogProvider {
  readonly providerId: string;
  getDefinitions(definitionIds: readonly number[]): Promise<ProviderResult<CatalogEntry[]>>;
}

export interface PriceQuote {
  definitionId: number;
  price: number | null;
  observedAt: number;
}

export interface PriceProvider {
  readonly providerId: string;
  getPrices(items: readonly Pick<ClubItem, 'definitionId'>[]): Promise<ProviderResult<PriceQuote[]>>;
}
