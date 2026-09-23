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

export function loadClubFixture(): ClubSnapshot {
  return ClubSnapshotSchema.parse(JSON.parse(readFileSync(join(root, 'data', 'club.synthetic.json'), 'utf8')));
}

export function loadSbcFixture(): SbcChallengeSnapshot {
  return SbcChallengeSnapshotSchema.parse(JSON.parse(readFileSync(join(root, 'data', 'sbc-challenge.synthetic.json'), 'utf8')));
}
