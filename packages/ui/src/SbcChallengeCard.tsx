import type { Provenance, SbcChallengeSnapshot } from '@fc/contracts';
import { FreshnessBadge, ProvenanceBadge } from './Badges.js';
import { requirementLabel } from './labels.js';

export interface SbcChallengeCardProps {
  snapshot: SbcChallengeSnapshot;
  freshness: 'current' | 'stale';
  staleReason: string | null;
  /** Requirement ids the solver cannot verify (computed by the caller). */
  unverifiableIds: ReadonlySet<string>;
}

/** Read-only view of a normalized challenge; fixture data is visibly distinct from live data. */
export function SbcChallengeCard({ snapshot, freshness, staleReason, unverifiableIds }: SbcChallengeCardProps) {
  const live = snapshot.provenance === 'EA_WEB_LIVE';
  return (
    <section className={`fca-card ${live ? 'fca-live' : 'fca-demo'}`} aria-label="SBC challenge">
      <h2>
        SBC challenge <ProvenanceBadge provenance={snapshot.provenance} /> <FreshnessBadge freshness={freshness} reason={staleReason} />
      </h2>
      <dl className="fca-kv">
        <dt>Challenge</dt>
        <dd data-testid="challenge-name">{snapshot.name ?? '(name not available)'}</dd>
        <dt>Players</dt>
        <dd data-testid="squad-size">
          {snapshot.squadSize}
          {snapshot.filledSlots !== null ? ` (${snapshot.filledSlots} placed)` : ' (placement unknown)'}
        </dd>
        <dt>Identity</dt>
        <dd>
          {snapshot.challengeIdKind === 'LOCAL_FINGERPRINT' ? 'local fingerprint' : snapshot.challengeIdKind.toLowerCase()} · {snapshot.challengeId}
        </dd>
        {snapshot.interpretationLocale && (
          <>
            <dt>Text locale</dt>
            <dd>{snapshot.interpretationLocale}</dd>
          </>
        )}
      </dl>
      <ul className="fca-reqs" data-testid="requirements">
        {snapshot.requirements.map((r) => (
          <li key={r.id} className={r.type === 'UNKNOWN' ? 'fca-fail' : undefined}>
            {requirementLabel(r)}
            {unverifiableIds.has(r.id) && r.type !== 'UNKNOWN' && <span className="fca-muted"> · not verifiable yet</span>}
          </li>
        ))}
      </ul>
      {!live && <p className="fca-muted">Not live EA data ({labelFor(snapshot.provenance)}).</p>}
    </section>
  );
}

function labelFor(p: Provenance): string {
  return p === 'LOCAL_FIXTURE' ? 'synthetic fixture' : p.toLowerCase().replace('_', ' ');
}
