import {
  advanceNewToPrep,
  advancePrepToReady,
  analyzeAndShowFixPath,
  applyPlaybookStep,
  cancelNewOrder,
  closeFixPath,
  insertMockOrder,
  runLogicStep,
  serveReadyOrder,
  toggleAutoplay,
  useDemoEngine,
} from '../lib/demoEngine';
import type { TableCounts } from '../types';

const ACTION_BTN =
  'w-full py-2.5 px-3 text-left text-sm font-medium border border-white/10 rounded-lg ' +
  'bg-transparent text-white/80 transition-colors cursor-pointer ' +
  'hover:border-[#C8FF00] hover:text-[#C8FF00]';

const TABLE_ROWS: { key: keyof TableCounts; label: string }[] = [
  { key: 'orders', label: 'orders' },
  { key: 'order_items', label: 'order_items' },
  { key: 'order_modifiers', label: 'order_modifiers' },
  { key: 'kitchen_stations', label: 'kitchen_stations' },
  { key: 'order_status_history', label: 'order_status_history' },
];

export function ScenarioPanel() {
  const { events, tableCounts, autoplay, incidents, playbooks, focusedIncidentId } = useDemoEngine();

  const openIncidentCount = incidents.filter((i) => i.status === 'open').length;
  const focusedIncident = incidents.find((i) => i.id === focusedIncidentId);
  const focusedSteps = focusedIncidentId ? playbooks[focusedIncidentId] : undefined;

  return (
    <aside className="flex h-full w-full flex-col gap-6 overflow-y-auto border-r border-white/[0.08] bg-[#1a1a1a] p-4">
      {/* Scenario Actions */}
      <section className="flex flex-col gap-3">
        <h2
          className="text-xs font-bold uppercase tracking-widest text-white/40"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Scenario Actions
        </h2>
        <div className="flex flex-col gap-2">
          <button type="button" className={ACTION_BTN} onClick={insertMockOrder}>
            Insert Mock Order
          </button>
          <button type="button" className={ACTION_BTN} onClick={runLogicStep}>
            Run Logic Step
          </button>
          <button type="button" className={ACTION_BTN} onClick={advanceNewToPrep}>
            Advance New → Prep
          </button>
          <button type="button" className={ACTION_BTN} onClick={advancePrepToReady}>
            Advance Prep → Ready
          </button>
          <button type="button" className={ACTION_BTN} onClick={serveReadyOrder}>
            Serve Ready Order
          </button>
          <button type="button" className={ACTION_BTN} onClick={cancelNewOrder}>
            Cancel New Order
          </button>
          <button
            type="button"
            className={`${ACTION_BTN} ${autoplay ? 'border-[#C8FF00] text-[#C8FF00]' : ''}`}
            onClick={toggleAutoplay}
          >
            Toggle Autoplay {autoplay ? 'ON' : 'OFF'}
          </button>
        </div>
      </section>

      {/* Reliability */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2
            className="text-xs font-bold uppercase tracking-widest text-white/40"
            style={{ fontFamily: 'Syne, sans-serif' }}
          >
            Reliability
          </h2>
          {openIncidentCount > 0 && (
            <span className="rounded-full border border-[#C8FF00]/30 bg-[#C8FF00]/10 px-2 py-0.5 text-[10px] font-semibold text-[#C8FF00]">
              {openIncidentCount} open
            </span>
          )}
        </div>
        <button type="button" className={ACTION_BTN} onClick={analyzeAndShowFixPath}>
          Показати шлях виправлення
        </button>

        {focusedIncident && focusedSteps && (
          <div className="flex flex-col gap-3 rounded-lg border border-[#C8FF00]/30 bg-[#0d0d0d] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-xs">
                <p className="font-semibold text-white/80">
                  {focusedIncident.incidentType} · {focusedIncident.errorClass}
                </p>
                <p className="mt-0.5 text-white/40">
                  severity: {focusedIncident.severity} · status: {focusedIncident.status}
                  {focusedIncident.orderId ? ` · order: ${focusedIncident.orderId}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-white/40 hover:text-white"
                onClick={closeFixPath}
              >
                Close
              </button>
            </div>

            <ol className="flex flex-col gap-2">
              {focusedSteps.map((step, index) => (
                <li
                  key={step.id}
                  className="flex flex-col gap-1 rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white/80">
                      {index + 1}. {step.title}
                    </span>
                    <span className={step.status === 'done' ? 'shrink-0 text-[#C8FF00]' : 'shrink-0 text-white/30'}>
                      {step.status === 'done' ? '✓ done' : 'pending'}
                    </span>
                  </div>
                  <p className="text-white/40">{step.description}</p>
                  {step.status === 'pending' && step.action && (
                    <button
                      type="button"
                      className="mt-1 self-start rounded border border-[#C8FF00]/40 px-2 py-1 text-[#C8FF00] transition-colors hover:bg-[#C8FF00]/10"
                      onClick={() => applyPlaybookStep(focusedIncident.id)}
                    >
                      Виконати крок
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Simulated Table Rows */}
      <section className="flex flex-col gap-3">
        <h2
          className="text-xs font-bold uppercase tracking-widest text-white/40"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Simulated Table Rows
        </h2>
        <div className="flex flex-col gap-1 rounded-lg border border-white/[0.08] bg-[#0d0d0d] p-3">
          {TABLE_ROWS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-1 text-xs">
              <span className="font-mono text-white/50">{label}</span>
              <span className="font-mono font-semibold text-[#C8FF00]">{tableCounts[key]}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Order Events */}
      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <h2
          className="text-xs font-bold uppercase tracking-widest text-white/40"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Recent Order Events
        </h2>
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {events.length === 0 && <p className="text-xs text-white/30">No events yet</p>}
          {events.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.08] bg-[#0d0d0d] px-3 py-2 text-xs"
            >
              <span className="text-white/70">{e.text}</span>
              <span className="shrink-0 font-mono text-white/30">{e.time}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}
