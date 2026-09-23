import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { SolveProblemSchema, validateContract } from '@fc/contracts';
import { LocalSolverRuntime, type SolverRuntime } from '@fc/solver';
import { createStaticRemoteConfigRepository, type RemoteConfigRepository } from './modules/remote-config.js';

export interface AppDeps {
  remoteConfig?: RemoteConfigRepository;
  /** The server solver runtime (ServerSolverRuntime on the client side calls this). */
  solver?: SolverRuntime;
  logger?: boolean | { level: string };
}

const MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Modular monolith: each module (health, remote-config, solve; later auth,
 * billing, catalog, prices) registers routes on one Fastify instance and
 * talks to others through TypeScript interfaces, not HTTP.
 *
 * Security: no endpoint accepts EA credentials, cookies or tokens. Requests
 * carrying an EA-looking auth header are rejected outright.
 */
export function buildApp(deps: AppDeps = {}): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: MAX_BODY_BYTES,
    // Never log request bodies/headers that could include user data.
    logController: new LogController({ disableRequestLogging: true }),
  });
  const remoteConfig = deps.remoteConfig ?? createStaticRemoteConfigRepository();
  const solver = deps.solver ?? new LocalSolverRuntime();

  app.addHook('onRequest', async (request, reply) => {
    const forbidden = ['x-ut-sid', 'x-ut-phishing-token', 'easw-session-data-nucleus-id'];
    if (forbidden.some((h) => h in request.headers)) {
      await reply.code(400).send({ error: 'EA_CREDENTIALS_NOT_ACCEPTED' });
    }
  });

  app.get('/health', () => ({ status: 'ok', service: 'fc-assistant-api', version: '0.1.0' }));

  app.get('/v1/config', async () => remoteConfig.current());

  app.post('/v1/solve', async (request, reply) => {
    const parsed = validateContract(SolveProblemSchema, request.body);
    if (!parsed.ok) return reply.code(400).send({ error: 'INVALID_PROBLEM', issues: parsed.issues });
    return solver.solve(parsed.value);
  });

  return app;
}
