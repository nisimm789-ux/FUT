import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { TabStateSchema, tabStateKey, type TabState } from '../messaging/messages.js';

/** Follows the active tab and its state in chrome.storage.session. */
export function useActiveTabState(): { tabId: number | null; state: TabState | null } {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<TabState | null>(null);

  useEffect(() => {
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
    };
    void browser.storage.session.get(key).then((items) => apply(items[key]));
    const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area === 'session' && key in changes) apply(changes[key]?.newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [tabId]);

  return { tabId, state };
}
