import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Enforces the dependency direction documented in docs/architecture.md.
 * Checks both declared package dependencies and actual import statements.
 */
const root = join(import.meta.dirname, '..');

const PURE = ['@fc/contracts', '@fc/domain', '@fc/solver', '@fc/club-engine', '@fc/telemetry', '@fc/ea-actions'];
const RUNTIME_SPECIFIC = /^(react|react-dom|wxt|@wxt-dev\/|fastify|@prisma\/|pg$|webextension-polyfill)/;

const rules: Record<string, { forbid: RegExp[]; allowDom?: boolean }> = {
  'packages/contracts': { forbid: [/^@fc\//, RUNTIME_SPECIFIC] },
  'packages/domain': { forbid: [/^@fc\/(?!contracts)/, RUNTIME_SPECIFIC] },
  'packages/club-engine': { forbid: [/^@fc\/(?!contracts)/, RUNTIME_SPECIFIC] },
  'packages/solver': { forbid: [/^@fc\/(ea-adapter|ea-actions|ui|telemetry|ea-fixtures)/, RUNTIME_SPECIFIC] },
  'packages/telemetry': { forbid: [/^@fc\/(?!contracts)/, RUNTIME_SPECIFIC] },
  'packages/ea-actions': { forbid: [/^@fc\/(?!contracts)/, RUNTIME_SPECIFIC] },
  // READ path must never be able to reach the WRITE path.
  'packages/ea-adapter': { forbid: [/^@fc\/(ea-actions|ui|solver|telemetry)/, RUNTIME_SPECIFIC], allowDom: true },
  'packages/ui': { forbid: [/^@fc\/(ea-adapter|ea-actions|solver|domain)/, /^(wxt|@wxt-dev\/|fastify)/] },
  'apps/extension': { forbid: [/^@fc\/ea-actions/] },
  'apps/api': { forbid: [/^@fc\/(ea-adapter|ea-actions|ui)/, /^(react|wxt)/] },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (['node_modules', '.wxt', '.output', 'test', 'dist'].includes(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
  });
}

/** Source text without comments, so documentation may mention chrome.* etc. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importsOf(file: string): string[] {
  const text = code(file);
  const patterns = [
    /^\s*(?:import|export)\s[^'";]*?from\s+['"]([^'"]+)['"]/gm, // import x from 'y' / export * from 'y'
    /^\s*import\s+['"]([^'"]+)['"]/gm, // import 'side-effect'
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('y')
  ];
  return patterns.flatMap((re) => [...text.matchAll(re)].map((m) => m[1] ?? ''));
}

describe('architecture boundaries', () => {
  for (const [pkg, rule] of Object.entries(rules)) {
    it(`${pkg} respects its dependency rules`, () => {
      const manifest = JSON.parse(readFileSync(join(root, pkg, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
      const declared = Object.keys(manifest.dependencies ?? {});
      const imported = sourceFiles(join(root, pkg)).flatMap((f) => importsOf(f).map((spec) => ({ f, spec })));
      const violations = [
        ...declared.filter((d) => rule.forbid.some((r) => r.test(d))).map((d) => `package.json depends on ${d}`),
        ...imported.filter(({ spec }) => rule.forbid.some((r) => r.test(spec))).map(({ f, spec }) => `${relative(root, f)} imports ${spec}`),
      ];
      expect(violations).toEqual([]);
    });
  }

  it('pure packages do not reference browser/extension globals', () => {
    const offenders = PURE.flatMap((name) => {
      const dir = join(root, 'packages', name.replace('@fc/', ''));
      return sourceFiles(join(dir, 'src')).filter((f) => /\b(chrome|browser|document|window)\s*\./.test(code(f)));
    });
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });

  it('EA selectors live only in ea-adapter profiles', () => {
    const profilesDir = join(root, 'packages', 'ea-adapter', 'src', 'profiles');
    const offenders = ['apps', 'packages']
      .flatMap((top) => readdirSync(join(root, top)).map((d) => join(root, top, d)))
      .flatMap((dir) => (statSync(dir).isDirectory() ? sourceFiles(dir) : []))
      .filter((f) => !f.startsWith(profilesDir))
      .filter((f) => /['"`]\.ut-[a-z]/.test(code(f)));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });

  it('localized UI text lives only in the interpretation dictionaries', async () => {
    const { en, de, fr, es } = await import('@fc/ea-adapter');
    const phrases = [en, de, fr, es]
      .flatMap((d) => Object.values(d.subjects).flat())
      .filter((p) => p.includes(' ') && p.length >= 8);
    const adapterSrc = join(root, 'packages', 'ea-adapter', 'src');
    const dictionaries = join(adapterSrc, 'interpretation', 'dictionaries');
    // Scope: everything that reads EA (the adapter) plus the content script.
    // Our own English product copy in @fc/ui is not EA-text interpretation.
    const candidates = [...sourceFiles(adapterSrc), ...sourceFiles(join(root, 'apps', 'extension', 'entrypoints', 'ea.content'))].filter(
      (f) => !f.startsWith(dictionaries),
    );
    // Only string literals count: identifiers such as MIN_SQUAD_RATING are code, not UI text.
    const literals = (source: string) => [...source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2] ?? '');
    const offenders = candidates.filter((f) =>
      // Literals without whitespace are code tokens (enums, kebab/snake keys, "requirement:SQUAD_SIZE").
      literals(code(f)).filter((lit) => /\s/.test(lit)).some((lit) => {
        const text = ` ${lit.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;
        return phrases.some((p) => text.includes(` ${p} `));
      }),
    );
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
    const importers = sourceFiles(adapterSrc).filter((f) => !f.startsWith(join(adapterSrc, 'interpretation')) && importsOf(f).some((i) => i.includes('dictionaries')));
    expect(importers.map((f) => relative(root, f))).toEqual([]);
  });

  it('inspection mode is reachable only from development builds of the content script', () => {
    const content = code(join(root, 'apps', 'extension', 'entrypoints', 'ea.content', 'index.tsx'));
    const inspectCall = content.indexOf('inspectCurrentScreen({');
    const devGuard = content.indexOf('if (__FCA_DEV_TOOLS__) {');
    expect(inspectCall).toBeGreaterThan(-1);
    expect(devGuard).toBeGreaterThan(-1);
    expect(devGuard).toBeLessThan(inspectCall);
  });

  it('developer tooling is gated by the explicit build flag, never import.meta.env.DEV (follows NODE_ENV)', () => {
    const ext = join(root, 'apps', 'extension');
    const offenders = [...sourceFiles(join(ext, 'entrypoints')), ...sourceFiles(join(ext, 'src'))].filter((f) => /import\.meta\.env\.DEV\b/.test(code(f)));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
    const config = code(join(ext, 'wxt.config.ts'));
    expect(config).toMatch(/__FCA_DEV_TOOLS__: JSON\.stringify\(devTools\(env\.mode\)\)/);
    expect(config).toMatch(/mode === 'development'/);
    const panel = code(join(ext, 'entrypoints', 'sidepanel', 'App.tsx'));
    expect(panel).toMatch(/\{__FCA_DEV_TOOLS__ && \(\s*<section className="fca-card" aria-label="Developer">/);
  });

  it('extension permissions stay minimal', async () => {
    const config = code(join(root, 'apps', 'extension', 'wxt.config.ts'));
    expect(config).toMatch(/permissions: \['storage', 'sidePanel'\]/);
    expect(config).not.toMatch(/host_permissions|<all_urls>|'tabs'|'scripting'|'cookies'|'webRequest'/);
    const { contentScriptMatches } = await import('../apps/extension/src/config/hosts.js');
    for (const m of contentScriptMatches('production')) expect(m).toMatch(/^https:\/\/www\.ea\.com\/(\*\/)?ea-sports-fc\/ultimate-team\/web-app\/\*$/);
  });
});
