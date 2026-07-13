import { useDemoEngine } from '../lib/demoEngine';
import type { ColumnId, Order } from '../types';
import { OrderCard } from './OrderCard';

const COLUMNS: { id: ColumnId; code: string; title: string; subtitle: string }[] = [
  { id: 'new', code: '01', title: 'New', subtitle: 'Incoming queue' },
  { id: 'prep', code: '02', title: 'Prep', subtitle: 'On the line' },
  { id: 'ready', code: '03', title: 'Ready', subtitle: 'Handoff window' },
];

function sortByCreatedAt(orders: Order[]): Order[] {
  return [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function WorkflowBoard() {
  const { orders } = useDemoEngine();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden p-6">
      <header className="shrink-0">
        <h1
          className="text-2xl font-extrabold uppercase tracking-tight text-white"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Workflow Board
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Follow the production path from intake to final pickup
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-3 gap-4">
        {COLUMNS.map(({ id, code, title, subtitle }) => {
          const columnOrders = sortByCreatedAt(orders.filter((o) => o.column === id));
          return (
            <section
              key={id}
              className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#1a1a1a]"
            >
              <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-4 py-3">
                <div>
                  <h2
                    className="text-sm font-bold uppercase tracking-widest text-white"
                    style={{ fontFamily: 'Syne, sans-serif' }}
                  >
                    {code} {title}
                  </h2>
                  <p className="text-xs text-white/40">{subtitle}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/60">
                  {columnOrders.length}
                </span>
              </header>

              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
                {columnOrders.length === 0 ? (
                  <p className="mt-4 text-center text-xs text-white/20">No orders</p>
                ) : (
                  columnOrders.map((order) => <OrderCard key={order.id} order={order} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
