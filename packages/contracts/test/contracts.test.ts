import { describe, expect, it } from 'vitest';
import {
  ClubItemSchema,
  ClubSnapshotSchema,
  DEFAULT_REMOTE_CONFIG,
  EaContextSnapshotSchema,
  RemoteConfigSchema,
  SbcChallengeSnapshotSchema,
  SolverOptionsSchema,
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

describe('contracts', () => {
  it('accepts a valid club item and rejects out-of-range ratings', () => {
    expect(ClubItemSchema.safeParse(item).success).toBe(true);
    expect(ClubItemSchema.safeParse({ ...item, rating: 150 }).success).toBe(false);
    expect(ClubItemSchema.safeParse({ ...item, id: '<script>' }).success).toBe(false);
  });

  it('rejects duplicate item ids inside a club snapshot', () => {
    const result = ClubSnapshotSchema.safeParse({ schemaVersion: 1, coverage: 'complete', items: [item, item], source: 'fixture', observedAt: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects snapshots from a different contract version', () => {
    const result = EaContextSnapshotSchema.safeParse({ schemaVersion: 2, kind: 'HOME', confidence: 'high', signals: [], profileId: 'x', observedAt: 0 });
    expect(result.success).toBe(false);
  });

  it('validates SBC requirement consistency', () => {
    const base = { schemaVersion: 1, challengeId: 'c', setId: null, name: 'n', squadSize: 5, source: 'fixture', observedAt: 0 };
    expect(SbcChallengeSnapshotSchema.safeParse({ ...base, requirements: [{ id: 'r', type: 'MIN_COUNT', count: 6, filter: { rarities: ['RARE'] } }] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...base, requirements: [{ id: 'r', type: 'MIN_SQUAD_RATING', value: 70 }, { id: 'r', type: 'MIN_SQUAD_RATING', value: 71 }] }).success).toBe(false);
    expect(SbcChallengeSnapshotSchema.safeParse({ ...base, requirements: [{ id: 'r', type: 'NOT_A_TYPE' }] }).success).toBe(false);
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

  it('validateContract reports paths without echoing values', () => {
    const r = validateContract(ClubItemSchema, { ...item, name: 'SECRET-VALUE', rating: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join(' ')).not.toContain('SECRET-VALUE');
  });
});
