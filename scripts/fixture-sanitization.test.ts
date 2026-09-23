import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findSensitiveContent } from '@fc/ea-adapter';
import { FIXTURES_ROOT } from '@fc/ea-fixtures';

/**
 * CI gate: nothing under fixtures/ may contain credentials, tokens, cookies,
 * account identifiers, e-mail addresses, input values or full authenticated
 * pages. Dev tooling pages (site/) may contain <script>; nothing else may.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(html|json|md|txt)$/.test(name) ? [full] : [];
  });
}

describe('fixture sanitization', () => {
  const all = files(FIXTURES_ROOT);

  it('scans a meaningful set of fixtures', () => {
    expect(all.length).toBeGreaterThan(30);
  });

  it.each(all.map((f) => [relative(FIXTURES_ROOT, f), f]))('%s contains no sensitive patterns', (rel, file) => {
    const findings = findSensitiveContent(readFileSync(file, 'utf8')).filter((f) => !(f.rule === 'script-tag' && rel.startsWith('site/')));
    expect(findings).toEqual([]);
  });

  it('captured fixtures are minimal skeletons, not saved pages', () => {
    for (const file of all.filter((f) => relative(FIXTURES_ROOT, f).startsWith('captured/') && f.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      expect(html).toContain('Generated from a sanitized inspection report');
      expect(html.length).toBeLessThan(40_000);
      expect(html).not.toMatch(/<(script|link|iframe|form|input|meta http-equiv)/i);
    }
  });

  it('the detector catches the patterns it is meant to catch', () => {
    const samples: Record<string, string> = {
      'email-address': 'contact jane.doe@example.com now',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc',
      'bearer-token': 'Authorization: Bearer abcdefghijklmnop',
      'auth-header-or-cookie-name': 'x-ut-sid: 123',
      'credential-keyword': '"refresh_token": "x"',
      'account-identifier-key': 'personaId: 123456',
      'long-hex-secret': 'deadbeefdeadbeefdeadbeefdeadbeef00',
      'input-value': '<input type="text" value="typed">',
      'password-field': '<input type="password">',
      'storage-dump': 'document.cookie',
      'script-tag': '<script>alert(1)</script>',
    };
    for (const [rule, sample] of Object.entries(samples)) {
      expect(findSensitiveContent(sample).map((f) => f.rule), rule).toContain(rule);
    }
  });
});
