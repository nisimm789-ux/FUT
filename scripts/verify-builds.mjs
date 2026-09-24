// Regression gate for dev/prod build separation. Run after building both:
//   pnpm build:extension && pnpm build:extension:dev && pnpm verify:builds
// Proves the development build exposes Inspection Mode and the production
// build does not — independent of NODE_ENV (CI also builds dev with
// NODE_ENV=production to prove that).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'extension', '.output');

function bundle(dir) {
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const files = walk(join(out, dir));
  const read = (f) => readFileSync(f, 'utf8');
  return {
    manifest: JSON.parse(read(join(out, dir, 'manifest.json'))),
    panel: files.filter((f) => /sidepanel.*\.js$/.test(f)).map(read).join('\n'),
    content: read(join(out, dir, 'content-scripts', 'ea.js')),
  };
}

// Markers that only exist in the developer tooling code paths.
const PANEL_MARKERS = ['Inspect Current EA Screen', 'Export Sanitized Inspection Report', 'DEV BUILD · Inspection Mode', 'Re-read page'];
const CONTENT_MARKERS = ['full HTML', 'SENSITIVE_CONTENT_DETECTED'];

let failures = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failures += 1;
};

const dev = bundle('chrome-mv3-dev');
console.log('development build (chrome-mv3-dev):');
check(dev.manifest.name === 'FC Assistant (DEV)', 'manifest name marks the DEV build');
for (const m of PANEL_MARKERS) check(dev.panel.includes(m), `side panel includes "${m}"`);
for (const m of CONTENT_MARKERS) check(dev.content.includes(m), `content script includes inspection handler marker "${m}"`);
check(!dev.content.includes('__FCA_DEV_TOOLS__') && !dev.panel.includes('__FCA_DEV_TOOLS__'), 'build flag was replaced at compile time');

const prod = bundle('chrome-mv3');
console.log('production build (chrome-mv3):');
check(prod.manifest.name === 'FC Assistant', 'manifest name has no DEV suffix');
for (const m of PANEL_MARKERS) check(!prod.panel.includes(m), `side panel does not include "${m}"`);
for (const m of CONTENT_MARKERS) check(!prod.content.includes(m), `content script does not include "${m}"`);
check(prod.content.includes('DISABLED_IN_PRODUCTION'), 'content script answers INSPECT with DISABLED_IN_PRODUCTION');
check(!JSON.stringify(prod.manifest).includes('localhost'), 'no localhost match pattern');
check(JSON.stringify(prod.manifest.permissions) === JSON.stringify(['storage', 'sidePanel']) && !prod.manifest.host_permissions, 'permissions unchanged (storage, sidePanel; no host_permissions)');

if (failures > 0) {
  console.error(`${failures} build check(s) failed`);
  process.exit(1);
}
console.log('build separation verified');
