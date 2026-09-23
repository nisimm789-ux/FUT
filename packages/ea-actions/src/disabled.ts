import type { ActionOutcome, ActionPolicy, EaActionAdapter } from './types.js';

/** Phase 0 policy: every write action is denied, unconditionally. */
export const disabledActionPolicy: ActionPolicy = {
  decide: () => ({ allowed: false, reason: 'Write actions are disabled in Phase 0' }),
};

const denied = (): Promise<ActionOutcome> =>
  Promise.resolve({ ok: false, code: 'ACTIONS_DISABLED', message: 'Write actions are disabled in Phase 0' });

/** Stub adapter: has the shape of the future write path but performs nothing. */
export const disabledActionAdapter: EaActionAdapter = {
  adapterId: 'disabled',
  applySquad: denied,
  submitSbc: denied,
  moveItem: denied,
};
