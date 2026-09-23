import type { Provenance } from '@fc/contracts';
import type { EaAdapterProfile } from './profiles/types.js';

/** The only origins whose data may ever be labelled EA_WEB_LIVE. */
export const LIVE_EA_ORIGINS: readonly string[] = ['https://www.ea.com'];

/**
 * Live provenance needs BOTH a live profile AND the real EA origin, so a
 * fixture page that mimics EA structure (e.g. on localhost) can never be
 * presented as live EA data.
 */
export function resolveProvenance(url: string, profile: EaAdapterProfile | null): Provenance {
  if (!profile?.live) return 'LOCAL_FIXTURE';
  try {
    return LIVE_EA_ORIGINS.includes(new URL(url).origin) ? 'EA_WEB_LIVE' : 'LOCAL_FIXTURE';
  } catch {
    return 'LOCAL_FIXTURE';
  }
}
