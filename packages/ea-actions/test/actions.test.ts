import { describe, expect, it } from 'vitest';
import { disabledActionAdapter, disabledActionPolicy, type ActionKind } from '../src/index.js';

describe('Phase 0 action path', () => {
  const kinds: ActionKind[] = ['applySquad', 'submitSbc', 'moveItem'];

  it.each(kinds)('policy denies %s', (kind) => {
    expect(disabledActionPolicy.decide(kind).allowed).toBe(false);
  });

  it.each(kinds)('adapter refuses %s', async (kind) => {
    const outcome = await disabledActionAdapter[kind]({
      kind,
      recommendation: { challengeId: 'ch-1', selected: [] },
      userInitiated: true,
    });
    expect(outcome).toMatchObject({ ok: false, code: 'ACTIONS_DISABLED' });
  });
});
