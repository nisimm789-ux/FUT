import type {
  CapabilityName,
  ClubSnapshot,
  ParserFailureCategory,
  SbcChallengeSnapshot,
} from '@fc/contracts';

export type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; category: ParserFailureCategory; message: string };

export interface ReaderContext {
  now: number;
}

/** A reader turns a DOM subtree into a normalized contract. It never returns DOM nodes. */
export interface Reader<T> {
  readonly capability: CapabilityName;
  readonly supported: boolean;
  read(doc: Document, ctx: ReaderContext): ReadResult<T>;
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
