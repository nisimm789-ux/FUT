import type { AdapterPerf } from '@fc/contracts';

export function PerfPanel({ perf, panelUpdateMs }: { perf: AdapterPerf; panelUpdateMs: number | null }) {
  return (
    <details>
      <summary>Performance</summary>
      <table className="fca-table" data-testid="perf">
        <thead>
          <tr>
            <th>timing (ms)</th>
            <th>last</th>
            <th>avg</th>
            <th>max</th>
            <th>n</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(perf.timings).map(([name, s]) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{s.last}</td>
              <td>{s.avg}</td>
              <td>{s.max}</td>
              <td>{s.count}</td>
            </tr>
          ))}
          <tr>
            <td>sidePanelUpdate</td>
            <td colSpan={4}>{panelUpdateMs ?? '—'}</td>
          </tr>
        </tbody>
      </table>
      <p className="fca-muted">{Object.entries(perf.counters).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
    </details>
  );
}
