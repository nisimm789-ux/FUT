import type { ClubSnapshot, SbcChallengeSnapshot } from '@fc/contracts';

export function SnapshotSummary({ sbc, club }: { sbc: SbcChallengeSnapshot | null; club: ClubSnapshot | null }) {
  return (
    <section className="fca-card" aria-label="Normalized snapshot">
      <h2>Normalized snapshot</h2>
      <dl className="fca-kv">
        <dt>SBC</dt>
        <dd>{sbc ? `${sbc.name} (${sbc.challengeId}) · ${sbc.squadSize} players · ${sbc.requirements.length} requirements` : '—'}</dd>
        <dt>Club</dt>
        <dd>{club ? `${club.items.length} items · coverage ${club.coverage} · source ${club.source}` : '—'}</dd>
      </dl>
      {sbc && (
        <ul className="fca-muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {sbc.requirements.map((r) => (
            <li key={r.id}>
              <code>{r.type}</code> {describeRequirement(r)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function describeRequirement(r: SbcChallengeSnapshot['requirements'][number]): string {
  switch (r.type) {
    case 'MIN_SQUAD_RATING':
    case 'MIN_CHEMISTRY':
      return `≥ ${r.value}`;
    case 'MIN_COUNT':
      return `≥ ${r.count} × ${JSON.stringify(r.filter)}`;
    case 'MAX_COUNT':
      return `≤ ${r.count} × ${JSON.stringify(r.filter)}`;
    case 'PLAYER_RATING_RANGE':
      return `[${r.min ?? 1}, ${r.max ?? 99}]`;
    case 'MAX_SAME':
      return `≤ ${r.count} per ${r.dimension}`;
    case 'MIN_UNIQUE':
      return `≥ ${r.count} ${r.dimension}s`;
    case 'UNKNOWN':
      return r.reason;
  }
}
