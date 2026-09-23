import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { ADAPTER_VERSION, createEaWebAdapter } from '@fc/ea-adapter';
import { createTelemetry } from '@fc/telemetry';
import { AssistantButton } from '@fc/ui';
import { contentScriptMatches } from '@/src/config/hosts';
import { createContentController } from '@/src/content/controller';
import { PanelToContentSchema, type ContentToBackground } from '@/src/messaging/messages';

/**
 * Runs in Chrome's default ISOLATED world: it shares the DOM with the EA page
 * but not its JavaScript globals, and never touches cookies, storage or
 * network requests of the page. READ ONLY.
 */
export default defineContentScript({
  matches: contentScriptMatches(import.meta.env.MODE),
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const send = (message: ContentToBackground) => {
      browser.runtime.sendMessage(message).catch(() => undefined);
    };

    const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href });
    const telemetry = createTelemetry({
      extensionVersion: browser.runtime.getManifest().version,
      adapterVersion: ADAPTER_VERSION,
      now: () => performance.now(),
    });
    const controller = createContentController({
      adapter,
      telemetry,
      now: () => Date.now(),
      publishState: (state) => send({ type: 'STATE_UPDATE', state }),
    });
    controller.start();
    ctx.onInvalidated(() => controller.stop());

    const onPanelMessage = (raw: unknown) => {
      if (PanelToContentSchema.safeParse(raw).success) controller.refresh();
      return undefined;
    };
    browser.runtime.onMessage.addListener(onPanelMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onPanelMessage));

    // Tiny in-page control, isolated in a Shadow DOM so neither side's CSS leaks.
    const ui = await createShadowRootUi<Root>(ctx, {
      name: 'fc-assistant-launcher',
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container) {
        // Position the container inside the shadow root: the isolated host is
        // reset with `all: initial !important`, which overrides host inline styles.
        Object.assign(container.style, { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483646' });
        const root = createRoot(container);
        root.render(<AssistantButton onClick={() => send({ type: 'OPEN_SIDE_PANEL' })} />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
