import { CONTRACTS_VERSION } from '@fc/contracts';
import type { EaContextKind, EaContextSnapshot } from '@fc/contracts';
import { SIGNAL_WEIGHTS, type EaAdapterProfile } from '../profiles/types.js';

export interface RuleScore {
  kind: EaContextKind;
  score: number;
  structural: boolean;
  signals: string[];
}

/** Scores every rule of the profile. Pure DOM queries; never reads text. */
export function scoreContextRules(doc: Document, url: string, profile: EaAdapterProfile): RuleScore[] {
  const routeTarget = routeOf(url);
  return profile.contextRules.map((rule) => {
    const signals: string[] = [];
    let score = 0;
    let structural = false;
    const tag = rule.kind.toLowerCase();
    if (rule.view && doc.querySelector(rule.view) && (!rule.requires || doc.querySelector(rule.requires))) {
      score += SIGNAL_WEIGHTS.view;
      structural = true;
      signals.push(`view:${tag}`);
    }
    if (rule.activeNav && doc.querySelector(rule.activeNav)) {
      score += SIGNAL_WEIGHTS.activeNav;
      signals.push(`nav:${tag}`);
    }
    if (rule.route && rule.route.test(routeTarget)) {
      score += SIGNAL_WEIGHTS.route;
      signals.push(`route:${tag}`);
    }
    return { kind: rule.kind, score, structural, signals };
  });
}

function routeOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.hash}`;
  } catch {
    return '';
  }
}

/**
 * Detect the current app context from multiple signals. Structure (a mounted
 * view) is required for `high` confidence; navigation/route-only matches are
 * `low`. Ties keep profile rule order (more specific contexts first).
 */
export function detectContext(doc: Document, url: string, profile: EaAdapterProfile | null, now: number): EaContextSnapshot {
  if (!profile) {
    return { schemaVersion: CONTRACTS_VERSION, kind: 'UNKNOWN', confidence: 'none', signals: ['profile:none'], profileId: 'none', observedAt: now };
  }
  let best: RuleScore | null = null;
  for (const score of scoreContextRules(doc, url, profile)) {
    if (score.score > 0 && (!best || score.score > best.score)) best = score;
  }
  if (!best) {
    return {
      schemaVersion: CONTRACTS_VERSION,
      kind: 'UNKNOWN',
      confidence: 'none',
      signals: [`profile:${profile.id}`, 'view:none'],
      profileId: profile.id,
      observedAt: now,
    };
  }
  return {
    schemaVersion: CONTRACTS_VERSION,
    kind: best.kind,
    confidence: best.structural ? 'high' : 'low',
    signals: [`profile:${profile.id}`, ...best.signals],
    profileId: profile.id,
    observedAt: now,
  };
}
