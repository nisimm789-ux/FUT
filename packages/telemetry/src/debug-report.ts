import type { AdapterHealth, EaContextSnapshot } from '@fc/contracts';
import type { TelemetryEnvelope } from './events.js';

export interface DebugReportInput {
  extensionVersion: string;
  adapterVersion: string;
  context: EaContextSnapshot | null;
  health: AdapterHealth | null;
  /** Aggregates only (counts), never items. */
  clubItemCount: number | null;
  sbcRequirementTypes: readonly string[];
  recentEvents: readonly TelemetryEnvelope[];
  generatedAt: number;
}

export interface DebugReport {
  reportVersion: 1;
  generatedAt: string;
  extensionVersion: string;
  adapterVersion: string;
  context: Pick<EaContextSnapshot, 'kind' | 'confidence' | 'signals' | 'profileId'> | null;
  health: AdapterHealth | null;
  clubItemCount: number | null;
  sbcRequirementTypes: string[];
  recentEvents: TelemetryEnvelope[];
  privacy: string;
}

/**
 * Builds a support report the USER chooses to export. It contains versions,
 * detection signals, capability health and failure categories — never club
 * contents, item ids, page HTML, cookies or credentials.
 */
export function buildDebugReport(input: DebugReportInput): DebugReport {
  return {
    reportVersion: 1,
    generatedAt: new Date(input.generatedAt).toISOString(),
    extensionVersion: input.extensionVersion,
    adapterVersion: input.adapterVersion,
    context: input.context
      ? { kind: input.context.kind, confidence: input.context.confidence, signals: [...input.context.signals], profileId: input.context.profileId }
      : null,
    health: input.health,
    clubItemCount: input.clubItemCount,
    sbcRequirementTypes: [...new Set(input.sbcRequirementTypes)].sort(),
    recentEvents: input.recentEvents.slice(-50),
    privacy: 'No club contents, item identifiers, page HTML, cookies, tokens or credentials are included.',
  };
}
