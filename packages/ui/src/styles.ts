/**
 * Scoped styles for our components. Every class is prefixed `fca-` and is
 * only ever injected into our own documents or Shadow DOM roots, never into
 * the EA page's global stylesheet.
 */
export const uiStyles = `
.fca-card { border: 1px solid var(--fca-border, #2a3448); border-radius: 10px; padding: 12px; margin: 0 0 12px; background: var(--fca-card, #151b27); }
.fca-card h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; margin: 0 0 8px; color: var(--fca-muted, #9aa5b8); }
.fca-kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; font-size: 13px; margin: 0; }
.fca-kv dt { color: var(--fca-muted, #9aa5b8); }
.fca-kv dd { margin: 0; overflow-wrap: anywhere; }
.fca-pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.fca-state-healthy { background: #173d2a; color: #6ee7a0; }
.fca-state-degraded { background: #45300f; color: #fbbf5c; }
.fca-state-unsupported, .fca-state-unknown { background: #262d3b; color: #9aa5b8; }
.fca-state-disabled { background: #3d1a1f; color: #f58b98; }
.fca-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.fca-table th, .fca-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--fca-border, #2a3448); }
.fca-table th { color: var(--fca-muted, #9aa5b8); font-weight: 500; }
.fca-status-SOLVED { color: #6ee7a0; }
.fca-status-NO_SOLUTION, .fca-status-INVALID_PROBLEM { color: #f58b98; }
.fca-status-UNSUPPORTED { color: #fbbf5c; }
.fca-muted { color: var(--fca-muted, #9aa5b8); font-size: 12px; }
.fca-ok { color: #6ee7a0; }
.fca-fail { color: #f58b98; }
`;
