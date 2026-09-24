# FC Assistant — Architecture (Phase 1A)

FC Assistant is an **intelligence and tooling layer that runs alongside the EA
SPORTS FC Web App**, delivered as a browser extension. The EA Web App remains the
primary UI. We add a tiny in-page control and a Chrome side panel; we do not
rebuild EA's UI.

Phase 0 established a **read-only** foundation. Phase 1A connects the adapter
to the real FC 27 Web App for context detection and SBC-challenge reading
(§13–§18). Still read-only: no write actions, no auto-complete. It establishes boundaries that must
survive the product growing into SBC solving, set optimisation, club intelligence,
evolutions, market analytics, an AI copilot and (much later, user-triggered)
actions.

---

## 1. System boundaries

```
┌────────────────────────── Browser ───────────────────────────┐
│  EA FC Web App tab (EA's page, EA's session)                  │
│   └─ content script (ISOLATED world)                          │
│        ├─ @fc/ea-adapter   READ: DOM → normalized contracts   │
│        ├─ controller       events → tab state                 │
│        └─ Shadow-DOM launcher  "⚡ Assistant"                  │
│                                                               │
│  MV3 service worker   message router, storage writes          │
│  Side panel (React)   context · health · snapshot · solver    │
└───────────────────────────────┬──────────────────────────────┘
                                │ (Phase 1+: our own auth only)
┌───────────────────────────────▼──────────────────────────────┐
│  apps/api  — Fastify modular monolith                         │
│   health · remote-config (data only) · solve (server runtime) │
│   PostgreSQL later: accounts, billing, catalog, prices         │
└──────────────────────────────────────────────────────────────┘
```

What we **own**: normalized contracts, domain engines, UI, our API.
What we **don't own** and treat as hostile/unstable input: EA's DOM and URLs.

## 2. Dependency direction

```
EA Web App ──► EA Adapter ──► contracts ──► domain engines ──► recommendation ──► UI
 (DOM)        (ea-adapter)   (zod, v1)     (domain, solver,    (SolveResult)      (ui, side panel)
                                            club-engine)

domain recommendation ──► ActionPolicy ──► EA Action Adapter        (WRITE — Phase 0: disabled stubs)
                                            (ea-actions)
```

| Package | May depend on | Must never depend on |
|---|---|---|
| `contracts` | zod | any `@fc/*`, runtimes |
| `domain` | contracts | EA adapter, UI, runtimes |
| `club-engine` | contracts | everything else |
| `solver` | contracts, domain, club-engine | React, Chrome, EA DOM, Fastify, DB |
| `telemetry` | contracts | everything else |
| `ea-adapter` (READ) | contracts, domain | **ea-actions**, ui, solver |
| `ea-actions` (WRITE) | contracts | ea-adapter, ui, runtimes |
| `ui` | contracts, react | adapter, actions, solver, Chrome |
| `apps/extension` | all READ packages | **ea-actions** (not wired in Phase 0) |
| `apps/api` | contracts, solver | adapter, actions, ui |

Enforced twice: ESLint `no-restricted-imports` and `scripts/architecture.test.ts`,
which checks declared dependencies, real import statements (static, side-effect
and dynamic), browser globals in pure packages, and that `.ut-*` selectors appear
only inside `ea-adapter`.

## 3. Local-first

The whole Phase 0 pipeline runs in the browser: read → normalize → solve →
preview. No club data leaves the device. The API exists to prove the server path
(`POST /v1/solve` runs the *same* deterministic solver) and to serve remote
config; the extension does not call it yet.

## 4. Provider abstraction

The domain talks to **ports**, not sources (`packages/domain/src/providers.ts`):
`ClubProvider`, `SbcProvider`, `CatalogProvider`, `PriceProvider`.

- `EaWebProvider` (`createEaWebProviders`) implements club/SBC on top of the DOM adapter.
- Future `EaCommunityApiProvider`, server-side catalog/price providers, or an
  import-file provider implement the same ports. Snapshots carry `source`
  (`ea-web | fixture | import`) so consumers can reason about provenance.

## 5. READ / WRITE separation

- `@fc/ea-adapter` has **no write methods**. Its readers return validated
  contracts; DOM nodes never escape.
- `@fc/ea-actions` holds `EaActionAdapter` (`applySquad`, `submitSbc`,
  `moveItem`) and `ActionPolicy`. Phase 0 ships only `disabledActionPolicy` and
  `disabledActionAdapter` (always `ACTIONS_DISABLED`).
- READ packages cannot import `ea-actions` (lint + architecture test). The
  extension doesn't depend on it at all yet.
- `AdapterHealth.capabilities.actions` is hard-wired to `disabled`, and
  `RemoteConfig.actionsEnabled` is the literal `false` — turning actions on will
  require a code + schema change and review, not a flag flip.

Future write path (not built): user clicks a button on a specific recommendation
→ `ActionPolicy.decide(kind)` (feature flag, SAFE_MODE, per-action kill switch)
→ action adapter re-reads and verifies preconditions → performs one step.

## 6. Extension runtime

- **Content script** (`entrypoints/ea.content`) — default **ISOLATED world**.
  Runs only on `https://www.ea.com/(*/)ea-sports-fc/ultimate-team/web-app/*`
  (+ `http://localhost:4173/*` in development builds only). Hosts the adapter,
  the `ContextObserver` (MutationObserver + `hashchange`/`popstate`, 150 ms
  debounce; emits only on real change), the content controller, and the
  Shadow-DOM launcher. It never reads cookies, storage or network traffic.
- **Service worker** (`entrypoints/background.ts`) — a stateless router. It
  validates messages (zod), writes tab state to `storage.session`, opens the
  side panel, and cleans up on tab close. It is **not** application memory; it
  can be killed at any time.
- **Side panel** (`entrypoints/sidepanel`) — follows the active tab's state in
  `storage.session` and runs the local solver on demand. A development-only
  section shows raw state, solver debug, "Re-read page" and "Export debug report".
- **No MAIN-world code.** If page JS state is ever required (see §11), add a
  tiny audited bridge exposing a fixed, read-only, schema-validated message set
  — no business logic in the MAIN world.

Messaging: content → SW (`STATE_UPDATE`, `OPEN_SIDE_PANEL`), side panel →
content (`REFRESH`). All messages are validated against zod schemas, and the SW
ignores senders that aren't this extension.

## 7. State and storage model

| Store | Holds | Notes |
|---|---|---|
| `chrome.storage.session` | per-tab `TabState` (context, health, latest SBC/club snapshot); later our own short-lived auth | cleared on browser restart; trusted contexts only |
| `chrome.storage.sync` | non-sensitive preferences (`strategy`) | validated on read with defaults |
| IndexedDB (Phase 1) | club snapshot history, catalog cache, solve history | behind `SnapshotRepository` |

All access is through `KeyValueStore` / `SnapshotRepository` ports
(`packages/domain/src/storage.ts`), with in-memory implementations for tests.

**Domain events** (`createEventBus`, typed, synchronous, handler-isolated):
`ContextChanged`, `AdapterHealthChanged`, `SbcSnapshotObserved`,
`ClubSnapshotObserved`, `SolveRequested`, `SolveCompleted`. Components publish
and subscribe; they don't call each other.

## 8. Solver model

- `SolverRuntime.solve(problem: SolveProblem): Promise<SolveResult>` — runtime
  agnostic. `LocalSolverRuntime` today; `ServerSolverRuntime` (calls
  `/v1/solve`) and `WasmSolverRuntime` later.
- `SolveProblem` = challenge snapshot + candidate items + `SolverOptions`
  (`strategy`, `protectedItemIds`, `lockedItemIds`, `maxAdditionalCoins`).
- Strategies: `DUPLICATES_FIRST`, `MINIMUM_COINS`, `PRESERVE_HIGH_RATED`,
  `PRESERVE_TRADEABLES`, `BALANCED`, each mapped to a per-item cost.
- Phase 0 algorithm: deterministic greedy (locked → MIN_COUNT → MIN_UNIQUE →
  cheapest fill respecting MAX caps and one-copy-per-definition) followed by
  cost-per-rating-point upgrade swaps. Ties break by item id, so the output
  doesn't depend on input order.
- **Fail closed:** requirements it can't evaluate (`MIN_CHEMISTRY`, `UNKNOWN`)
  return `UNSUPPORTED`, never a false `SOLVED`. Invalid input returns
  `INVALID_PROBLEM` and doesn't throw.
- **Explainability:** every pick carries `reason` (`LOCKED`,
  `SATISFIES_REQUIREMENT`, `FILLER_LOWEST_COST`, `RATING_UPGRADE`), the
  motivating `requirementId` and its strategy `cost`. `evaluations[]` lists
  every requirement with a detail string, and `debug` records exclusions by
  reason, iterations and timing.
- A property test (fast-check, 300 cases) checks that every `SOLVED` result
  satisfies all requirements with an *independent* checker, respects
  protection, locks, eligibility and uniqueness, and is deterministic.

## 9. Security model

- We never collect, transmit, log, persist or inspect EA passwords, 2FA codes,
  cookies, session tokens or credentials. The extension works inside the user's
  already-authenticated EA tab and reads only rendered DOM.
- The backend never needs an EA credential. It rejects requests that carry
  EA-session-looking headers, and it disables request logging.
- Minimum permissions: `storage`, `sidePanel`. **No `host_permissions`, no
  `<all_urls>`, no `tabs`, no `scripting`, no `cookies`, no `webRequest`.**
- No remote code: MV3 CSP `script-src 'self'`; no `eval` or `new Function`
  (lint-enforced). Remote config is a strict, data-only zod schema; unknown keys
  are rejected.
- Every boundary is validated at runtime: DOM → adapter output, content ↔ SW
  messages, storage reads, remote config, API bodies.
- Telemetry is a closed union of enum/number events. The sanitizer rebuilds
  events from known fields only, and nothing is sent off-device in Phase 0. The
  debug report is user-initiated and contains versions, signals, health and
  counts — never items, ids, HTML or cookies.

## 10. Compatibility strategy

EA compatibility is the highest-risk area, so it is isolated:

- **Selector profiles** (`packages/ea-adapter/src/profiles`) are the only place
  that knows EA structure. Readers take selectors as input. A UI change on EA's
  side means adding a new profile, not editing React or the solver.
- Profiles are probed per document (`probe()`), and the most specific one wins.
  `synthetic-v1` drives dev and CI; `fc27-live` is the FC 27 live profile (§13).
- Structural signals come first: view class names, data attributes, numeric
  text and **numeric ids from asset URLs** (flags, leagues, clubs, player
  portraits). Localized text is never used for meaning. The fixtures are in
  German, French and Spanish to prove this.
- **Fail closed:** strict parsers throw categorized `ReadFailure`s
  (`STRUCTURE_NOT_FOUND`, `FIELD_MISSING`, `VALUE_OUT_OF_RANGE`,
  `CONTRACT_VALIDATION_FAILED`, …). Every reader output is re-validated against
  the contract. Unknown requirement kinds become `UNKNOWN`, not silently dropped.
- **AdapterHealth / SAFE_MODE:** a failure marks that capability `degraded`.
  Three consecutive read failures, remote `forceSafeMode`, or an adapter older
  than `minAdapterVersion` turn on SAFE_MODE, which disables **read**
  capabilities while context detection and the UI keep working, so the user
  sees why. `disabledCapabilities` switches off individual readers remotely.
- `ADAPTER_VERSION` (semver) + `AdapterCapabilities` let config and telemetry
  reason about which build supports what.

### Live validation backlog (Phase 0 list; see §18 for the current state)

Items that must be verified against a real, logged-in EA Web App session:

1. Content-script match patterns cover every locale path variant EA uses.
2. The app shell probe and view container class names (now in `fc27-live`).
3. Whether SPA navigations change the URL/hash at all, or only the DOM.
4. How SBC requirements are represented structurally. If the DOM only exposes
   localized text, a MAIN-world read bridge to EA's view models may be
   required (see §6); this is an explicit, reviewed decision.
5. Whether item tiles expose stable item/definition ids (asset URLs are the
   current bet), and how pagination/virtualisation affects club coverage
   (hence `coverage: complete | partial`).
6. The squad-rating formula against real EA values.
7. That `chrome.sidePanel.open()` called from the content-script click message
   keeps the user gesture on the minimum supported Chrome (the toolbar icon is
   the guaranteed fallback).

## 11. Future mobile / API path

Everything above the adapter is platform-neutral TypeScript with validated
contracts:

- A mobile companion (or the web app) can use `contracts`, `domain`, `solver`
  and `club-engine` unchanged, fed by a different provider (e.g. an uploaded
  snapshot, or `EaCommunityApiProvider` if a sanctioned source exists).
- `ServerSolverRuntime` moves heavy optimisation (full-set planning, MILP) to
  `apps/api` without changing callers.
- `apps/web` stays small: landing, account, billing, admin (remote config,
  SAFE_MODE switches, adapter compatibility dashboard), docs.

## 12. Repository map

```
apps/extension    WXT + React MV3 extension (content script, SW, side panel)
apps/api          Fastify modular monolith (health, remote-config, solve)
apps/web          placeholder (README only)
packages/contracts   zod schemas + types (versioned)
packages/domain      events, provider/storage ports, requirement evaluation
packages/solver      SolverRuntime + deterministic local solver
packages/club-engine duplicates, spare items, summaries
packages/ea-adapter  READ anti-corruption layer (profiles, detector, readers, health)
packages/ea-actions  WRITE interfaces + disabled stubs
packages/ui          presentational React components
packages/telemetry   privacy-first telemetry + debug report
fixtures/ea          synthetic pages, golden JSON, dev SPA + server
docs/                architecture + ADRs
scripts/             architecture boundary test, extension smoke test
```


---

# Phase 1A — reading the live FC 27 Web App

## 13. Live EA adapter strategy

**Hosts.** FC 27 is served at `https://www.ea.com/ea-sports-fc/ultimate-team/web-app/`
(locale variants `https://www.ea.com/<locale>/ea-sports-fc/…/web-app/`). The
production manifest matches exactly those two patterns, **excludes
`https://www.ea.com/games/*`** (EA's marketing page for the app, which the
locale wildcard would otherwise match), and still needs **no
`host_permissions`**: static content scripts are injected via `matches`, and
the extension performs no network requests. Permissions remain
`storage` + `sidePanel`. The in-page launcher mounts only after a profile's
`probe()` recognises the app shell, so login/error/marketing pages on matched
paths get nothing injected.

**Profiles.** `EaAdapterProfile` = `id`, `fcVersion`, `profileVersion`,
`verified`, `live`, `probe()`, `contextRules`, `navigation`, `sbc`, `club`.
All selectors/signatures live in `packages/ea-adapter/src/profiles/`
(enforced: `.ut-*` selector literals anywhere else fail the architecture test).

`fc27-live` (profileVersion 0.1.0) is a **candidate** built on EA's
long-standing `UT<Name>View → .ut-<name>-view` convention. It is
`verified: false` because this development environment could not reach or log
in to ea.com. `verified` is surfaced in `AdapterHealth.profileVerified`, in
every snapshot's `adapter` block and as an "UNVERIFIED PROFILE" badge. A test
forbids flipping it to `true` until captured fixtures from real sessions exist.

**Capabilities reported on FC 27:**

| capability | state |
|---|---|
| contextDetection | healthy once the shell is recognised |
| sbcReading | unknown → healthy / degraded (fails closed) |
| clubReading, squadReading, packReading, evolutionReading | unsupported (Phase 1B+) |
| actions | disabled (always) |

**Context detection** is multi-signal and scored per rule: structural view
(+requires) = 3, selected tab-bar icon = 2, route = 1. `high` confidence
requires structure. Each tab icon is attached to exactly one rule (the tab's
hub), so a navigation-only match can never be mistaken for a sub-screen such
as SBC_CHALLENGE or PACK_RESULTS. No rule uses visible text; tests scramble
every text node and change `lang` and expect identical results.

## 14. Requirement parser (text interpretation layer)

EA renders SBC requirements as localized text. Where structure exists (asset
ids for nations/leagues/clubs, completion classes, slot structure) it is used
first; meaning from text is confined to `packages/ea-adapter/src/interpretation/`:

```
reader (DOM) ──RequirementEvidence{text, assetIds}──► interpreter ──► KnownRequirement | UNKNOWN
                                                        ▲
                                  dictionaries/{en,de,fr,es}.ts  (data only, replaceable)
```

- Dictionaries map normalized phrases (lowercase, no diacritics, no
  punctuation) to language-independent *subjects* (TEAM_RATING, CHEMISTRY,
  SAME_CLUB, UNIQUE_LEAGUES, TOTW, FROM_NATION…) and operators (min/max/exact).
  They are marked `verified: false` until wording is confirmed live.
- Preferred language = `<html lang>`. If it is missing and dictionaries
  disagree, the result is `UNKNOWN(AMBIGUOUS_LANGUAGE)`, never a guess.
- Longest phrase wins; equal-length conflicts → `UNKNOWN(AMBIGUOUS_TEXT)`.
  An `OTHER` subject lists known-but-unmodelled concepts (per-player
  chemistry, loyalty, first owner…) so "Min. 2 Chemistry Points per Player"
  can never be misread as total chemistry.
- Named entities (a specific nation/league/club) are never mapped from names —
  only from ids in asset URLs; otherwise `UNKNOWN(ENTITY_ID_UNAVAILABLE)`.
- Architecture test: no dictionary phrase may appear as a string literal in the
  adapter outside `interpretation/dictionaries/`, and only `interpretation/`
  may import the dictionaries.

**Contract model (v2).** Known: `MIN_SQUAD_RATING`, `MIN_CHEMISTRY`,
`SQUAD_SIZE`, `MIN_COUNT` / `MAX_COUNT` / `EXACT_COUNT` (filter: rarity,
quality, programme such as TOTW/TOTS/IN_FORM, nation/league/club ids, rating
bounds), `PLAYER_RATING_RANGE`, `PLAYER_QUALITY`, `MAX_SAME`, `MIN_SAME`,
`MIN_UNIQUE`, `MAX_UNIQUE`. Unknown: `UNKNOWN { reason, structuralFingerprint
(values masked), rawSafeDescription (sanitized ≤120) }`. Every known
requirement records `via: structure | text | fixture`.

**Fail closed.** `requirementSupport()` (domain) is the single rule for what
can be *verified*: `UNKNOWN`, `MIN_CHEMISTRY` (needs positions) and any
programme filter (club items carry no programme data yet) are unsupported, and
any unsupported requirement makes the solver return `UNSUPPORTED` with no
squad. A property test asserts that no challenge containing one is ever SOLVED.

## 15. SBC snapshot

`SbcChallengeSnapshot` v2 adds `challengeIdKind` (`EA | LOCAL_FINGERPRINT |
FIXTURE`; the DOM exposes no challenge id, so live snapshots get a stable
`local-xxxxxxxx` from name + squad size + requirement text, which ignores slot
changes), `filledSlots`, `interpretationLocale`, `provenance`, and
`adapter {adapterVersion, profileId, profileVerified}`. Squad size comes from
explicit structure, else the "players in squad" requirement, else the count of
non-locked pitch slots; otherwise the read fails with `FIELD_MISSING`.

## 16. Observation and fingerprinting

```
root MutationObserver (childList only)  ─► debounce 150ms / max-wait 1s ─► detect context (~1ms)
      └─ context changed? ─► dispose scoped observer ─► bind new scope ─► read that context once
scoped MutationObserver (only the SBC requirements + pitch subtrees; childList, class/src, text)
      ─► debounce 120ms / max-wait 1s ─► fingerprint (~1ms) ─► changed? ─► re-read ─► identical? suppress
```

- Nothing re-parses the whole document per mutation; the solver never runs from
  observation (only on an explicit click).
- EA re-renders that replace the scoped nodes are detected on the next root
  tick and the scoped observer is re-bound; the fingerprint prevents a re-read
  if the state is the same.
- Max-wait bounds latency under continuous animation.
- Perf (`AdapterPerf`, numbers only, shown in the dev section and carried in
  tab state): detectContext, readSbc, fingerprint, mutationToRefresh timings;
  counters for mutation batches, ticks, unchanged fingerprints, re-reads and
  suppressed duplicates. The side panel shows its own update latency.
  Measured in Chromium on the fixture: detect 0.2–1.5 ms, fingerprint ≈1 ms,
  SBC read 2.5–6 ms, mutation→refresh ≈160 ms (dominated by the debounce).

**Stale data.** Tab state holds `{snapshot, freshness, staleReason, lastReadAt}`.
Leaving the context → `CONTEXT_LEFT`; a failed re-read → `READ_FAILED` (the old
snapshot is kept, never replaced by a fabricated one); SAFE_MODE →
`READS_DISABLED`. The UI shows a STALE badge with the reason.

## 17. Provenance

Every snapshot and solve input carries `provenance`:
`EA_WEB_LIVE | LOCAL_FIXTURE | IMPORTED_FIXTURE | MANUAL`. `EA_WEB_LIVE`
requires **both** a `live` profile **and** the real EA origin
(`https://www.ea.com`), so an FC 27-shaped fixture on localhost is
`LOCAL_FIXTURE`. `SolveProblem.candidatesProvenance` and
`SolveResult.inputProvenance` carry it through solving; the UI shows badges,
renders non-live cards hatched with a "not live" note, and prefixes any result
on non-live input with "Demo on non-live data".

## 18. Inspection mode and sanitized fixture workflow

**Development builds only** (the production content script compiles the branch
out and answers `DISABLED_IN_PRODUCTION`). Side panel → Developer →
**Inspect Current EA Screen** → summary + **Export Sanitized Inspection Report**.

The report (`InspectionReportSchema`, every object `.strict()`) contains:
origin, sanitized path/route (id-like segments → `:id`), query *keys*, `lang`,
detected context and per-rule scores, `ut-*-view` class counts, tab-bar icon
classes + selected state, landmark counts, the SBC requirements subtree as a
structural tree (tags, `ut-*`/state classes, `data-*` *names*, asset kinds),
requirement rows with sanitized text, fingerprints and what the interpreter
made of them, slot counts, heuristic requirement-list candidates (for when the
profile misses), reader diagnostics, health, recent validation failures and
perf. It never reads cookies, web storage, network data, input/textarea
values or contenteditable content; text is captured **only** inside
requirement rows and is sanitized (emails, URLs, long tokens, ≥6-digit
numbers). The report is scanned by `findSensitiveContent()` and **blocked** if
anything suspicious survives. It is deterministic apart from `meta.generatedAt`.

Fixture workflow:

```
live FC 27 (dev build) → Export report.json → pnpm fixtures:from-report report.json <name>
  → fixtures/ea/captured/<name>.html (minimal skeleton, re-scanned)
  → author <name>.expect.json {context, requirementTypes, squadSize}
  → packages/ea-adapter/test/captured-fixtures.test.ts runs it in CI
```

`scripts/fixture-sanitization.test.ts` fails CI if any file under `fixtures/`
matches a sensitive pattern (emails, JWTs, bearer tokens, EA auth header /
cookie names, credential keywords, account-id keys, long hex/base64 blobs,
input values, password fields, storage access, `<script>` outside the dev site).

### Live evidence log

- **2026-09-24, first live report (en, SBC "Player Quality: Exactly Bronze",
  "Number of Players in the Squad: 11")** — confirmed: app shell, SBC_CHALLENGE
  detection (high), requirements root/rows, pitch root, slot selector,
  SQUAD_SIZE and PLAYER_QUALITY parsing. **Refuted:** the filled-slot selector
  `.ut-item-view:not(.empty)` (an empty pitch read as 11/11 filled — empty slots
  also contain `.ut-item-view` and carry no `.empty`). The signature is now
  `disabled`: `filledSlots` is `null` (unknown), occupancy is excluded from the
  SBC fingerprint (no false re-reads), and Inspection Mode records per-slot
  structure (`sbc.slotDetails`) so an empty-pitch report and a one-player report
  can be diffed to derive the real signature. Per-signature status lives in
  `fc27LiveProfile.signatures` and `AdapterHealth.profileSignatures`.
  Tests that need known occupancy use `fc27FixtureProfile` (fixture-only, not a
  default profile).

### Known FC 27 uncertainties (need live evidence)

1. Every `fc27-live` selector: shell probe, view classes, tab-bar icon classes,
   `.ut-sbc-challenge-requirements-view` rows, completion classes, pitch/slot
   and filled/locked markers, challenge title location.
2. Whether `<html lang>` reflects the Web App language.
3. Exact requirement wording per language (dictionaries are candidates).
4. Whether requirement rows expose nation/league/club badges with numeric ids
   in their image URLs, and the URL shape.
5. Whether the DOM exposes any stable challenge/set id (currently local fingerprint).
6. Slot occupancy signature (pending the empty vs one-player capture pair),
   and whether SBCs with fewer than 11 players lock or remove pitch slots.
7. Whether some requirement data exists only in EA's JS view models. If so,
   the only acceptable route is a separately reviewed, read-only MAIN-world
   bridge (ADR-006 lists the conditions); it is **not** implemented.
8. `chrome.sidePanel.open()` from the in-page button keeping the user gesture
   (the toolbar icon is the guaranteed fallback).
9. The squad-rating formula against real EA values.
