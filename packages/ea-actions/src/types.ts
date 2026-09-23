import type { SolveResult } from '@fc/contracts';

export type ActionKind = 'applySquad' | 'submitSbc' | 'moveItem';

export interface ActionRequest {
  kind: ActionKind;
  /** Every action must trace back to a recommendation the user saw. */
  recommendation: Pick<SolveResult, 'challengeId' | 'selected'>;
  /** Actions are only ever user-triggered; the UI records the gesture. */
  userInitiated: true;
}

export type ActionOutcome =
  | { ok: true }
  | { ok: false; code: 'ACTIONS_DISABLED' | 'POLICY_DENIED' | 'NOT_IMPLEMENTED' | 'PRECONDITION_FAILED'; message: string };

/**
 * Future write adapter. It is a separate package from @fc/ea-adapter so READ
 * code can never reach write capabilities by import. Implementations must
 * consult an ActionPolicy before every call.
 */
export interface EaActionAdapter {
  readonly adapterId: string;
  applySquad(request: ActionRequest): Promise<ActionOutcome>;
  submitSbc(request: ActionRequest): Promise<ActionOutcome>;
  moveItem(request: ActionRequest): Promise<ActionOutcome>;
}

export interface ActionDecision {
  allowed: boolean;
  reason: string;
}

/** Feature-flag / safety gate for write actions, independently switchable per action. */
export interface ActionPolicy {
  decide(kind: ActionKind): ActionDecision;
}
