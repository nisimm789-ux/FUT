import type { ClubItem, SolveResult } from '@fc/contracts';

export interface SolutionViewProps {
  result: SolveResult;
  items: ReadonlyMap<string, ClubItem>;
}

/** Read-only preview of a proposed squad. There is intentionally no "apply" control. */
export function SolutionView({ result, items }: SolutionViewProps) {
  return (
    <section className="fca-card" aria-label="Solver result">
      <h2>Solution preview</h2>
      <dl className="fca-kv">
        <dt>Status</dt>
        <dd className={`fca-status-${result.status}`} data-testid="solve-status">{result.status}</dd>
        <dt>Strategy</dt>
        <dd>{result.strategy}</dd>
        <dt>Squad rating</dt>
        <dd>{result.squadRating ?? '—'}</dd>
        <dt>Extra coins</dt>
        <dd>{result.additionalCoinsRequired}</dd>
      </dl>
      {result.selected.length > 0 && (
        <table className="fca-table" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>OVR</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {result.selected.map((s) => {
              const item = items.get(s.itemId);
              return (
                <tr key={s.itemId} data-testid="solution-row">
                  <td>{item?.name ?? s.itemId}</td>
                  <td>{item?.rating ?? '?'}</td>
                  <td>
                    {s.reason}
                    {s.requirementId ? ` (${s.requirementId})` : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12 }}>
        {result.evaluations.map((e) => (
          <li key={e.requirementId} className={e.satisfied ? 'fca-ok' : 'fca-fail'}>
            {e.satisfied ? '✓' : '✗'} {e.type}: {e.detail}
          </li>
        ))}
      </ul>
      {result.unsupportedRequirementIds.length > 0 && (
        <p className="fca-muted">Unsupported requirements: {result.unsupportedRequirementIds.join(', ')}</p>
      )}
    </section>
  );
}
