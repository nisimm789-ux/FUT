import type { Telemetry, TelemetryEnvelope, TelemetryEvent, TelemetrySink } from './events.js';

export interface TelemetryOptions {
  extensionVersion: string;
  adapterVersion: string;
  now: () => number;
  /** Phase 0: no network sink exists. Sinks are local (memory/console). */
  sinks?: readonly TelemetrySink[];
  /** Size of the local ring buffer kept for debug reports. */
  bufferSize?: number;
}

export function createTelemetry(options: TelemetryOptions): Telemetry {
  const buffer: TelemetryEnvelope[] = [];
  const size = options.bufferSize ?? 100;
  return {
    track(event: TelemetryEvent) {
      const envelope: TelemetryEnvelope = {
        event: sanitizeEvent(event),
        extensionVersion: options.extensionVersion,
        adapterVersion: options.adapterVersion,
        at: options.now(),
      };
      buffer.push(envelope);
      if (buffer.length > size) buffer.shift();
      for (const sink of options.sinks ?? []) {
        try {
          sink.record(envelope);
        } catch {
          // Telemetry must never break the product.
        }
      }
    },
    recent: () => [...buffer],
  };
}

/** Rebuilds the event from known fields only, dropping anything extra. */
export function sanitizeEvent(event: TelemetryEvent): TelemetryEvent {
  switch (event.type) {
    case 'context_detected':
      return { type: event.type, context: event.context, confidence: event.confidence };
    case 'capability_health':
      return { type: event.type, capabilities: { ...event.capabilities }, safeMode: event.safeMode };
    case 'parser_failure':
      return { type: event.type, capability: event.capability, category: event.category };
    case 'timing':
      return { type: event.type, name: event.name, ms: Math.round(Math.max(0, event.ms) * 10) / 10 };
  }
}

export const noopTelemetry: Telemetry = { track: () => undefined, recent: () => [] };
