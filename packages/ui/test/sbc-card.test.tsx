import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { SbcChallengeSnapshot } from '@fc/contracts';
import { SbcChallengeCard, requirementLabel } from '../src/index.js';

afterEach(cleanup);

const snapshot = (overrides: Partial<SbcChallengeSnapshot> = {}): SbcChallengeSnapshot => ({
  schemaVersion: 2,
  challengeId: 'local-0a1b2c3d',
  challengeIdKind: 'LOCAL_FINGERPRINT',
  setId: null,
  name: 'Synthetic Upgrade 84',
  squadSize: 11,
  filledSlots: 4,
  requirements: [
    { id: 'req-1', via: 'text', type: 'MIN_SQUAD_RATING', value: 87 },
    { id: 'req-2', via: 'text', type: 'MIN_COUNT', count: 1, filter: { programs: ['TOTW'] } },
    { id: 'req-3', via: 'text', type: 'MIN_CHEMISTRY', value: 24 },
    { id: 'req-4', type: 'UNKNOWN', reason: 'UNRECOGNIZED_TEXT', structuralFingerprint: 'abcdef01', rawSafeDescription: 'Icon Players: Min. 1' },
  ],
  interpretationLocale: 'en',
  provenance: 'EA_WEB_LIVE',
  adapter: { adapterVersion: '0.2.0', profileId: 'fc27-live', profileVerified: false },
  observedAt: 0,
  ...overrides,
});

describe('SbcChallengeCard', () => {
  it('shows live EA data with the requested labels', () => {
    render(<SbcChallengeCard snapshot={snapshot()} freshness="current" staleReason={null} unverifiableIds={new Set(['req-2', 'req-3'])} />);
    expect(screen.getByTestId('provenance').textContent).toBe('LIVE EA');
    expect(screen.getByTestId('freshness').textContent).toBe('CURRENT');
    expect(screen.getByTestId('squad-size').textContent).toBe('11 (4 placed)');
    const reqs = screen.getByTestId('requirements').textContent ?? '';
    expect(reqs).toContain('Squad Rating: ≥ 87');
    expect(reqs).toContain('TOTW: ≥ 1');
    expect(reqs).toContain('Chemistry: ≥ 24');
    expect(reqs).toContain('Not understood (UNRECOGNIZED_TEXT): “Icon Players: Min. 1”');
    expect(reqs).toContain('not verifiable yet');
  });

  it('makes fixture data visibly distinct and never labels it live', () => {
    const { container } = render(<SbcChallengeCard snapshot={snapshot({ provenance: 'LOCAL_FIXTURE' })} freshness="current" staleReason={null} unverifiableIds={new Set()} />);
    expect(screen.getByTestId('provenance').textContent).toBe('FIXTURE');
    expect(container.querySelector('.fca-demo')).not.toBeNull();
    expect(container.textContent).toContain('Not live EA data');
  });

  it('marks stale data with its reason', () => {
    render(<SbcChallengeCard snapshot={snapshot()} freshness="stale" staleReason="READ_FAILED" unverifiableIds={new Set()} />);
    expect(screen.getByTestId('freshness').textContent).toBe('STALE · READ_FAILED');
  });
});

describe('requirementLabel', () => {
  it.each([
    [{ id: 'a', via: 'text', type: 'MAX_SAME', dimension: 'club', count: 3 }, 'Same club: ≤ 3'],
    [{ id: 'a', via: 'text', type: 'MIN_UNIQUE', dimension: 'league', count: 3 }, 'Leagues: ≥ 3'],
    [{ id: 'a', via: 'text', type: 'MIN_COUNT', count: 1, filter: { nationIds: [14] } }, 'Nation #14: ≥ 1'],
    [{ id: 'a', via: 'text', type: 'PLAYER_QUALITY', min: 'SILVER' }, 'Player quality: ≥ Silver'],
    [{ id: 'a', via: 'text', type: 'SQUAD_SIZE', count: 7 }, 'Players in squad: 7'],
  ] as const)('%j -> %s', (req, label) => {
    expect(requirementLabel(req as Parameters<typeof requirementLabel>[0])).toBe(label);
  });
});
