import { describe, expect, it } from 'vitest';
import { EaContextSnapshotSchema, type EaContextKind } from '@fc/contracts';
import type { FixturePage } from '@fc/ea-fixtures';
import { detectContext, eaWebCandidateProfile, selectProfile, syntheticV1Profile } from '../src/index.js';
import { loadPage } from './helpers.js';

describe('detectContext (synthetic-v1 fixtures)', () => {
  it.each<[FixturePage, EaContextKind]>([
    ['home', 'HOME'],
    ['squads', 'SQUADS'],
    ['sbc-hub', 'SBC_HUB'],
    ['sbc-challenge', 'SBC_CHALLENGE'],
    ['sbc-challenge-unsupported', 'SBC_CHALLENGE'],
    ['club', 'CLUB'],
    ['store', 'STORE'],
    ['pack-results', 'PACK_RESULTS'],
    ['transfers', 'TRANSFERS'],
    ['evolutions', 'EVOLUTIONS'],
    ['unknown', 'UNKNOWN'],
  ])('%s -> %s', (page, expected) => {
    const doc = loadPage(page);
    const profile = selectProfile(doc);
    expect(profile?.id).toBe('synthetic-v1');
    const snapshot = detectContext(doc, 'https://example.test/', profile, 1);
    expect(EaContextSnapshotSchema.parse(snapshot).kind).toBe(expected);
    expect(snapshot.confidence).toBe(expected === 'UNKNOWN' ? 'none' : 'high');
  });

  it('reports UNKNOWN with no profile on a non-EA page', () => {
    const doc = loadPage('not-ea');
    expect(selectProfile(doc)).toBeNull();
    expect(detectContext(doc, 'https://example.test/', null, 1)).toMatchObject({ kind: 'UNKNOWN', profileId: 'none' });
  });

  it('uses URL hints only as low-confidence fallback', () => {
    const doc = loadPage('unknown');
    const snapshot = detectContext(doc, 'http://localhost:4173/site/#/club', syntheticV1Profile, 1);
    expect(snapshot).toMatchObject({ kind: 'CLUB', confidence: 'low' });
  });

  it('does not depend on UI language (fixtures are in de/fr/es)', () => {
    for (const page of ['home', 'sbc-hub', 'sbc-challenge'] as const) {
      const doc = loadPage(page);
      expect(doc.documentElement.lang).not.toBe('en');
      expect(detectContext(doc, '', syntheticV1Profile, 1).kind).not.toBe('UNKNOWN');
    }
  });

  it('the unverified live candidate profile defines no readers', () => {
    expect(eaWebCandidateProfile.verified).toBe(false);
    expect(eaWebCandidateProfile.sbc).toBeUndefined();
    expect(eaWebCandidateProfile.club).toBeUndefined();
  });
});
