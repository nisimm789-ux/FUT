import { describe, expect, it } from 'vitest';
import { loadClubFixture, loadSbcFixture } from '@fc/ea-fixtures';
import { createEaWebAdapter, createEaWebProviders } from '../src/index.js';
import { loadPage } from './helpers.js';

const adapterFor = (options: { forceSafeMode?: boolean } = {}) =>
  createEaWebAdapter({
    document,
    window,
    getUrl: () => location.href,
    now: () => 0,
    remoteConfig: { forceSafeMode: options.forceSafeMode ?? false, disabledCapabilities: [], minAdapterVersion: '0.1.0' },
  });

describe('EA adapter readers against synthetic fixtures (golden files)', () => {
  it('normalizes the SBC challenge page exactly as the golden snapshot', () => {
    loadPage('sbc-challenge');
    const result = adapterFor().readSbcChallenge();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const golden = loadSbcFixture();
    expect({ ...result.value, adapter: null, observedAt: golden.observedAt }).toEqual(golden);
    // Synthetic profile => never live, whatever the page claims.
    expect(result.value.provenance).toBe('LOCAL_FIXTURE');
    expect(result.value.adapter).toEqual({ adapterVersion: '0.2.0', profileId: 'synthetic-v1', profileVerified: true });
  });

  it('normalizes the club page exactly as the golden snapshot', () => {
    loadPage('club');
    const result = adapterFor().readClub();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const golden = loadClubFixture();
    expect({ ...result.value, observedAt: golden.observedAt }).toEqual(golden);
  });

  it('maps unknown requirement kinds to UNKNOWN rather than dropping them', () => {
    loadPage('sbc-challenge-unsupported');
    const result = adapterFor().readSbcChallenge();
    expect(result.ok && result.value.requirements.map((r) => r.type)).toEqual(['MIN_SQUAD_RATING', 'MIN_CHEMISTRY', 'UNKNOWN']);
  });

  it('fails closed on malformed club data and reports degraded health', () => {
    loadPage('club-malformed');
    const adapter = adapterFor();
    const result = adapter.readClub();
    expect(result.ok).toBe(false);
    expect(adapter.health.snapshot().capabilities.clubReading).toBe('degraded');
    expect(adapter.health.snapshot().lastFailure?.category).toMatch(/VALUE_OUT_OF_RANGE|FIELD_MISSING/);
  });

  it('fails with STRUCTURE_NOT_FOUND when reading SBC on a non-SBC view', () => {
    loadPage('store');
    const result = adapterFor().readSbcChallenge();
    expect(result).toMatchObject({ ok: false, category: 'STRUCTURE_NOT_FOUND' });
  });

  it('enters SAFE_MODE after repeated read failures, disabling read capabilities only', () => {
    loadPage('club-malformed');
    const adapter = adapterFor();
    adapter.readClub();
    adapter.readClub();
    adapter.readClub();
    const health = adapter.health.snapshot();
    expect(health.safeMode).toBe(true);
    expect(health.capabilities.clubReading).toBe('disabled');
    expect(health.capabilities.sbcReading).toBe('disabled');
    expect(health.capabilities.contextDetection).not.toBe('disabled');
    loadPage('club');
    expect(adapter.readClub()).toMatchObject({ ok: false, category: 'PROFILE_MISMATCH' });
  });

  it('honours remote forceSafeMode and reports actions as disabled', () => {
    loadPage('club');
    const adapter = adapterFor({ forceSafeMode: true });
    expect(adapter.readClub().ok).toBe(false);
    expect(adapter.health.snapshot().capabilities.actions).toBe('disabled');
  });

  it('reports readers unsupported on a page with no matching profile', () => {
    loadPage('not-ea');
    const adapter = adapterFor();
    expect(adapter.capabilities().supported).toEqual([]);
    expect(adapter.health.snapshot().capabilities.sbcReading).toBe('unsupported');
  });

  it('exposes readers through domain provider ports', async () => {
    loadPage('sbc-challenge');
    const providers = createEaWebProviders(adapterFor());
    const sbc = await providers.sbc.getCurrentChallenge();
    const club = await providers.club.getClubSnapshot();
    expect(sbc.ok).toBe(true);
    expect(club).toMatchObject({ ok: false, error: { code: 'PARSE_FAILED' } });
  });

  it('never leaks DOM nodes in its results', () => {
    loadPage('club');
    const result = adapterFor().readClub();
    const json = JSON.stringify(result);
    expect(JSON.parse(json)).toEqual(result);
  });
});
