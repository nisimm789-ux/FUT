import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClubSnapshotSchema, SbcChallengeSnapshotSchema } from '@fc/contracts';
import type { ClubSnapshot, SbcChallengeSnapshot } from '@fc/contracts';

/** Node-only helpers for tests. Browser code imports the JSON files directly. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export const FIXTURE_PAGES = [
  'home',
  'squads',
  'sbc-hub',
  'sbc-challenge',
  'sbc-challenge-unsupported',
  'club',
  'club-malformed',
  'store',
  'pack-results',
  'transfers',
  'evolutions',
  'unknown',
  'not-ea',
] as const;
export type FixturePage = (typeof FIXTURE_PAGES)[number];

export function readFixturePage(name: FixturePage): string {
  return readFileSync(join(root, 'pages', `${name}.html`), 'utf8');
}

/** Synthetic pages modelling the CANDIDATE fc27-live profile (not captured from EA). */
export const FC27_PAGES = [
  'sbc-challenge.en',
  'sbc-challenge.de',
  'sbc-challenge.fr',
  'sbc-challenge.es',
  'sbc-challenge-no-lang',
  'sbc-challenge-supported.en',
  'sbc-challenge-unknown.en',
  'sbc-challenge-seven.en',
  'sbc-challenge-no-requirements',
  'sbc-challenge-no-squad-size',
  'sbc-challenge-inconsistent',
  'sbc-challenge-live-empty-pitch.en',
  'home',
  'squads',
  'sbc-hub',
  'store',
  'pack-results',
  'transfers',
  'club',
  'evolutions',
  'nav-only-store',
  'unknown',
] as const;
export type Fc27Page = (typeof FC27_PAGES)[number];

export function readFc27Page(name: Fc27Page): string {
  return readFileSync(join(root, 'fc27', `${name}.html`), 'utf8');
}

/** Absolute path of the fixtures root (for scanners). */
export const FIXTURES_ROOT = root;

export function loadClubFixture(): ClubSnapshot {
  return ClubSnapshotSchema.parse(JSON.parse(readFileSync(join(root, 'data', 'club.synthetic.json'), 'utf8')));
}

export function loadSbcFixture(): SbcChallengeSnapshot {
  return SbcChallengeSnapshotSchema.parse(JSON.parse(readFileSync(join(root, 'data', 'sbc-challenge.synthetic.json'), 'utf8')));
}
