/**
 * Version of the normalized contract family. Bump when a breaking change is made
 * to any snapshot shape; every snapshot carries it so persisted data and
 * server payloads can be migrated or rejected explicitly.
 */
export const CONTRACTS_VERSION = 1 as const;
export type ContractsVersion = typeof CONTRACTS_VERSION;
