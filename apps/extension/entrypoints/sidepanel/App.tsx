import { useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import { SolverStrategySchema, type ClubItem, type InspectionReport, type SolveResult, type SolverStrategy } from '@fc/contracts';
import { createEventBus, requirementSupport, type DomainEvents } from '@fc/domain';
import { ADAPTER_VERSION } from '@fc/ea-adapter';
import { LocalSolverRuntime } from '@fc/solver';
import { buildDebugReport } from '@fc/telemetry';
import { ContextCard, HealthPanel, InspectionSummary, PerfPanel, ProvenanceBadge, SbcChallengeCard, SolutionView } from '@fc/ui';
import { InspectResponseSchema, type PanelToContent, type TabState } from '@/src/messaging/messages';
import { buildDemoProblem, type DemoMode } from '@/src/sidepanel/solve-demo';
import { useActiveTabState } from '@/src/sidepanel/useTabState';
import { createChromeKeyValueStore } from '@/src/storage/chrome-store';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type Preferences } from '@/src/storage/preferences';

const solver = new LocalSolverRuntime();
const prefsStore = createChromeKeyValueStore(browser.storage.sync);

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function SourceBanner({ state }: { state: TabState | null }) {
  const provenance = state?.sbc?.snapshot.provenance ?? null;
  if (!state || state.context.profileId === 'none') return <p className="fca-muted">No EA Web App detected in this tab.</p>;
  if (provenance === 'EA_WEB_LIVE') return <p className="fca-live-banner" data-testid="source-banner">● LIVE EA</p>;
  return (
    <p className="fca-demo-banner" data-testid="source-banner">
      {state.context.profileId.startsWith('fc27') && !provenance ? 'EA Web App detected · no SBC read yet' : 'FIXTURE / DEMO — not live EA data'}
    </p>
  );
}

export function App() {
  const { tabId, state, updateLatencyMs } = useActiveTabState();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [solve, setSolve] = useState<{ result: SolveResult; items: Map<string, ClubItem> } | null>(null);
  const [inspection, setInspection] = useState<{ report: InspectionReport } | { error: string } | null>(null);
  const bus = useMemo(() => createEventBus<DomainEvents>(), []);

  useEffect(() => {
    void loadPreferences(prefsStore).then(setPrefs);
  }, []);

  // SolveRequested -> solver runtime -> SolveCompleted. Solving only ever runs on an explicit click.
  useEffect(
    () =>
      bus.subscribe('SolveRequested', ({ requestId, problem }) => {
        void solver.solve(problem).then((result) => bus.publish('SolveCompleted', { requestId, result }));
      }),
    [bus],
  );

  const sbcSlot = state?.sbc ?? null;
  const unverifiable = useMemo(
    () => new Set((sbcSlot?.snapshot.requirements ?? []).filter((r) => !requirementSupport(r).supported).map((r) => r.id)),
    [sbcSlot],
  );

  const runSolve = (mode: DemoMode) => {
    const problem = buildDemoProblem({
      mode,
      sbc: sbcSlot?.snapshot ?? null,
      club: state?.club?.freshness === 'current' ? state.club.snapshot : null,
      strategy: prefs.strategy,
    });
    const requestId = crypto.randomUUID();
    const off = bus.subscribe('SolveCompleted', (event) => {
      if (event.requestId !== requestId) return;
      off();
      setSolve({ result: event.result, items: new Map(problem.candidates.map((i) => [i.id, i])) });
    });
    bus.publish('SolveRequested', { requestId, problem });
  };

  const updatePrefs = (next: Preferences) => {
    setPrefs(next);
    void savePreferences(prefsStore, next);
  };

  const sendToPage = (message: PanelToContent) => (tabId === null ? Promise.resolve(undefined) : browser.tabs.sendMessage(tabId, message));

  const inspect = async () => {
    try {
      const parsed = InspectResponseSchema.safeParse(await sendToPage({ type: 'INSPECT' }));
      if (!parsed.success) setInspection({ error: 'No inspection response (is this an EA tab with the dev build?)' });
      else if (!parsed.data.ok) setInspection({ error: `${parsed.data.reason}: ${parsed.data.details.join('; ')}` });
      else setInspection({ report: parsed.data.report });
    } catch {
      setInspection({ error: 'Content script not reachable in this tab.' });
    }
  };

  const exportDebugReport = () =>
    download(
      `fc-assistant-debug-${Date.now()}.json`,
      buildDebugReport({
        extensionVersion: browser.runtime.getManifest().version,
        adapterVersion: ADAPTER_VERSION,
        context: state?.context ?? null,
        health: state?.health ?? null,
        clubItemCount: state?.club?.snapshot.items.length ?? null,
        sbcRequirementTypes: sbcSlot?.snapshot.requirements.map((r) => r.type) ?? [],
        recentEvents: [],
        generatedAt: Date.now(),
      }),
    );

  return (
    <main>
      <h1>
        ⚡ FC Assistant <small>read-only</small>
      </h1>
      <SourceBanner state={state} />
      <ContextCard context={state?.context ?? null} />
      {sbcSlot ? (
        <SbcChallengeCard snapshot={sbcSlot.snapshot} freshness={sbcSlot.freshness} staleReason={sbcSlot.staleReason} unverifiableIds={unverifiable} />
      ) : (
        state?.context.kind === 'SBC_CHALLENGE' && (
          <section className="fca-card">
            <h2>SBC challenge</h2>
            <p className="fca-fail">
              Could not read this challenge{state.lastReadError ? `: ${state.lastReadError.category}` : ''}. Nothing is shown rather than a guess.
            </p>
          </section>
        )
      )}
      {state?.lastReadError && sbcSlot && (
        <p className="fca-muted">
          Last read error: {state.lastReadError.capability} · {state.lastReadError.category}
        </p>
      )}
      <HealthPanel health={state?.health ?? null} />
      {state?.club && (
        <p className="fca-muted">
          Club: {state.club.snapshot.items.length} items · <ProvenanceBadge provenance={state.club.snapshot.provenance} /> · {state.club.freshness}
        </p>
      )}

      <section className="fca-card" aria-label="Solver demo">
        <h2>Solver preview</h2>
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
          {sbcSlot && (
            <button type="button" onClick={() => runSolve('observed-sbc')}>
              Check this SBC{state?.club?.freshness === 'current' ? '' : ' (demo club)'}
            </button>
          )}
          <button type="button" onClick={() => runSolve('bundled')}>
            Run bundled demo
          </button>
        </div>
        <p className="fca-muted">Runs only when you click. Nothing is ever submitted to EA. Unverifiable requirements yield UNSUPPORTED.</p>
      </section>
      {solve && <SolutionView result={solve.result} items={solve.items} />}

      {import.meta.env.DEV && (
        <section className="fca-card" aria-label="Developer">
          <h2>Developer</h2>
          <div className="row">
            <button type="button" onClick={() => void sendToPage({ type: 'REFRESH' }).catch(() => undefined)}>
              Re-read page
            </button>
            <button type="button" onClick={() => void inspect()}>
              Inspect Current EA Screen
            </button>
            {inspection && 'report' in inspection && (
              <button type="button" onClick={() => download(`fc-assistant-inspection-${inspection.report.context.kind.toLowerCase()}-${Date.now()}.json`, inspection.report)}>
                Export Sanitized Inspection Report
              </button>
            )}
            <button type="button" onClick={exportDebugReport}>
              Export debug report
            </button>
          </div>
          {inspection && ('report' in inspection ? <InspectionSummary report={inspection.report} /> : <p className="fca-fail">{inspection.error}</p>)}
          {state && <PerfPanel perf={state.perf} panelUpdateMs={updateLatencyMs} />}
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
