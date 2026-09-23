// Development-only: convert a sanitized Inspection Report (exported from the
// side panel's Developer section on the live FC 27 Web App) into a minimal
// regression fixture under fixtures/ea/captured/.
//
//   pnpm fixtures:from-report ~/Downloads/fc-assistant-inspection-*.json sbc-upgrade-en
//
// The report is re-validated against the strict schema and scanned for
// sensitive content; the generated HTML is scanned again before writing.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findSensitiveContent, reportToFixtureHtml } from '@fc/ea-adapter';

const [reportPath, name] = process.argv.slice(2);
if (!reportPath || !name || !/^[a-z0-9][a-z0-9.-]{0,60}$/.test(name)) {
  console.error('usage: pnpm fixtures:from-report <report.json> <fixture-name (a-z0-9.-)>');
  process.exit(1);
}

const raw = readFileSync(reportPath, 'utf8');
const findings = findSensitiveContent(raw);
if (findings.length > 0) {
  console.error(`Refusing: report contains sensitive-looking content (${findings.map((f) => f.rule).join(', ')}).`);
  process.exit(2);
}
const report: unknown = JSON.parse(raw);
const html = reportToFixtureHtml(report, name);
const out = join(import.meta.dirname, '..', 'fixtures', 'ea', 'captured', `${name}.html`);
writeFileSync(out, html);
console.log(`wrote ${out}`);
console.log('Next: add fixtures/ea/captured/' + name + '.expect.json with the expected context and requirement types, then run pnpm test.');
