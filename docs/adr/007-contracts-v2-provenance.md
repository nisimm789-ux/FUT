# ADR-007: Contracts v2 — explicit provenance everywhere

- Status: Accepted
- Date: 2026-09-23

## Context
Once real EA data exists next to synthetic fixtures, the UI must never present
one as the other. Phase 0's `source: 'ea-web' | 'fixture' | 'import'` was
coarse and absent from solve inputs and results.

## Decision
- Bump `CONTRACTS_VERSION` to 2. Snapshots carry
  `provenance: EA_WEB_LIVE | LOCAL_FIXTURE | IMPORTED_FIXTURE | MANUAL`.
  `SolveProblem.candidatesProvenance` and `SolveResult.inputProvenance` carry
  it through solving.
- v1 payloads are rejected (fail closed). They only ever lived in ephemeral
  `storage.session`, so no migration is needed.
- The adapter, not the reader, decides provenance (live profile AND EA origin).
- The UI shows badges, styles non-live data distinctly, and labels any result
  on non-live input as a demo.

## Consequences
- + "Is this real?" is answerable from any snapshot or result alone.
- + Mixed inputs (live SBC × demo club) are explicit rather than accidental.
- − A breaking contract change, handled by the version literal and tests.
