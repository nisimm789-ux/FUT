import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { SolverStrategySchema, type ClubItem, type SolveResult, type SolverStrategy } from '@fc/contracts';
import { createEventBus, type DomainEvents } from '@fc/domain';
import { ADAPTER_VERSION } from '@fc/ea-adapter';
import { LocalSolverRuntime } from '@fc/solver';
import { buildDebugReport } from '@fc/telemetry';
import { ContextCard, HealthPanel, SnapshotSummary, SolutionView } from '@fc/ui';
import type { PanelToContent } from '@/src/messaging/messages';
import { buildDemoProblem, type ProblemSource } from '@/src/sidepanel/solve-demo';
import { useActiveTabState } from '@/src/sidepanel/useTabState';
import { createChromeKeyValueStore } from '@/src/storage/chrome-store';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type Preferences } from '@/src/storage/preferences';

const solver = new LocalSolverRuntime();
const prefsStore = createChromeKeyValueStore(browser.storage.sync);

export function App() {
  const { tabId, state } = useActiveTabState();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [solve, setSolve] = useState<{ result: SolveResult; source: ProblemSource; items: Map<string, ClubItem> } | null>(null);
  const bus = useMemo(() => createEventBus<DomainEvents>(), []);

  useEffect(() => {
    void loadPreferences(prefsStore).then(setPrefs);
  }, []);

  // SolveRequested -> solver runtime -> SolveCompleted. The UI only publishes/listens.
  useEffect(() => {
    const offRequested = bus.subscribe('SolveRequested', ({ requestId, problem }) => {
      void solver.solve(problem).then((result) => bus.publish('SolveCompleted', { requestId, result }));
    });
    return offRequested;
  }, [bus]);

  const runSolve = () => {
    const { problem, source } = buildDemoProblem({ sbc: state?.sbc ?? null, club: state?.club ?? null, strategy: prefs.strategy });
    const requestId = crypto.randomUUID();
    const off = bus.subscribe('SolveCompleted', (event) => {
      if (event.requestId !== requestId) return;
      off();
      setSolve({ result: event.result, source, items: new Map(problem.candidates.map((i) => [i.id, i])) });
    });
    bus.publish('SolveRequested', { requestId, problem });
  };

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    void savePreferences(prefsStore, next);
  };

  const refresh = () => {
    if (tabId === null) return;
    const message: PanelToContent = { type: 'REFRESH' };
    browser.tabs.sendMessage(tabId, message).catch(() => undefined);
  };

  const exportDebugReport = () => {
    const report = buildDebugReport({
      extensionVersion: browser.runtime.getManifest().version,
      adapterVersion: ADAPTER_VERSION,
      context: state?.context ?? null,
      health: state?.health ?? null,
      clubItemCount: state?.club?.items.length ?? null,
      sbcRequirementTypes: state?.sbc?.requirements.map((r) => r.type) ?? [],
      recentEvents: [],
      generatedAt: Date.now(),
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fc-assistant-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <h1>
        ⚡ FC Assistant <small>Phase 0 · read-only</small>
      </h1>
      <ContextCard context={state?.context ?? null} />
      <HealthPanel health={state?.health ?? null} />
      <SnapshotSummary sbc={state?.sbc ?? null} club={state?.club ?? null} />

      <section className="fca-card" aria-label="Solver demo">
        <h2>Solver demo</h2>
        <div className="row">
          <select
            aria-label="Strategy"
            value={prefs.strategy}
            onChange={(e) => updatePrefs({ ...prefs, strategy: SolverStrategySchema.parse(e.target.value) as SolverStrategy })}
          >
            {SolverStrategySchema.options.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button type="button" onClick={runSolve}>
            Solve (preview only)
          </button>
        </div>
        <p className="fca-muted">
          Uses the SBC and club seen on the page when both are available, otherwise bundled synthetic fixtures. Nothing is submitted to EA.
        </p>
      </section>
      {solve && (
        <>
          <p className="fca-muted">Source: {solve.source}</p>
          <SolutionView result={solve.result} items={solve.items} />
        </>
      )}

      {import.meta.env.DEV && (
        <section className="fca-card" aria-label="Developer">
          <h2>Developer</h2>
          <div className="row">
            <button type="button" onClick={refresh}>Re-read page</button>
            <button type="button" onClick={exportDebugReport}>Export debug report</button>
          </div>
          <details>
            <summary>Tab state (tab {tabId ?? '—'})</summary>
            <pre>{JSON.stringify(state, null, 2)}</pre>
          </details>
          {solve && (
            <details>
              <summary>Solver debug</summary>
              <pre>{JSON.stringify(solve.result.debug, null, 2)}</pre>
            </details>
          )}
        </section>
      )}
    </main>
  );
}
