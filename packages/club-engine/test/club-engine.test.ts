import { describe, expect, it } from 'vitest';
import type { ClubItem } from '@fc/contracts';
import { findDuplicateGroups, spareItemIds, summarizeClub } from '../src/index.js';

const make = (id: string, definitionId: number, location: ClubItem['location'] = 'CLUB'): ClubItem => ({
  id,
  definitionId,
  name: `P${id}`,
  rating: 70,
  rarity: 'COMMON',
  positions: ['CM'],
  nationId: 1,
  leagueId: 1,
  clubId: 1,
  tradeable: false,
  location,
  estimatedPrice: null,
});

describe('club-engine', () => {
  const items = [make('1', 500), make('2', 500, 'SBC_STORAGE'), make('3', 600), make('4', 700, 'SBC_STORAGE')];

  it('finds duplicate groups by definition', () => {
    expect(findDuplicateGroups(items)).toEqual([{ definitionId: 500, itemIds: ['1', '2'] }]);
  });

  it('marks storage items and extra copies as spare, keeping the club copy', () => {
    expect([...spareItemIds(items)].sort()).toEqual(['2', '4']);
  });

  it('summarizes without exposing individual items', () => {
    const summary = summarizeClub({ schemaVersion: 2, coverage: 'complete', items, provenance: 'LOCAL_FIXTURE', observedAt: 0 });
    expect(summary).toMatchObject({ total: 4, duplicateGroups: 1, byQuality: { SILVER: 4 } });
  });
});
