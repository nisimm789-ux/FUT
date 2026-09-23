# Captured fixtures (from sanitized inspection reports)

Files here are generated **only** by `pnpm fixtures:from-report <report.json> <name>`
from a sanitized Inspection Report exported in the extension's development build.

- They contain the minimal skeleton recorded in the report: tags, EA `ut-*` /
  state classes, `data-*` attribute *names*, catalog asset ids inside
  requirement rows and sanitized requirement-row text.
- They never contain full pages, cookies, tokens, storage, input values,
  account or club information. `scripts/fixture-sanitization.test.ts` fails CI
  if a known sensitive pattern appears anywhere under `fixtures/`.
- Never paste raw HTML from an authenticated EA session here.
