import type { AdapterHealth, CapabilityName } from '@fc/contracts';

export function HealthPanel({ health }: { health: AdapterHealth | null }) {
  return (
    <section className="fca-card" aria-label="Adapter health">
      <h2>Adapter health</h2>
      {health ? (
        <>
          <dl className="fca-kv">
            <dt>Adapter</dt>
            <dd>v{health.adapterVersion} · {health.profileId}</dd>
            <dt>Safe mode</dt>
            <dd>{health.safeMode ? 'ON — read capabilities disabled' : 'off'}</dd>
            {health.lastFailure && (
              <>
                <dt>Last failure</dt>
                <dd>{health.lastFailure.capability}: {health.lastFailure.category}</dd>
              </>
            )}
          </dl>
          <table className="fca-table" style={{ marginTop: 8 }}>
            <tbody>
              {(Object.keys(health.capabilities) as CapabilityName[]).map((cap) => (
                <tr key={cap}>
                  <td>{cap}</td>
                  <td>
                    <span className={`fca-pill fca-state-${health.capabilities[cap]}`} data-testid={`cap-${cap}`}>
                      {health.capabilities[cap]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="fca-muted">No health report yet.</p>
      )}
    </section>
  );
}
