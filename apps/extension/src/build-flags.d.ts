/**
 * Compile-time build flags, replaced by literals via Vite `define` in
 * wxt.config.ts. Derived from WXT's `--mode` ONLY (never from NODE_ENV, which
 * is what `import.meta.env.DEV` follows and which a user's shell may set).
 *
 * __FCA_DEV_TOOLS__ = true  -> `wxt build --mode development` / `wxt` dev server:
 *                              Developer section, Inspection Mode, ?tabId= pin.
 * __FCA_DEV_TOOLS__ = false -> production: those branches are compiled out.
 */
declare const __FCA_DEV_TOOLS__: boolean;
