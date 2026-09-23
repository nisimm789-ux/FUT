import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_ROOT } from '@fc/ea-fixtures';
import { createEaWebAdapter, fc27LiveProfile } from '../src/index.js';
import { LIVE_URL, loadHtml } from './helpers.js';

/**
 * Regression tests generated from REAL (sanitized) FC 27 inspection reports.
 * Each fixtures/ea/captured/<name>.html may have <name>.expect.json:
 *   { "context": "SBC_CHALLENGE", "requirementTypes": ["MIN_SQUAD_RATING", ...], "squadSize": 11 }
 */
const dir = join(FIXTURES_ROOT, 'captured');
const captured = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.html')) : [];

interface Expectation {
  context: string;
  requirementTypes?: string[];
  squadSize?: number;
}

describe('captured live fixtures', () => {
  it('a profile may only be marked verified once real captured fixtures back it', () => {
    if (fc27LiveProfile.verified) expect(captured.length).toBeGreaterThan(0);
    expect(existsSync(dir)).toBe(true);
  });

  it.each(captured)('%s behaves as recorded', (file) => {
    loadHtml(readFileSync(join(dir, file), 'utf8'));
    const adapter = createEaWebAdapter({ document, window, getUrl: () => LIVE_URL, now: () => 0 });
    const expectPath = join(dir, file.replace(/\.html$/, '.expect.json'));
    expect(existsSync(expectPath), `${file} needs a ${file.replace(/\.html$/, '.expect.json')}`).toBe(true);
    const expected = JSON.parse(readFileSync(expectPath, 'utf8')) as Expectation;
    expect(adapter.detectContext().kind).toBe(expected.context);
    if (expected.requirementTypes) {
      const result = adapter.readSbcChallenge();
      if (!result.ok) throw new Error(`${result.category}: ${result.message}`);
      expect(result.value.requirements.map((r) => r.type)).toEqual(expected.requirementTypes);
      if (expected.squadSize !== undefined) expect(result.value.squadSize).toBe(expected.squadSize);
    }
  });
});
