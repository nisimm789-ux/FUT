# FC Assistant — Architecture (Phase 0)

FC Assistant is an **intelligence and tooling layer that runs alongside the EA
SPORTS FC Web App**, delivered as a browser extension. The EA Web App remains the
primary UI. We add a tiny in-page control and a Chrome side panel; we do not
rebuild EA's UI.

Phase 0 is a **read-only** proof of concept. It establishes boundaries that must
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
  `synthetic-v1` drives dev and CI. `ea-web-candidate-0` is an **unverified**
  live guess that only attempts context detection; its readers are
  intentionally undefined, so SBC and club reading report `unsupported` on the
  live site until validated.
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

### Live validation backlog

Items that must be verified against a real, logged-in EA Web App session
before Phase 1 readers ship:

1. Content-script match patterns cover every locale path variant EA uses.
2. The app shell probe and view container class names in `ea-web-candidate-0`.
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
