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
    const offenders = ['apps', 'packages']
      .flatMap((top) => readdirSync(join(root, top)).map((d) => join(root, top, d)))
      .filter((dir) => !dir.endsWith(join('packages', 'ea-adapter')))
      .flatMap((dir) => (statSync(dir).isDirectory() ? sourceFiles(dir) : []))
      .filter((f) => /['"`]\.ut-[a-z]/.test(code(f)));
    expect(offenders.map((f) => relative(root, f))).toEqual([]);
  });
});
