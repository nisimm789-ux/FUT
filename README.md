# FC Assistant

An intelligence and tooling layer for the **EA SPORTS FC Ultimate Team Web App**,
delivered as a Manifest V3 browser extension. The EA Web App stays the primary UI.
We add a small in-page **⚡ Assistant** button and a Chrome **side panel**.

> **Phase 1A: read-only live SBC reading.** No EA write action exists. We never
> touch EA passwords, 2FA codes, cookies or session tokens. The FC 27 live
> profile is a candidate (`verified: false`) until confirmed with sanitized
> inspection reports from real sessions (docs/architecture.md §13–§18).

- Architecture: [`docs/architecture.md`](docs/architecture.md)
- Decisions: [`docs/adr/`](docs/adr)

## Quick start

```bash
corepack enable            # pnpm 10 (pinned in package.json)
pnpm install
pnpm check                 # typecheck + lint + tests + production extension build
```

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` in every workspace package |
| `pnpm lint` | ESLint (strict TS + dependency-boundary rules) |
| `pnpm test` | Vitest: contracts, domain, solver (incl. property tests), adapter fixtures, UI, extension core, API, architecture |
| `pnpm build:extension` | Production build → `apps/extension/.output/chrome-mv3` (EA hosts only) |
| `pnpm build:extension:dev` | Dev build → `apps/extension/.output/chrome-mv3-dev` (also matches `http://localhost:4173`) |
| `pnpm verify:builds` | Asserts the dev build exposes Inspection Mode and the production build does not |
| `pnpm dev:extension` | WXT dev mode with hot reload |
| `pnpm fixtures:serve` | Synthetic EA-like SPA at http://localhost:4173/site/ |
| `pnpm smoke:extension` | Loads the dev build into Chromium and drives the fixture (needs a Playwright Chromium, or set `CHROMIUM_PATH`) |
| `pnpm fixtures:from-report <report.json> <name>` | Convert a sanitized live inspection report into `fixtures/ea/captured/<name>.html` |
| `pnpm fixtures:generate` | Regenerate synthetic fixtures + golden data |
| `pnpm dev:api` | Fastify API on http://127.0.0.1:8787 (`/health`, `/v1/config`, `POST /v1/solve`) |

## Try it against the local fixture

1. `pnpm build:extension:dev`
2. `pnpm fixtures:serve`
3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
   and select `apps/extension/.output/chrome-mv3-dev`. The development build is
   named **FC Assistant (DEV)** and its side panel shows a purple
   **DEV BUILD · Inspection Mode** badge plus a **Developer** section. Developer
   tooling is controlled by the compile-time flag `__FCA_DEV_TOOLS__`, which is
   derived from `--mode development`, never from `NODE_ENV`.
4. Open http://localhost:4173/site/. The **⚡ Assistant** button appears at the bottom right.
5. Click **Club**, then **SBC Challenge** in the fixture nav (SPA navigation, no reload).
6. Click **⚡ Assistant** (or the toolbar icon). The side panel shows the detected
   context, adapter health and snapshots. Click **Solve (preview only)**.

Open **Club (malformed)**, then press **Re-read page** (side panel → Developer) twice more to watch
`clubReading` degrade and SAFE_MODE engage after three consecutive failures.
Try **SBC (unsupported reqs)** to see the solver fail closed with `UNSUPPORTED`.

## Layout

```
apps/        extension · api · web (placeholder)
packages/    contracts · domain · solver · club-engine · ea-adapter · ea-actions · ui · telemetry
fixtures/ea  synthetic pages + golden JSON + dev server
docs/        architecture.md · adr/
scripts/     architecture boundary test · extension smoke test
```
