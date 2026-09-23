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
  assert(state?.context.kind === 'CLUB' && state.club?.items.length === 42, 'SPA navigation to CLUB detected and club read');

  await page.click('button[data-page="sbc-challenge"]');
  await page.waitForTimeout(600);
  state = await tabState();
  assert(state?.context.kind === 'SBC_CHALLENGE' && state.sbc?.challengeId === 'ch-1001', 'SPA navigation to SBC_CHALLENGE detected and SBC read');
  assert(state.health.capabilities.actions === 'disabled', 'write actions reported disabled');
  const submitStillDisabled = await page.evaluate(() => document.querySelector('.ut-sbc-submit')?.matches(':disabled'));
  assert(submitStillDisabled === true, 'EA submit control untouched');
  await page.screenshot({ path: join(outDir, 'fixture-page.png') });

  await page.locator('fc-assistant-launcher button').click();

  const panel = await context.newPage();
  panel.on('pageerror', (e) => errors.push(`panel: ${e}`));
  await panel.setViewportSize({ width: 400, height: 1400 });
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await panel.getByRole('button', { name: /Solve/ }).click();
  await panel.waitForSelector('[data-testid="solve-status"]');
  assert((await panel.textContent('[data-testid="solve-status"]')) === 'SOLVED', 'side panel renders a SOLVED preview');
  await panel.screenshot({ path: join(outDir, 'sidepanel.png'), fullPage: true });

  assert(errors.length === 0, `no page errors (${errors.join('; ')})`);
  console.log(`Screenshots: ${outDir}`);
} finally {
  await context?.close();
  server.kill();
}
