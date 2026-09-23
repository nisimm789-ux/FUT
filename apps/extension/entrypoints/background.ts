import { browser } from 'wxt/browser';
import { handleContentMessage } from '@/src/background/handler';
import { tabStateKey } from '@/src/messaging/messages';
import { createChromeKeyValueStore } from '@/src/storage/chrome-store';

/**
 * MV3 service worker: an event router, not application memory. It can be
 * terminated at any moment; durable facts live in chrome.storage.session.
 */
export default defineBackground(() => {
  const session = createChromeKeyValueStore(browser.storage.session);

  // Toolbar icon opens the side panel (always a valid user gesture).
  void browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  browser.runtime.onMessage.addListener((message, sender) => {
    void handleContentMessage(
      {
        session,
        // Called synchronously inside the listener so Chrome keeps the click's user gesture.
        openSidePanel: (tabId) => browser.sidePanel.open({ tabId }),
        log: (text) => console.warn(`[fc-assistant] ${text}`),
      },
      message,
      { tabId: sender.tab?.id, fromOwnExtension: sender.id === browser.runtime.id },
    );
    return undefined;
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    void session.remove(tabStateKey(tabId));
  });
});
