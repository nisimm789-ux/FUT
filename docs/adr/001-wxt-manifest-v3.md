# ADR-001: WXT + Manifest V3 for the browser extension

- Status: Accepted
- Date: 2026-09-23

## Context
The product lives next to the EA FC Web App, so the primary delivery vehicle is
a Chromium extension. Chrome requires Manifest V3: service workers instead of
persistent background pages, no remote code, stricter CSP. We need React UIs
(side panel, in-page control), TypeScript, fast rebuilds, and per-mode manifests
(the dev fixture host must not ship to production).

## Decision
Use **WXT** (Vite-based) with `@wxt-dev/module-react`, targeting **MV3** and
Chrome ≥ 116 (for `chrome.sidePanel.open`).

- Entrypoints: `background.ts` (service worker), `ea.content/` (content
  script), `sidepanel/` (side panel page).
- The manifest is declared in `wxt.config.ts`. Content-script `matches` are
  computed per build mode (`src/config/hosts.ts`).
- In-page UI uses WXT's `createShadowRootUi` for style isolation.

## Consequences
- + Typed manifest, HMR in dev, Shadow DOM helpers, multi-browser builds later (Edge, Firefox MV3).
- + File-based entrypoints keep runtime roles clear.
- − The service worker is ephemeral: all state must live in `chrome.storage` or IndexedDB (see architecture §7).
- − We depend on WXT's release cadence. Mitigation: our logic lives in plain TS packages, so WXT is a thin shell.
