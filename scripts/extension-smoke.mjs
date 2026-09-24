// Real-browser smoke test: loads the DEV build of the extension into Chromium,
// drives the synthetic fixture SPA, and checks the Phase 0 flow end to end.
//
//   pnpm build:extension:dev && pnpm smoke:extension
//
// Uses Playwright's Chromium (or CHROMIUM_PATH). Not part of `pnpm check`
// because it needs a browser binary. Never points at the live EA site.
/* global chrome -- used only inside worker.evaluate(), which runs in the extension service worker */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extensionPath = join(root, 'apps/extension/.output/chrome-mv3-dev');
const outDir = join(root, '.output/smoke');
mkdirSync(outDir, { recursive: true });

function assert(condition, message) {
  if (!condition) throw new Error(`SMOKE FAILED: ${message}`);
  console.log(`  ✓ ${message}`);
}

const server = spawn(process.execPath, [join(root, 'fixtures/ea/serve.mjs')], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

let context;
try {
  context = await chromium.launchPersistentContext('', {
    ...(process.env.CHROMIUM_PATH && { executablePath: process.env.CHROMIUM_PATH }),
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  const errors = [];

  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4173/site/#/home');
  await page.waitForSelector('fc-assistant-launcher', { state: 'attached', timeout: 10_000 });
  const launcher = await page.evaluate(() => document.querySelector('fc-assistant-launcher')?.shadowRoot?.querySelector('button')?.textContent);
  assert(launcher?.includes('Assistant'), 'in-page launcher is mounted inside a Shadow DOM');

  const tabState = () =>
    worker.evaluate(async () => Object.values(await chrome.storage.session.get(null))[0] ?? null);

  await page.click('button[data-page="club"]');
  await page.waitForTimeout(600);
  let state = await tabState();
  assert(state?.context.kind === 'CLUB' && state.club?.snapshot.items.length === 42, 'SPA navigation to CLUB detected and club read');

  await page.click('button[data-page="sbc-challenge"]');
  await page.waitForTimeout(600);
  state = await tabState();
  assert(state?.context.kind === 'SBC_CHALLENGE' && state.sbc?.snapshot.challengeId === 'ch-1001', 'SPA navigation to SBC_CHALLENGE detected and SBC read');
  assert(state.health.capabilities.actions === 'disabled', 'write actions reported disabled');
  const submitStillDisabled = await page.evaluate(() => document.querySelector('.ut-sbc-submit')?.matches(':disabled'));
  assert(submitStillDisabled === true, 'EA submit control untouched');
  await page.screenshot({ path: join(outDir, 'fixture-page.png') });

  await page.locator('fc-assistant-launcher button').click();

  const panel = await context.newPage();
  panel.on('pageerror', (e) => errors.push(`panel: ${e}`));
  await panel.setViewportSize({ width: 400, height: 1400 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  assert((await panel.textContent('[data-testid="dev-build-badge"]'))?.includes('Inspection Mode'), 'DEV BUILD badge visible in the side panel header');
  assert((await panel.getByRole('button', { name: 'Inspect Current EA Screen' }).count()) === 1, 'Developer section with "Inspect Current EA Screen" is present');
  await panel.getByRole('button', { name: /Run bundled demo/ }).click();
  await panel.waitForSelector('[data-testid="solve-status"]');
  assert((await panel.textContent('[data-testid="solve-status"]')) === 'SOLVED', 'side panel renders a SOLVED preview');
  await panel.screenshot({ path: join(outDir, 'sidepanel.png'), fullPage: true });

  // ---------------------------------------------------------------- Phase 1A
  // The extension has no `tabs`/host permission, so tabs cannot be looked up by URL;
  // find the tab through the per-tab state the content script published instead.
  const stateOf = (profileId) =>
    worker.evaluate(async (wanted) => {
      const entries = Object.entries(await chrome.storage.session.get(null));
      const hit = entries.find(([, s]) => s?.context?.profileId === wanted);
      return hit ? { tabId: Number(hit[0].replace('tab:', '')), state: hit[1] } : { tabId: null, state: null };
    }, profileId);

  // Launcher is gated on a recognised EA app shell.
  const plain = await context.newPage();
  await plain.goto('http://localhost:4173/pages/not-ea.html');
  await plain.waitForTimeout(800);
  assert((await plain.locator('fc-assistant-launcher').count()) === 0, 'no launcher on a matched URL that is not the EA app');
  await plain.close();

  const fc27 = await context.newPage();
  fc27.on('pageerror', (e) => errors.push(`fc27: ${e}`));
  await fc27.goto('http://localhost:4173/site/fc27.html#/sbc-challenge.en');
  await fc27.waitForSelector('fc-assistant-launcher', { state: 'attached', timeout: 10_000 });
  await fc27.evaluate(() => {
    document.cookie = 'x-ut-sid=CookieSecretValue';
    localStorage.setItem('k', 'StorageSecretValue');
    const input = document.createElement('input');
    input.value = 'TypedSecretValue';
    document.querySelector('.ut-navigation-bar-view')?.append(input);
  });
  await fc27.waitForTimeout(600);
  let fcState = (await stateOf('fc27-live')).state;
  assert(fcState?.context.kind === 'SBC_CHALLENGE' && fcState.context.profileId === 'fc27-live', 'FC 27 structure detected as SBC_CHALLENGE by the fc27-live profile');
  assert(fcState.sbc?.snapshot.provenance === 'LOCAL_FIXTURE', 'localhost data is labelled LOCAL_FIXTURE, never EA_WEB_LIVE');
  assert(fcState.sbc.snapshot.requirements.length === 8 && fcState.sbc.snapshot.squadSize === 11, 'SBC read: 8 requirements, squad size 11');
  assert(fcState.sbc.snapshot.filledSlots === null, 'live profile reports slot occupancy as unknown (null), never guessed');

  const rereadsBefore = fcState.perf.counters.rereads;
  await fc27.click('#fill');
  await fc27.waitForTimeout(500);
  fcState = (await stateOf('fc27-live')).state;
  assert(fcState.perf.counters.rereads === rereadsBefore, 'placing a player causes no false re-read while occupancy is unverified');
  // Bump "Team Rating: Min. 84" -> 85: a meaningful change that alters the snapshot.
  await fc27.click('#rating');
  await fc27.waitForTimeout(500);
  fcState = (await stateOf('fc27-live')).state;
  assert(
    fcState.perf.counters.rereads === rereadsBefore + 1 && fcState.sbc.snapshot.requirements[0]?.value === 85,
    'same-page requirement change re-read once without navigation',
  );
  await fc27.click('#noise');
  await fc27.waitForTimeout(1_000);
  const afterNoise = (await stateOf('fc27-live')).state;
  assert((afterNoise?.perf.counters.rereads ?? fcState.perf.counters.rereads) === rereadsBefore + 1, 'unrelated DOM churn causes no re-read');
  console.log(`  i perf: ${JSON.stringify(fcState.perf.timings)}`);

  const { tabId: fcTab } = await stateOf('fc27-live');
  const inspection = await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'INSPECT' }), fcTab);
  assert(inspection?.ok === true && inspection.report.context.kind === 'SBC_CHALLENGE', 'dev inspection report produced for the SBC screen');
  assert(inspection.report.sbc.slotDetails.length === 11 && inspection.report.sbc.slots.filled === null, 'inspection report carries 11 per-slot structural summaries');
  const reportJson = JSON.stringify(inspection.report);
  assert(!/CookieSecretValue|StorageSecretValue|TypedSecretValue/.test(reportJson), 'inspection report contains no cookie, storage or input values');

  const livePanel = await context.newPage();
  livePanel.on('pageerror', (e) => errors.push(`panel: ${e}`));
  await livePanel.setViewportSize({ width: 400, height: 1600 });
  await livePanel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${fcTab}`);
  await livePanel.waitForSelector('[data-testid="requirements"]');
  assert((await livePanel.textContent('[data-testid="provenance"]')) === 'FIXTURE', 'side panel labels the fixture SBC as FIXTURE');
  await livePanel.getByRole('button', { name: /Check this SBC/ }).click();
  await livePanel.waitForSelector('[data-testid="solve-status"]');
  assert((await livePanel.textContent('[data-testid="solve-status"]')) === 'UNSUPPORTED', 'TOTW/chemistry challenge yields UNSUPPORTED, not SOLVED');
  await livePanel.screenshot({ path: join(outDir, 'sidepanel-fc27.png'), fullPage: true });

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`Screenshots: ${outDir}`);
} finally {
  await context?.close();
  server.kill();
}
