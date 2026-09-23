import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AdapterHealth, ClubItem, SolveResult } from '@fc/contracts';
import { AssistantButton, HealthPanel, SolutionView } from '../src/index.js';

afterEach(cleanup);

const health: AdapterHealth = {
  schemaVersion: 2,
  adapterVersion: '0.2.0',
  profileId: 'synthetic-v1',
  profileVerified: true,
  safeMode: false,
  capabilities: {
    contextDetection: 'healthy',
    sbcReading: 'healthy',
    clubReading: 'degraded',
    squadReading: 'unsupported',
    packReading: 'unsupported',
    evolutionReading: 'unsupported',
    actions: 'disabled',
  },
  lastFailure: null,
  recentFailures: [],
  updatedAt: 0,
};

describe('ui components', () => {
  it('renders capability states', () => {
    render(<HealthPanel health={health} />);
    expect(screen.getByTestId('cap-actions').textContent).toBe('disabled');
    expect(screen.getByTestId('cap-clubReading').textContent).toBe('degraded');
  });

  it('renders a solution with explanations and no apply control', () => {
    const item: ClubItem = {
      id: 'it-1', definitionId: 1, name: 'Synthetic One', rating: 80, rarity: 'RARE', positions: ['ST'],
      nationId: 1, leagueId: 1, clubId: 1, tradeable: false, location: 'CLUB', estimatedPrice: null,
    };
    const result: SolveResult = {
      schemaVersion: 2, status: 'SOLVED', challengeId: 'ch-1', strategy: 'BALANCED',
      inputProvenance: { challenge: 'EA_WEB_LIVE', candidates: 'LOCAL_FIXTURE' },
      selected: [{ itemId: 'it-1', reason: 'SATISFIES_REQUIREMENT', requirementId: 'req-2', cost: 1 }],
      squadRating: 80, totalCost: 1, additionalCoinsRequired: 0,
      evaluations: [{ requirementId: 'req-2', type: 'MIN_COUNT', satisfied: true, detail: '1 matching >= 1' }],
      unsupportedRequirementIds: [],
      debug: { solverId: 'x', solverVersion: '0', candidatesConsidered: 1, excluded: { PROTECTED: 0, NOT_ELIGIBLE_LOCATION: 0, VIOLATES_PLAYER_RATING_RANGE: 0, VIOLATES_PLAYER_QUALITY: 0, LOCKED_ITEM_MISSING: 0 }, upgradeIterations: 0, durationMs: 0, notes: [] },
    };
    render(<SolutionView result={result} items={new Map([[item.id, item]])} />);
    expect(screen.getByTestId('solve-status').textContent).toBe('SOLVED');
    expect(screen.getAllByTestId('solution-row')[0]?.textContent).toContain('Synthetic One');
    expect(screen.queryByRole('button')).toBeNull();
    // Mixed provenance must be flagged as a demo.
    expect(screen.getByTestId('non-live-banner')).toBeTruthy();
  });

  it('assistant button calls back on click', () => {
    const onClick = vi.fn();
    render(<AssistantButton onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
