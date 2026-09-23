import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { TabStateSchema, tabStateKey, type TabState } from '../messaging/messages.js';

/**
 * Follows the active tab and its state in chrome.storage.session.
 * `updateLatencyMs` = time from the content script producing a state to the
 * panel receiving it (same machine clock).
 */
export function useActiveTabState(): { tabId: number | null; state: TabState | null; updateLatencyMs: number | null } {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<TabState | null>(null);
  const [updateLatencyMs, setLatency] = useState<number | null>(null);

  useEffect(() => {
    // Development builds only: ?tabId=N pins the panel to a tab (used by the smoke test,
    // which renders the panel page in its own tab).
    const pinned = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('tabId')) : NaN;
    if (Number.isInteger(pinned) && pinned > 0) {
      setTabId(pinned);
      return undefined;
    }
    const syncActiveTab = async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id ?? null);
    };
    void syncActiveTab();
    const onActivated = () => void syncActiveTab();
    browser.tabs.onActivated.addListener(onActivated);
    return () => browser.tabs.onActivated.removeListener(onActivated);
  }, []);

  useEffect(() => {
    if (tabId === null) return;
    const key = tabStateKey(tabId);
    const apply = (raw: unknown) => {
      const parsed = TabStateSchema.safeParse(raw);
      setState(parsed.success ? parsed.data : null);
      if (parsed.success) setLatency(Math.max(0, Date.now() - parsed.data.updatedAt));
    };
    void browser.storage.session.get(key).then((items) => apply(items[key]));
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && key in changes) apply(changes[key]?.newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [tabId]);

  return { tabId, state, updateLatencyMs };
}
