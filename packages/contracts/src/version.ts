/**
 * Version of the normalized contract family. Bump when a breaking change is made
 * to any snapshot shape; every snapshot carries it so persisted data and
 * server payloads can be migrated or rejected explicitly.
 *
 * v2 (Phase 1A): explicit `provenance` replaces `source`; richer SBC
 * requirement model; UNKNOWN requirements carry a structural fingerprint;
 * SBC snapshots carry identity kind, filled slots and adapter metadata.
 * v1 payloads are rejected (fail closed) — they only ever lived in ephemeral
 * session storage, so no migration is needed.
 */
export const CONTRACTS_VERSION = 2 as const;
export type ContractsVersion = typeof CONTRACTS_VERSION;
