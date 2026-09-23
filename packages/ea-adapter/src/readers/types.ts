import type {
  CapabilityName,
  ClubSnapshot,
  ParserFailureCategory,
  Provenance,
  SbcChallengeSnapshot,
  SnapshotAdapterInfo,
} from '@fc/contracts';

export type ReadResult<T> =
  | { ok: true; value: T; warnings?: string[] }
  | { ok: false; category: ParserFailureCategory; message: string };

export interface ReaderContext {
  now: number;
  /** Decided by the adapter from profile + origin; readers never guess it. */
  provenance: Provenance;
  adapter: SnapshotAdapterInfo;
  /** Page language (e.g. <html lang>), used only by the text interpretation layer. */
  locale: string | null;
}

/** A reader turns a DOM subtree into a normalized contract. It never returns DOM nodes. */
export interface Reader<T> {
  readonly capability: CapabilityName;
  readonly supported: boolean;
  read(doc: Document, ctx: ReaderContext): ReadResult<T>;
  /**
   * Cheap structural fingerprint of the state this reader depends on, or null
   * if its structure is absent. Used to skip re-reads when nothing relevant changed.
   */
  fingerprint?(doc: Document): string | null;
}

export type SbcReader = Reader<SbcChallengeSnapshot>;
export type ClubReader = Reader<ClubSnapshot>;

/** Placeholders so future readers have a home and a contract slot. */
export interface SquadSnapshotPlaceholder { readonly kind: 'squad'; }
export interface PackSnapshotPlaceholder { readonly kind: 'pack'; }
export interface EvolutionSnapshotPlaceholder { readonly kind: 'evolution'; }
export type SquadReader = Reader<SquadSnapshotPlaceholder>;
export type PackReader = Reader<PackSnapshotPlaceholder>;
export type EvolutionReader = Reader<EvolutionSnapshotPlaceholder>;

export class ReadFailure extends Error {
  constructor(
    readonly category: ParserFailureCategory,
    message: string,
  ) {
    super(message);
  }
}

export function unsupportedReader<T>(capability: CapabilityName): Reader<T> {
  return {
    capability,
    supported: false,
    read: () => ({ ok: false, category: 'PROFILE_MISMATCH', message: `${capability} is not supported by the active profile` }),
  };
}
