import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EaContextSnapshot } from '@fc/contracts';
import { readFixturePage } from '@fc/ea-fixtures';
import { createEaWebAdapter } from '../src/index.js';
import { loadPage } from './helpers.js';

afterEach(() => {
  vi.useRealTimers();
});

/** Swap only the view subtree, like an SPA navigation (no document reload). */
function navigateTo(page: 'club' | 'sbc-challenge' | 'store') {
  const parsed = new DOMParser().parseFromString(readFixturePage(page), 'text/html');
  const next = parsed.querySelector('.ut-content');
  const current = document.querySelector('.ut-content');
  if (!next || !current) throw new Error('fixture layout changed');
  current.replaceChildren(...[...next.childNodes].map((n) => document.importNode(n, true)));
}

describe('SPA context observation', () => {
  it('emits once per actual context change, debounced across DOM mutations', async () => {
    vi.useFakeTimers();
    loadPage('home');
    const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href });
    const seen: EaContextSnapshot['kind'][] = [];
    const stop = adapter.observeContext((current) => seen.push(current.kind));

    navigateTo('club');
    await vi.advanceTimersByTimeAsync(200);
    navigateTo('sbc-challenge');
    navigateTo('store'); // burst: only the final state should be reported
    await vi.advanceTimersByTimeAsync(200);
    document.querySelector('.ut-view-header')?.append(document.createElement('span')); // same context
    await vi.advanceTimersByTimeAsync(200);
    stop();

    expect(seen).toEqual(['HOME', 'CLUB', 'STORE']);
  });

  it('stops observing after cleanup', async () => {
    vi.useFakeTimers();
    loadPage('home');
    const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href });
    const onChange = vi.fn();
    const stop = adapter.observeContext(onChange);
    stop();
    navigateTo('club');
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
