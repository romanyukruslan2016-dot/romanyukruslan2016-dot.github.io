import type { Order } from '../types';
import { COLUMN_LABELS, nextColumn } from '../types';
import { useOrderTimer } from '../hooks/useOrderTimer';

interface OrderCardProps {
  order: Order;
  onAdvance: (orderId: string) => void;
}

export function OrderCard({ order, onAdvance }: OrderCardProps) {
  const minutes = useOrderTimer(order.createdAt);
  const next = nextColumn(order.column);

  const timerClass =
    minutes >= 20 ? 'timer--urgent' : minutes >= 10 ? 'timer--warn' : 'timer--ok';

  return (
    <article className="order-card">
      <div className="order-card__header">
        <div>
          <span className="order-card__label">Order</span>
          <p className="order-card__order-num">#{order.orderNumber}</p>
        </div>
        <div className="order-card__table-wrap">
          <span className="order-card__label">Table</span>
          <p className="order-card__table-num">{order.tableNumber}</p>
        </div>
      </div>

      <div
        className={`order-card__timer ${timerClass}`}
        aria-label={`Waiting ${minutes} minutes`}
      >
        <span className="order-card__timer-value">{minutes}</span>
        <span className="order-card__timer-unit">min</span>
      </div>

      <ul className="order-card__dishes">
        {order.dishes.map((dish) => (
          <li key={dish.name} className="order-card__dish">
            <p className="order-card__dish-name">{dish.name}</p>
            {dish.modifiers.length > 0 && (
              <ul className="order-card__modifiers">
                {dish.modifiers.map((mod) => (
                  <li key={mod} className="order-card__modifier">
                    {mod}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {next ? (
        <button
          type="button"
          className="order-card__btn"
          onClick={() => onAdvance(order.id)}
        >
          Move to {COLUMN_LABELS[next]}
        </button>
      ) : (
        <div className="order-card__done">Ready for pickup</div>
      )}
    </article>
  );
}
