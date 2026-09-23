import { validateContract } from '@fc/contracts';
import type { KeyValueStore } from '@fc/domain';
import { ContentToBackgroundSchema, tabStateKey } from '../messaging/messages.js';

export interface BackgroundDeps {
  session: KeyValueStore;
  /** Must be called synchronously within the message event to keep the user gesture. */
  openSidePanel: (tabId: number) => Promise<void>;
  log: (message: string) => void;
}

export interface MessageSender {
  tabId: number | undefined;
  /** True if the message comes from our own extension (content script or page). */
  fromOwnExtension: boolean;
}

/**
 * Service-worker message handling. Stateless by design: the worker can be
 * killed at any time, so every durable fact goes to chrome.storage.session.
 */
export function handleContentMessage(deps: BackgroundDeps, raw: unknown, sender: MessageSender): Promise<void> {
  if (!sender.fromOwnExtension || sender.tabId === undefined) return Promise.resolve();
  const parsed = validateContract(ContentToBackgroundSchema, raw);
  if (!parsed.ok) {
    deps.log(`rejected invalid message: ${parsed.issues.join('; ')}`);
    return Promise.resolve();
  }
  const message = parsed.value;
  switch (message.type) {
    case 'OPEN_SIDE_PANEL':
      return deps.openSidePanel(sender.tabId).catch(() => deps.log('sidePanel.open rejected (no user gesture?)'));
    case 'STATE_UPDATE':
      return deps.session.set(tabStateKey(sender.tabId), message.state);
  }
}
