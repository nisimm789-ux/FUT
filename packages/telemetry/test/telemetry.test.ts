import { describe, expect, it, vi } from 'vitest';
import { buildDebugReport, createTelemetry, type TelemetryEvent } from '../src/index.js';

describe('telemetry', () => {
  it('drops unknown fields smuggled into events', () => {
    const sink = { record: vi.fn() };
    const telemetry = createTelemetry({ extensionVersion: '0.1.0', adapterVersion: '0.1.0', now: () => 1, sinks: [sink] });
    const smuggled = { type: 'parser_failure', capability: 'clubReading', category: 'FIELD_MISSING', html: '<div>secret</div>' } as TelemetryEvent;
    telemetry.track(smuggled);
    expect(sink.record.mock.calls[0]?.[0].event).toEqual({ type: 'parser_failure', capability: 'clubReading', category: 'FIELD_MISSING' });
  });

  it('keeps a bounded ring buffer and survives throwing sinks', () => {
    const telemetry = createTelemetry({
      extensionVersion: '0.1.0',
      adapterVersion: '0.1.0',
      now: () => 1,
      bufferSize: 2,
      sinks: [{ record: () => { throw new Error('x'); } }],
    });
    for (let i = 0; i < 5; i += 1) telemetry.track({ type: 'timing', name: 'solve', ms: i });
    expect(telemetry.recent()).toHaveLength(2);
  });

  it('builds a debug report without item data', () => {
    const report = buildDebugReport({
      extensionVersion: '0.1.0',
      adapterVersion: '0.1.0',
      context: { schemaVersion: 1, kind: 'CLUB', confidence: 'high', signals: ['view:club'], profileId: 'p', observedAt: 0 },
      health: null,
      clubItemCount: 42,
      sbcRequirementTypes: ['MIN_COUNT', 'MIN_COUNT', 'MAX_SAME'],
      recentEvents: [],
      generatedAt: 0,
    });
    expect(report.sbcRequirementTypes).toEqual(['MAX_SAME', 'MIN_COUNT']);
    expect(JSON.stringify(report)).not.toMatch(/it-\d{4}/);
  });
});
