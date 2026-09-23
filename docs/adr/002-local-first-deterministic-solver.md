# ADR-002: Local-first, deterministic solver

- Status: Accepted
- Date: 2026-09-23

## Context
SBC solving needs the user's club, which is private and potentially large.
Users must trust recommendations and understand them. We also want the option
to move heavier optimisation to a server or WASM later.

## Decision
- `packages/solver` is **pure TypeScript** with no dependency on React, Chrome,
  EA DOM, Fastify or a database (enforced by lint + the architecture test).
- It exposes `SolverRuntime.solve(problem) → Promise<SolveResult>`.
  `LocalSolverRuntime` runs in the extension. The API's `/v1/solve` runs the
  same code, which is the basis for a `ServerSolverRuntime`.
- Results are **deterministic**: no randomness, ties break by item id, and the
  clock is used for timing only. The same input always gives the same output,
  whatever the input order.
- Results are **explainable**: a per-pick reason, requirement, cost, a
  per-requirement evaluation, and debug counters.
- The solver **fails closed**: an unsupported requirement gives `UNSUPPORTED`,
  and invalid input gives `INVALID_PROBLEM`.

## Consequences
- + Club data stays on-device by default. Solving works offline and costs no server time.
- + Deterministic output makes regression tests, property tests and support reproducible.
- + Strategy, protected/locked ids and a coin budget are already in the contract, so a real optimiser can replace the Phase 0 greedy without breaking callers.
- − Heavy optimisation may be too slow in the browser. Mitigation: the runtime interface allows Server/WASM runtimes.
