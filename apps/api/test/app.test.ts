import { afterAll, describe, expect, it } from 'vitest';
import { RemoteConfigSchema, SolveResultSchema } from '@fc/contracts';
import { loadClubFixture, loadSbcFixture } from '@fc/ea-fixtures';
import { buildApp } from '../src/app.js';

const app = buildApp();
afterAll(() => app.close());

describe('api', () => {
  it('reports health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('serves data-only remote config', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/config' });
    const config = RemoteConfigSchema.parse(res.json());
    expect(config.actionsEnabled).toBe(false);
  });

  it('solves a valid problem server-side with the same deterministic solver', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/solve',
      payload: {
        schemaVersion: 2,
        challenge: loadSbcFixture(),
        candidates: loadClubFixture().items,
        candidatesProvenance: 'LOCAL_FIXTURE',
        options: { strategy: 'BALANCED', protectedItemIds: [], lockedItemIds: [], maxAdditionalCoins: 0 },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(SolveResultSchema.parse(res.json()).status).toBe('SOLVED');
  });

  it('rejects invalid problems', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/solve', payload: { nope: true } });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'INVALID_PROBLEM' });
  });

  it('refuses requests that carry EA session headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-ut-sid': 'abc' } });
    expect(res.statusCode).toBe(400);
  });
});
