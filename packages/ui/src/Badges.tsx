import type { Provenance } from '@fc/contracts';
import { PROVENANCE_LABEL } from './labels.js';

export function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  return (
    <span className={`fca-pill fca-prov-${provenance}`} data-testid="provenance">
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}

export function FreshnessBadge({ freshness, reason }: { freshness: 'current' | 'stale'; reason: string | null }) {
  return (
    <span className={`fca-pill ${freshness === 'current' ? 'fca-state-healthy' : 'fca-state-degraded'}`} data-testid="freshness">
      {freshness === 'current' ? 'CURRENT' : `STALE${reason ? ` · ${reason}` : ''}`}
    </span>
  );
}
