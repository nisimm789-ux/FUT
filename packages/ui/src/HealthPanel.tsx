import type { AdapterHealth, CapabilityName } from '@fc/contracts';

export function HealthPanel({ health }: { health: AdapterHealth | null }) {
  return (
    <section className="fca-card" aria-label="Adapter health">
      <h2>Adapter health</h2>
      {health ? (
        <>
          <dl className="fca-kv">
            <dt>Adapter</dt>
            <dd>
              v{health.adapterVersion} · {health.profileId}{' '}
              {!health.profileVerified && health.profileId !== 'none' && (
                <span className="fca-pill fca-state-degraded" data-testid="unverified">UNVERIFIED PROFILE</span>
              )}
            </dd>
            {Object.keys(health.profileSignatures).length > 0 && (
              <>
                <dt>Signatures</dt>
                <dd data-testid="signatures">
                  {(['verified', 'unverified', 'disabled'] as const)
                    .map((st) => `${Object.values(health.profileSignatures).filter((v) => v === st).length} ${st}`)
                    .join(' · ')}
                  {Object.entries(health.profileSignatures)
                    .filter(([, v]) => v === 'disabled')
                    .map(([k]) => ` · off: ${k}`)
                    .join('')}
                </dd>
              </>
            )}
            <dt>Safe mode</dt>
            <dd>{health.safeMode ? 'ON — read capabilities disabled' : 'off'}</dd>
            {health.lastFailure && (
              <>
                <dt>Last failure</dt>
                <dd>
                  {health.lastFailure.capability}: {health.lastFailure.category} ({health.recentFailures.length} recent)
                </dd>
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
