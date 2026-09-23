import type { AdapterHealth, CapabilityName, EaContextKind, ParserFailureCategory } from '@fc/contracts';

/**
 * Closed set of telemetry events. Only enums, numbers and versions — there is
 * deliberately no free-form payload field, so raw club contents, page HTML or
 * identifiers cannot be attached by accident.
 */
export type TelemetryEvent =
  | { type: 'context_detected'; context: EaContextKind; confidence: 'high' | 'low' | 'none' }
  | { type: 'capability_health'; capabilities: AdapterHealth['capabilities']; safeMode: boolean }
  | { type: 'parser_failure'; capability: CapabilityName; category: ParserFailureCategory }
  | { type: 'timing'; name: 'solve' | 'read_sbc' | 'read_club' | 'detect_context'; ms: number };

export interface TelemetryEnvelope {
  event: TelemetryEvent;
  extensionVersion: string;
  adapterVersion: string;
  at: number;
}

export interface TelemetrySink {
  record(envelope: TelemetryEnvelope): void;
}

export interface Telemetry {
  track(event: TelemetryEvent): void;
  recent(): readonly TelemetryEnvelope[];
}
