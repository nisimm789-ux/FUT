# ADR-004: Strict separation of READ and WRITE (actions)

- Status: Accepted
- Date: 2026-09-23

## Context
Automating EA actions (submitting SBCs, buying, listing, opening packs) carries
account and ToS risk and needs a far higher bar of safety, consent and review
than reading. Reading needs to evolve quickly. If both lived in one module, a
read change could accidentally enable a write.

## Decision
- WRITE lives in its own package, `@fc/ea-actions`: `EaActionAdapter`
  (`applySquad`, `submitSbc`, `moveItem`) plus `ActionPolicy`.
- READ packages (`ea-adapter`, `ui`, `solver`, `domain`, `contracts`,
  `club-engine`, `telemetry`) and the extension **must not import it**. ESLint
  and the architecture test enforce this.
- Phase 0 ships only `disabledActionPolicy` / `disabledActionAdapter`, which
  deny everything. `AdapterHealth.actions` is always `disabled`, and
  `RemoteConfig.actionsEnabled` is the literal `false`.
- Any future action must be user-initiated (`userInitiated: true` in the
  request type), trace back to a recommendation the user saw, pass
  `ActionPolicy`, and be switchable per action.

## Consequences
- + Reads can ship independently. Writes can be reviewed, flagged and killed independently.
- + Turning actions on takes a deliberate code and schema change, not a config flip.
- − A little duplication (an action adapter re-reads state it needs) is accepted to keep the paths independent.
