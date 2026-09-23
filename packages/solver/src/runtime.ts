import type { SolveProblem, SolveResult } from '@fc/contracts';

/**
 * Where a solve runs is an implementation detail. Planned runtimes:
 * - LocalSolverRuntime  (in-extension, Phase 0)
 * - ServerSolverRuntime (POST /v1/solve on our API, Phase 1+)
 * - WasmSolverRuntime   (heavier optimisation compiled to WASM, later)
 * All must return a SolveResult that validates against the contract.
 */
export interface SolverRuntime {
  readonly runtimeId: string;
  solve(problem: SolveProblem): Promise<SolveResult>;
}
