import { useCallback, useMemo, useState } from 'react';
import { initialOrders } from '../data/mockOrders';
import type { ColumnId, Order } from '../types';
import { COLUMN_LABELS, COLUMN_ORDER, nextColumn } from '../types';
import { OrderCard } from './OrderCard';

export function KanbanBoard() {
  const [orders, setOrders] = useState<Order[]>(initialOrders);

  const advanceOrder = useCallback((orderId: string) => {
    setOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const next = nextColumn(order.column);
        return next ? { ...order, column: next } : order;
      }),
    );
  }, []);

  const ordersByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      COLUMN_ORDER.map((col) => [col, [] as Order[]]),
    ) as Record<ColumnId, Order[]>;

    for (const order of orders) {
      grouped[order.column].push(order);
    }

    for (const col of COLUMN_ORDER) {
      grouped[col].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }

    return grouped;
  }, [orders]);

  return (
    <div className="kds">
      <header className="kds__header">
        <h1 className="kds__title">Kitchen Display</h1>
        <p className="kds__subtitle">
          Tap a card to advance it through the line
        </p>
      </header>

      <div className="kds__board">
        {COLUMN_ORDER.map((columnId) => (
          <section
            key={columnId}
            className={`kds__column kds__column--${columnId}`}
          >
            <header className="kds__column-header">
              <h2 className="kds__column-title">{COLUMN_LABELS[columnId]}</h2>
              <span className="kds__column-count">
                {ordersByColumn[columnId].length}
              </span>
            </header>

            <div className="kds__column-body">
              {ordersByColumn[columnId].length === 0 ? (
                <p className="kds__empty">No orders</p>
              ) : (
                ordersByColumn[columnId].map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onAdvance={advanceOrder}
                  />
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
