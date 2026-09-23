import type { EaContextSnapshot } from '@fc/contracts';

export function ContextCard({ context }: { context: EaContextSnapshot | null }) {
  return (
    <section className="fca-card" aria-label="Detected context">
      <h2>EA context</h2>
      {context ? (
        <dl className="fca-kv">
          <dt>Context</dt>
          <dd data-testid="context-kind">{context.kind}</dd>
          <dt>Confidence</dt>
          <dd>{context.confidence}</dd>
          <dt>Profile</dt>
          <dd>{context.profileId}</dd>
          <dt>Signals</dt>
          <dd>{context.signals.join(', ')}</dd>
        </dl>
      ) : (
        <p className="fca-muted">No EA Web App tab detected. Open the FC Web App (or the local fixture) in the active tab.</p>
      )}
    </section>
  );
}
