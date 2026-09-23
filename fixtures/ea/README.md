# EA fixtures (synthetic)

Everything here is **synthetic**. It imitates the *shape* of an SPA like the EA FC
Web App closely enough to exercise the adapter, but contains no copied EA markup,
no real player data and no user data.

- `pages/*.html` – full documents, one per app context. Used by adapter tests and by the dev site.
- `data/*.json` – the normalized snapshots the adapter is expected to produce (golden files) and solver inputs.
- `site/index.html` – SPA-style dev page that swaps views without reloading (tests SPA context detection).
- `serve.mjs` – `pnpm fixtures:serve` → http://localhost:4173/site/
- `scripts/generate.mjs` – regenerates pages + golden data deterministically.

Pages use the `synthetic-v1` selector profile (`data-fixture-profile` on the root).
Requirement labels are deliberately in German/French/Spanish to prove the reader
does not depend on UI language.
