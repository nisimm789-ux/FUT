import { createRoot, type Root } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root';
import { ADAPTER_VERSION, createEaWebAdapter, inspectCurrentScreen } from '@fc/ea-adapter';
import { createTelemetry } from '@fc/telemetry';
import { AssistantButton } from '@fc/ui';
import { EA_WEB_APP_EXCLUDES, contentScriptMatches } from '@/src/config/hosts';
import { createContentController } from '@/src/content/controller';
import { PanelToContentSchema, type ContentToBackground, type InspectResponse } from '@/src/messaging/messages';

/**
 * Runs in Chrome's default ISOLATED world: it shares the DOM with the EA page
 * but not its JavaScript globals, and never touches cookies, storage, network
 * requests or input values of the page. READ ONLY.
 */
export default defineContentScript({
  matches: contentScriptMatches(import.meta.env.MODE),
  excludeMatches: [...EA_WEB_APP_EXCLUDES],
  runAt: 'document_idle',
  cssInjectionMode: 'ui',

  async main(ctx) {
    const send = (message: ContentToBackground) => {
      browser.runtime.sendMessage(message).catch(() => undefined);
    };
    const extensionVersion = browser.runtime.getManifest().version;

    const adapter = createEaWebAdapter({ document, window, getUrl: () => location.href });
    const telemetry = createTelemetry({ extensionVersion, adapterVersion: ADAPTER_VERSION, now: () => performance.now() });
    const controller = createContentController({
      adapter,
      telemetry,
      now: () => Date.now(),
      publishState: (state) => send({ type: 'STATE_UPDATE', state }),
    });

    const onPanelMessage = (raw: unknown, _sender: unknown, sendResponse: (response: InspectResponse) => void) => {
      const parsed = PanelToContentSchema.safeParse(raw);
      if (!parsed.success) return undefined;
      if (parsed.data.type === 'REFRESH') {
        controller.refresh();
        return undefined;
      }
      // Inspection mode exists only in development builds; in production this
      // branch is compiled out entirely (import.meta.env.DEV is a constant).
      if (import.meta.env.DEV) {
        sendResponse(inspectCurrentScreen({ adapter, document, url: location.href, extensionVersion, now: Date.now() }));
      } else {
        sendResponse({ ok: false, reason: 'DISABLED_IN_PRODUCTION', details: [] });
      }
      return undefined;
    };
    browser.runtime.onMessage.addListener(onPanelMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onPanelMessage));

    // Mount the launcher only once an EA app shell is recognised, so nothing
    // is injected into login, marketing or error pages on the matched paths.
    let mounted = false;
    const mountLauncher = async () => {
      if (mounted) return;
      mounted = true;
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
    };
    const offContext = controller.bus.subscribe('ContextChanged', ({ current }) => {
      if (current.profileId !== 'none') void mountLauncher();
    });

    controller.start();
    ctx.onInvalidated(() => {
      offContext();
      controller.stop();
    });
  },
});
