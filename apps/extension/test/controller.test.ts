import { describe, expect, it } from 'vitest';
import { createEaWebAdapter } from '@fc/ea-adapter';
import { solveLocally } from '@fc/solver';
import { noopTelemetry } from '@fc/telemetry';
import { createContentController } from '../src/content/controller.js';
import { TabStateSchema, type TabState } from '../src/messaging/messages.js';
import { buildDemoProblem } from '../src/sidepanel/solve-demo.js';
import { loadPage } from './helpers.js';

function setup() {
  const states: TabState[] = [];
  const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href, now: () => 0 });
  const controller = createContentController({ adapter, telemetry: noopTelemetry, now: () => 0, publishState: (s) => states.push(s) });
  return { controller, states };
}

describe('content controller', () => {
  it('publishes validated tab state with context and health on start', () => {
    loadPage('home');
    const { controller, states } = setup();
    controller.start();
    controller.stop();
    const last = states.at(-1);
    expect(TabStateSchema.parse(last).context.kind).toBe('HOME');
    expect(last?.health.capabilities.actions).toBe('disabled');
  });

  it('keeps club and SBC snapshots across contexts so the panel can solve with both', () => {
    const { controller, states } = setup();
    loadPage('club');
    controller.refresh();
    loadPage('sbc-challenge');
    controller.refresh();
    const last = TabStateSchema.parse(states.at(-1));
    expect(last.context.kind).toBe('SBC_CHALLENGE');
    expect(last.club?.items).toHaveLength(42);
    expect(last.sbc?.challengeId).toBe('ch-1001');

    const { problem, source } = buildDemoProblem({ sbc: last.sbc, club: last.club, strategy: 'BALANCED' });
    expect(source).toBe('live-page');
    expect(solveLocally(problem, { now: () => 0 }).status).toBe('SOLVED');
  });

  it('falls back to bundled fixtures when the page has not provided both snapshots', () => {
    const { problem, source } = buildDemoProblem({ sbc: null, club: null, strategy: 'MINIMUM_COINS' });
    expect(source).toBe('bundled-fixture');
    expect(solveLocally(problem, { now: () => 0 }).status).toBe('SOLVED');
  });

  it('does not touch any EA write control', () => {
    loadPage('sbc-challenge');
    const submit = document.querySelector<HTMLButtonElement>('.ut-sbc-submit');
    let clicked = false;
    submit?.addEventListener('click', () => {
      clicked = true;
    });
    const { controller } = setup();
    controller.start();
    controller.refresh();
    controller.stop();
    expect(clicked).toBe(false);
  });
});
