# ADR-005: Modular monolith, not microservices

- Status: Accepted
- Date: 2026-09-23

## Context
The team is small and the domain is still being discovered. Most computation
runs client-side. The backend will need auth, billing, remote config, catalog
and price data, and possibly server-side solving.

## Decision
- One pnpm/TypeScript **monorepo**. Packages have explicit boundaries: pure
  domain packages, one adapter package, one actions package, UI, telemetry.
- One backend deployable, `apps/api` (Fastify). Modules (`health`,
  `remote-config`, `solve`, later `auth`, `billing`, `catalog`, `prices`) talk
  through TypeScript interfaces, not HTTP. It is PostgreSQL-ready (a Prisma
  schema can be added behind the repository interfaces), but **Phase 0 needs no
  database**.
- Boundaries are enforced in code (lint + architecture test), not by network hops.

## Consequences
- + One build, one deploy, shared contracts, refactors across boundaries in a single PR.
- + A module can be extracted later if scale demands it, because its interface already exists.
- − Discipline is needed to keep modules from reaching into each other. The architecture test is the guardrail.
