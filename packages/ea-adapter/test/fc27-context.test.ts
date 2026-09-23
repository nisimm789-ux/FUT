import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EaContextKind, EaContextSnapshot } from '@fc/contracts';
import { readFc27Page, type Fc27Page } from '@fc/ea-fixtures';
import { createEaWebAdapter, detectContext, fc27LiveProfile, scoreContextRules, selectProfile } from '../src/index.js';
import { LIVE_URL, loadFc27, loadHtml } from './helpers.js';

afterEach(() => vi.useRealTimers());

/** Replaces every visible text node with gibberish: detection must not care. */
function scrambleText(doc: Document) {
  const walker = doc.createTreeWalker(doc.body, 4);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.textContent?.trim()) n.textContent = 'ẍẍẍ 12 ǫǫ';
  doc.documentElement.setAttribute('lang', 'xx');
}

describe('FC 27 candidate profile: context detection', () => {
  it.each<[Fc27Page, EaContextKind, 'high' | 'low' | 'none']>([
    ['home', 'HOME', 'high'],
    ['squads', 'SQUADS', 'high'],
    ['sbc-hub', 'SBC_HUB', 'high'],
    ['sbc-challenge.en', 'SBC_CHALLENGE', 'high'],
    ['sbc-challenge.de', 'SBC_CHALLENGE', 'high'],
    ['store', 'STORE', 'high'],
    ['pack-results', 'PACK_RESULTS', 'high'],
    ['transfers', 'TRANSFERS', 'high'],
    ['club', 'CLUB', 'high'],
    ['evolutions', 'EVOLUTIONS', 'high'],
    ['nav-only-store', 'STORE', 'low'],
    ['unknown', 'UNKNOWN', 'none'],
  ])('%s -> %s (%s)', (page, kind, confidence) => {
    const doc = loadFc27(page);
    const profile = selectProfile(doc);
    expect(profile?.id).toBe('fc27-live');
    const snapshot = detectContext(doc, LIVE_URL, profile, 1);
    expect(snapshot).toMatchObject({ kind, confidence, profileId: 'fc27-live' });
  });

  it('combines structural and navigation signals', () => {
    const doc = loadFc27('sbc-challenge.en');
    const scores = scoreContextRules(doc, LIVE_URL, fc27LiveProfile).filter((s) => s.score > 0);
    expect(scores.find((s) => s.kind === 'SBC_CHALLENGE')).toMatchObject({ score: 3, signals: ['view:sbc_challenge'] });
    // The SBC tab icon belongs to the hub; structure must outrank it.
    expect(scores.find((s) => s.kind === 'SBC_HUB')).toMatchObject({ score: 2, signals: ['nav:sbc_hub'] });
  });

  it('assigns each navigation signal to exactly one context (no nav-only ties)', () => {
    const navs = fc27LiveProfile.contextRules.map((r) => r.activeNav).filter((n): n is string => n !== undefined);
    expect(new Set(navs).size).toBe(navs.length);
  });

  it('requires the squad pitch as well as requirements for SBC_CHALLENGE', () => {
    const doc = loadFc27('sbc-challenge.en');
    doc.querySelector('.ut-squad-pitch-view')?.remove();
    expect(detectContext(doc, LIVE_URL, fc27LiveProfile, 1)).toMatchObject({ kind: 'SBC_HUB', confidence: 'low' });
  });

  it.each<Fc27Page>(['home', 'sbc-hub', 'sbc-challenge.fr', 'store', 'transfers', 'club', 'evolutions', 'squads'])(
    'detection of %s does not depend on any visible text or language',
    (page) => {
      const doc = loadFc27(page);
      const before = detectContext(doc, LIVE_URL, fc27LiveProfile, 1);
      scrambleText(doc);
      expect(detectContext(doc, LIVE_URL, fc27LiveProfile, 1)).toEqual(before);
    },
  );

  it('does not treat unrelated pages as the EA app', () => {
    loadHtml('<!doctype html><html><body><main><h1>EA SPORTS FC Companion</h1></main></body></html>');
    expect(selectProfile(document)).toBeNull();
  });

  it('follows SPA navigation without reloads', async () => {
    vi.useFakeTimers();
    loadFc27('home');
    const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL });
    const seen: EaContextSnapshot['kind'][] = [];
    const stop = adapter.observe({ onContextChange: (c) => seen.push(c.kind) });
    const swap = (page: Fc27Page) => {
      const next = new DOMParser().parseFromString(readFc27Page(page), 'text/html').querySelector('.ut-root-view');
      const root = document.querySelector('.ut-root-view');
      if (!next || !root) throw new Error('layout');
      root.replaceChildren(...[...next.childNodes].map((n) => document.importNode(n, true)));
    };
    for (const page of ['sbc-hub', 'sbc-challenge.en', 'sbc-hub', 'store', 'pack-results', 'transfers', 'club'] as const) {
      swap(page);
      await vi.advanceTimersByTimeAsync(200);
    }
    stop();
    expect(seen).toEqual(['HOME', 'SBC_HUB', 'SBC_CHALLENGE', 'SBC_HUB', 'STORE', 'PACK_RESULTS', 'TRANSFERS', 'CLUB']);
  });
});
