import { defineConfig } from 'wxt';

/** Developer tooling (Inspection Mode etc.) is enabled only for development-mode builds. */
const devTools = (mode: string) => mode === 'development';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: (env) => ({
    // Explicit flag instead of import.meta.env.DEV (which follows NODE_ENV).
    define: { __FCA_DEV_TOOLS__: JSON.stringify(devTools(env.mode)) },
  }),
  manifest: (env) => ({
    // The DEV suffix makes it obvious in chrome://extensions which build is loaded.
    name: devTools(env.mode) ? 'FC Assistant (DEV)' : 'FC Assistant',
    description: 'Read-only intelligence layer for the EA SPORTS FC Ultimate Team Web App (Phase 0 preview).',
    // Minimum permissions: storage (session/sync) and the side panel.
    // No host_permissions: content scripts are injected via static `matches`,
    // and the extension makes no network requests.
    permissions: ['storage', 'sidePanel'],
    minimum_chrome_version: '116',
    action: { default_title: devTools(env.mode) ? 'Open FC Assistant (DEV)' : 'Open FC Assistant' },
    // MV3 default CSP already forbids remote code; stated explicitly for review.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  }),
});
