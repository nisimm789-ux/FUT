import { describe, expect, it } from 'vitest';
import {
  ClubItemSchema,
  ClubSnapshotSchema,
  DEFAULT_REMOTE_CONFIG,
  EaContextSnapshotSchema,
  InspectionReportSchema,
  ProvenanceSchema,
  RemoteConfigSchema,
  SbcChallengeSnapshotSchema,
  SbcRequirementSchema,
  SolveProblemSchema,
  SolverOptionsSchema,
  isLiveProvenance,
  validateContract,
} from '../src/index.js';

const item = {
  id: 'it-1',
  definitionId: 1,
  name: 'Synthetic',
  rating: 80,
  rarity: 'RARE',
  positions: ['ST'],
  nationId: 14,
  leagueId: 13,
  clubId: 1,
  tradeable: false,
  location: 'CLUB',
  estimatedPrice: null,
};

const challenge = {
  schemaVersion: 2,
  challengeId: 'c',
  challengeIdKind: 'FIXTURE',
  setId: null,
  name: 'n',
  squadSize: 5,
  filledSlots: null,
  interpretationLocale: null,
  provenance: 'LOCAL_FIXTURE',
  adapter: null,
  observedAt: 0,
};

describe('contracts', () => {
  it('accepts a valid club item and rejects out-of-range ratings', () => {
    expect(ClubItemSchema.safeParse(item).success).toBe(true);
    expect(ClubItemSchema.safeParse({ ...item, rating: 150 }).success).toBe(false);
    expect(ClubItemSchema.safeParse({ ...item, id: '<script>' }).success).toBe(false);
  });

  it('rejects duplicate item ids inside a club snapshot', () => {
    const result = ClubSnapshotSchema.safeParse({ schemaVersion: 2, coverage: 'complete', items: [item, item], provenance: 'LOCAL_FIXTURE', observedAt: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects snapshots from a different contract version (v1 payloads fail closed)', () => {
    const result = EaContextSnapshotSchema.safeParse({ schemaVersion: 1, kind: 'HOME', confidence: 'high', signals: [], profileId: 'x', observedAt: 0 });
    expect(result.success).toBe(false);
    expect(ClubSnapshotSchema.safeParse({ schemaVersion: 2, coverage: 'complete', items: [], source: 'fixture', observedAt: 0 }).success).toBe(false);
  });

  it('validates SBC requirement consistency', () => {
    const req = (r: object) => ({ via: 'fixture', ...r });
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements: [req({ id: 'r', type: 'MIN_COUNT', count: 6, filter: { rarities: ['RARE'] } })] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements: [req({ id: 'r', type: 'MIN_SQUAD_RATING', value: 70 }), req({ id: 'r', type: 'MIN_SQUAD_RATING', value: 71 })] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements: [req({ id: 'r', type: 'NOT_A_TYPE' })] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements: [req({ id: 'r', type: 'SQUAD_SIZE', count: 7 })] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, filledSlots: 6, requirements: [req({ id: 'r', type: 'SQUAD_SIZE', count: 5 })] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements: [req({ id: 'r', type: 'PLAYER_QUALITY' })] }).success).toBe(false);
  });

  it('keeps local fingerprint identities consistent with their kind', () => {
    const requirements = [{ id: 'r', via: 'text', type: 'MIN_SQUAD_RATING', value: 80 }];
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements, challengeId: 'local-0a1b2c3d', challengeIdKind: 'LOCAL_FINGERPRINT' }).success).toBe(true);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...challenge, requirements, challengeId: 'ch-1', challengeIdKind: 'LOCAL_FINGERPRINT' }).success).toBe(false);
  });

  it('represents unknown requirements with a fingerprint and bounded description', () => {
    const unknown = { id: 'r9', type: 'UNKNOWN', reason: 'UNRECOGNIZED_TEXT', structuralFingerprint: 'deadbeef', rawSafeDescription: 'Icons: Min. 1' };
    expect(SbcRequirementSchema.safeParse(unknown).success).toBe(true);
    expect(SbcRequirementSchema.safeParse({ ...unknown, structuralFingerprint: 'nope' }).success).toBe(false);
    expect(SbcRequirementSchema.safeParse({ ...unknown, rawSafeDescription: 'x'.repeat(121) }).success).toBe(false);
  });

  it('requires provenance on snapshots and solve inputs', () => {
    expect(ProvenanceSchema.options).toEqual(['EA_WEB_LIVE', 'LOCAL_FIXTURE', 'IMPORTED_FIXTURE', 'MANUAL']);
    expect(isLiveProvenance('EA_WEB_LIVE')).toBe(true);
    expect(isLiveProvenance('LOCAL_FIXTURE')).toBe(false);
    const problem = {
      schemaVersion: 2,
      challenge: { ...challenge, requirements: [{ id: 'r', via: 'fixture', type: 'MIN_SQUAD_RATING', value: 70 }] },
      candidates: [],
      options: { strategy: 'BALANCED', protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
    };
    expect(SolveProblemSchema.safeParse(problem).success).toBe(false);
    expect(SolveProblemSchema.safeParse({ ...problem, candidatesProvenance: 'LOCAL_FIXTURE' }).success).toBe(true);
  });

  it('rejects a solver option that both locks and protects the same item', () => {
    const r = SolverOptionsSchema.safeParse({ strategy: 'BALANCED', protectedItemIds: ['a'], lockedItemIds: ['a'], maxAdditionalCoins: 0 });
    expect(r.success).toBe(false);
  });

  it('remote config is strict and data-only', () => {
    expect(RemoteConfigSchema.safeParse(DEFAULT_REMOTE_CONFIG).success).toBe(true);
    expect(RemoteConfigSchema.safeParse({ ...DEFAULT_REMOTE_CONFIG, script: 'alert(1)' }).success).toBe(false);
    expect(RemoteConfigSchema.safeParse({ ...DEFAULT_REMOTE_CONFIG, actionsEnabled: true }).success).toBe(false);
  });

  it('inspection reports reject unknown fields (no smuggled cookies/HTML)', () => {
    const shape = InspectionReportSchema.shape;
    expect(Object.keys(shape).sort()).toEqual(
      ['candidates', 'context', 'document', 'health', 'landmarks', 'location', 'meta', 'navigation', 'perf', 'readerDiagnostics', 'reportVersion', 'ruleScores', 'safety', 'sbc', 'validationFailures', 'views'].sort(),
    );
    expect(shape.document.safeParse({ lang: 'en', cookie: 'a=b' }).success).toBe(false);
    expect(shape.location.safeParse({ origin: 'https://www.ea.com', path: '/x', route: '', queryKeys: [], query: '?token=1' }).success).toBe(false);
  });

  it('validateContract reports paths without echoing values', () => {
    const r = validateContract(ClubItemSchema, { ...item, name: 'SECRET-VALUE', rating: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(' ')).not.toContain('SECRET-VALUE');
  });
});
