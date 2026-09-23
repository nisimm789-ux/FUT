import { describe, expect, it, vi } from 'vitest';
import { createMemoryKeyValueStore } from '@fc/domain';
import { handleContentMessage } from '../src/background/handler.js';
import { contentScriptMatches } from '../src/config/hosts.js';
import { tabStateKey } from '../src/messaging/messages.js';

const validState = {
  context: { schemaVersion: 1, kind: 'HOME', confidence: 'high', signals: ['view:home'], profileId: 'synthetic-v1', observedAt: 1 },
  health: {
    schemaVersion: 1,
    adapterVersion: '0.1.0',
    profileId: 'synthetic-v1',
    safeMode: false,
    capabilities: { contextDetection: 'healthy', sbcReading: 'unknown', clubReading: 'unknown', squadReading: 'unsupported', packReading: 'unsupported', evolutionReading: 'unsupported', actions: 'disabled' },
    lastFailure: null,
    updatedAt: 1,
  },
  sbc: null,
  club: null,
  updatedAt: 1,
};

function deps() {
  return { session: createMemoryKeyValueStore(), openSidePanel: vi.fn(() => Promise.resolve()), log: vi.fn() };
}

describe('background message handler', () => {
  it('stores validated state per tab in session storage', async () => {
    const d = deps();
    await handleContentMessage(d, { type: 'STATE_UPDATE', state: validState }, { tabId: 7, fromOwnExtension: true });
    expect(await d.session.get(tabStateKey(7))).toEqual(validState);
  });

  it('rejects malformed messages without storing anything', async () => {
    const d = deps();
    await handleContentMessage(d, { type: 'STATE_UPDATE', state: { ...validState, context: { kind: 'HACK' } } }, { tabId: 7, fromOwnExtension: true });
    expect(await d.session.get(tabStateKey(7))).toBeUndefined();
    expect(d.log).toHaveBeenCalled();
  });

  it('ignores messages from outside the extension', async () => {
    const d = deps();
    await handleContentMessage(d, { type: 'OPEN_SIDE_PANEL' }, { tabId: 7, fromOwnExtension: false });
    expect(d.openSidePanel).not.toHaveBeenCalled();
  });

  it('opens the side panel for the sender tab', async () => {
    const d = deps();
    await handleContentMessage(d, { type: 'OPEN_SIDE_PANEL' }, { tabId: 3, fromOwnExtension: true });
    expect(d.openSidePanel).toHaveBeenCalledWith(3);
  });
});

describe('host configuration', () => {
  it('production matches only the EA Web App paths', () => {
    const matches = contentScriptMatches('production');
    expect(matches.every((m) => m.startsWith('https://www.ea.com/') && m.includes('/ea-sports-fc/ultimate-team/web-app/'))).toBe(true);
    expect(matches).not.toContain('<all_urls>');
  });

  it('development additionally matches the local fixture host', () => {
    expect(contentScriptMatches('development')).toContain('http://localhost:4173/*');
  });
});
