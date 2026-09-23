import { CONTRACTS_VERSION } from '@fc/contracts';
import type { EaContextSnapshot } from '@fc/contracts';
import type { SelectorProfile } from '../profiles/types.js';

/**
 * Detect the current app context. Structure (a mounted view element) wins;
 * URL hints are a low-confidence fallback because the Web App is an SPA whose
 * URL does not reliably reflect the visible view.
 */
export function detectContext(doc: Document, url: string, profile: SelectorProfile | null, now: number): EaContextSnapshot {
  if (!profile) {
    return { schemaVersion: CONTRACTS_VERSION, kind: 'UNKNOWN', confidence: 'none', signals: ['profile:none'], profileId: 'none', observedAt: now };
  }
  for (const [kind, selector] of profile.contextViews) {
    if (doc.querySelector(selector)) {
      return {
        schemaVersion: CONTRACTS_VERSION,
        kind,
        confidence: 'high',
        signals: [`profile:${profile.id}`, `view:${kind.toLowerCase()}`],
        profileId: profile.id,
        observedAt: now,
      };
    }
  }
  for (const [kind, pattern] of profile.urlHints) {
    if (pattern.test(url)) {
      return {
        schemaVersion: CONTRACTS_VERSION,
        kind,
        confidence: 'low',
        signals: [`profile:${profile.id}`, `url:${kind.toLowerCase()}`],
        profileId: profile.id,
        observedAt: now,
      };
    }
  }
  return {
    schemaVersion: CONTRACTS_VERSION,
    kind: 'UNKNOWN',
    confidence: 'none',
    signals: [`profile:${profile.id}`, 'view:none'],
    profileId: profile.id,
    observedAt: now,
  };
}
