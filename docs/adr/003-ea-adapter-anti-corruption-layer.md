# ADR-003: EA adapter as an anti-corruption layer

- Status: Accepted
- Date: 2026-09-23

## Context
The EA FC Web App is third-party, undocumented, an SPA, localized, and changes
without notice. If EA selectors leaked into UI or domain code, every EA release
could break the whole product.

## Decision
- `packages/ea-adapter` is the **only** code that knows EA page structure. It
  converts DOM into **versioned, zod-validated contracts** (`EaContextSnapshot`,
  `SbcChallengeSnapshot`, `ClubSnapshot`, `AdapterHealth`, …). DOM nodes never
  leave it.
- Structure lives in **selector profiles**. Readers are built from a profile
  and can be replaced independently. Missing readers report `unsupported`.
- Prefer language-neutral structural signals (classes, attributes, numeric
  text, ids in asset URLs). Visible text is never used for meaning.
- **Fail closed:** strict parsing with categorized failures, re-validation of
  every output, `UNKNOWN` requirements instead of silent drops.
- `AdapterHealth` tracks each capability. SAFE_MODE disables reads after
  repeated failures or on remote command, while the rest of the product keeps
  running.
- The domain consumes the adapter through provider ports (`SbcProvider`,
  `ClubProvider`), so non-DOM sources can replace it.

## Consequences
- + An EA UI change is contained to one profile file plus fixtures.
- + Fixtures and golden files make CI independent of the live site.
- − The live profile needs validation against real sessions (see the architecture backlog).
- − Some data may only exist in EA's JS view models. That would need a separate, audited MAIN-world bridge ADR.
