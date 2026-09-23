# ADR-006: Live FC 27 adapter — structure first, isolated text interpretation, inspection-driven verification

- Status: Accepted
- Date: 2026-09-23

## Context
Phase 1A must read real SBC challenges from the FC 27 Web App. The adapter runs
in the ISOLATED world and can only see rendered DOM. EA shows SBC requirements
as localized text, and the product must work in many languages. The live
selectors could not be verified from the development environment (ea.com is
unreachable there and needs a logged-in account). Guessing and hoping would
produce confident nonsense.

## Decision
1. **Structure first.** Use class structure, tab-bar icon classes, slot
   structure, completion classes and numeric ids in asset URLs wherever they exist.
2. **Isolated, replaceable text interpretation.** When meaning must come from
   text, only `ea-adapter/src/interpretation/` may do it, using data-only
   dictionaries per language (en/de/fr/es to start). Doubt resolves to
   `UNKNOWN` (ambiguous language, ambiguous text, unmodelled concept, missing
   entity id), never to a guess. Enforced by the architecture test.
3. **Named FC 27 profile, explicitly unverified.** `fc27-live` holds every
   selector and is `verified: false` until real captured fixtures back it (a
   test enforces this). Verification state is visible in health, snapshots and UI.
4. **Inspection-driven verification.** A development-only Inspection Mode
   exports a strict, sanitized, deterministic structural report. It converts
   into minimal regression fixtures (`pnpm fixtures:from-report`), and a CI
   gate rejects sensitive content anywhere under `fixtures/`.
5. **Provenance by profile AND origin.** `EA_WEB_LIVE` needs a live profile on
   `https://www.ea.com`; everything else is fixture or manual data.
6. **No MAIN-world bridge now.** If live evidence shows that requirement
   semantics exist only in EA's JS view models, a bridge may be proposed in a
   new ADR. It must be read-only, expose a fixed message set validated by zod,
   contain no business logic and no network access, and never touch auth or
   session objects.

## Consequences
- + Wrong selectors or wording degrade to `STRUCTURE_NOT_FOUND` / `UNKNOWN` → `UNSUPPORTED`, never an incorrect SOLVED.
- + Adding a language or fixing EA wording is a data change in one directory.
- + Real EA evidence enters the repo only as sanitized skeletons.
- − Until verified, live reading may show many UNKNOWNs or fail. This is intended, and the inspection report is the path to fix it.
- − Text interpretation needs maintenance whenever EA changes wording (a new dictionary entry plus a captured fixture).
