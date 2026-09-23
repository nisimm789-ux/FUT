import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'FC Assistant',
    description: 'Read-only intelligence layer for the EA SPORTS FC Ultimate Team Web App (Phase 0 preview).',
    // Minimum permissions: storage (session/sync) and the side panel.
    // No host_permissions: content scripts are injected via static `matches`,
    // and the extension makes no network requests in Phase 0.
    permissions: ['storage', 'sidePanel'],
    minimum_chrome_version: '116',
    action: { default_title: 'Open FC Assistant' },
    // MV3 default CSP already forbids remote code; stated explicitly for review.
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'self'",
    },
  },
});
