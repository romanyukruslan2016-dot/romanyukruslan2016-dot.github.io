import type { Order } from '../types';
import { useOrderTimer } from '../hooks/useOrderTimer';
import { openPaymentPage } from '../lib/payment/paymentUiStore';

interface OrderCardProps {
  order: Order;
}

export function OrderCard({ order }: OrderCardProps) {
  const minutes = useOrderTimer(order.createdAt);

  const timerClass =
    minutes >= 20
      ? 'border-[#C8FF00] text-[#C8FF00] shadow-[0_0_12px_rgba(200,255,0,0.35)] animate-pulse'
      : minutes >= 10
        ? 'border-[#C8FF00]/50 text-[#C8FF00]'
        : 'border-white/10 text-[#C8FF00]';

  return (
    <article className="rounded-xl border border-white/[0.08] bg-[#0d0d0d] p-3 transition-colors hover:border-[#C8FF00]/50">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Order
          </span>
          <p className="font-mono text-lg font-bold text-white">#{order.orderNumber}</p>
        </div>
        <div className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Table
          </span>
          <p className="font-mono text-lg font-bold text-[#C8FF00]">{order.tableNumber}</p>
        </div>
      </div>

      <div
        className={`mb-3 flex items-center justify-center gap-1 rounded-lg border py-1.5 text-sm font-bold ${timerClass}`}
        aria-label={`Waiting ${minutes} minutes`}
      >
        <span className="font-mono">{minutes}</span>
        <span className="text-xs uppercase tracking-wide">min</span>
      </div>

      <ul className="flex flex-col gap-2">
        {order.dishes.map((dish, i) => (
          <li key={i} className="border-t border-white/[0.08] pt-2 first:border-none first:pt-0">
            <p className="text-sm font-semibold text-white">{dish.name}</p>
            {dish.modifiers.length > 0 && (
              <ul className="mt-1 flex flex-wrap gap-1">
                {dish.modifiers.map((mod) => (
                  <li
                    key={mod}
                    className="rounded-full border border-[#C8FF00]/30 bg-[#C8FF00]/10 px-2 py-0.5 text-[11px] font-medium text-[#C8FF00]"
                  >
                    {mod}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {order.column === 'ready' && (
        <div className="mt-3 border-t border-white/[0.08] pt-3">
          {order.isPaid ? (
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#C8FF00]">
              ✓ Оплачено
            </p>
          ) : (
            <button
              type="button"
              className="w-full rounded-lg border border-[#C8FF00]/40 py-2 text-xs font-semibold uppercase tracking-wide text-[#C8FF00] transition-colors hover:bg-[#C8FF00]/10"
              onClick={() => openPaymentPage(order.id)}
            >
              Оплатити рахунок
            </button>
          )}
        </div>
      )}
    </article>
  );
}
