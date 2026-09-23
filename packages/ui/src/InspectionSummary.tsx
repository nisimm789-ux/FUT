import type { InspectionReport } from '@fc/contracts';

/** Development-only summary of a sanitized inspection report. */
export function InspectionSummary({ report }: { report: InspectionReport }) {
  const diag = report.readerDiagnostics.sbc;
  return (
    <div data-testid="inspection">
      <dl className="fca-kv">
        <dt>Context</dt>
        <dd>
          {report.context.kind} ({report.context.confidence}) · {report.context.signals.join(', ')}
        </dd>
        <dt>Profile</dt>
        <dd>
          {report.meta.profileId} {report.meta.profileVerified ? '' : '(unverified)'}
        </dd>
        <dt>Location</dt>
        <dd>
          {report.location.origin}
          {report.location.path}
          {report.location.route ? `#${report.location.route}` : ''}
        </dd>
        <dt>EA views</dt>
        <dd>{report.views.map((v) => `${v.className}×${v.count}`).join(', ') || '—'}</dd>
        <dt>SBC root</dt>
        <dd>
          {report.sbc.rootFound ? 'found' : 'not found'}
          {report.sbc.slots ? ` · slots ${report.sbc.slots.total} (filled ${report.sbc.slots.filled}, locked ${report.sbc.slots.locked})` : ''}
        </dd>
        <dt>Candidates</dt>
        <dd>{report.candidates.length} requirement-like list(s)</dd>
        <dt>Reader</dt>
        <dd>
          {diag ? (diag.ok ? `ok · ${diag.requirementTypes.length} requirements · ${diag.unknownCount} unknown` : `failed · ${diag.category}: ${diag.message}`) : 'no SBC reader for this profile'}
        </dd>
        {report.validationFailures.length > 0 && (
          <>
            <dt>Failures</dt>
            <dd>{report.validationFailures.map((f) => `${f.capability}:${f.category}`).join(', ')}</dd>
          </>
        )}
      </dl>
      {report.sbc.requirementRows.length > 0 && (
        <table className="fca-table">
          <tbody>
            {report.sbc.requirementRows.map((row) => (
              <tr key={row.index}>
                <td>{row.text ?? '—'}</td>
                <td>{row.interpretedAs}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
