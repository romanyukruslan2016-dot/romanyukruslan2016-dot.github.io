import { describe, expect, it } from 'vitest';
import { createOrderFromAgent, markOrderPaid } from '../demoEngine';
import { findMenuItem } from '../menu';
import { createInvoice } from './invoice';

describe('createInvoice', () => {
  it("computes the amount from the order's actual dishes at menu prices", () => {
    const order = createOrderFromAgent({
      tableNumber: 3,
      dishes: [
        { name: 'Борщ', modifiers: [] },
        { name: 'Стейк', modifiers: [] },
      ],
    });

    const expectedAmount = findMenuItem('Борщ')!.price + findMenuItem('Стейк')!.price;
    expect(createInvoice(order.id)).toMatchObject({ ok: true, amount: expectedAmount, currency: 'UAH' });
  });

  it('generates an orderReference distinct from the kitchen order number', () => {
    const order = createOrderFromAgent({ tableNumber: 3, dishes: [{ name: 'Борщ', modifiers: [] }] });
    const result = createInvoice(order.id);
    if (!result.ok) throw new Error('expected invoice creation to succeed');
    expect(result.orderReference).not.toBe(String(order.orderNumber));
  });

  it('returns not_found for an unknown orderId', () => {
    expect(createInvoice('does-not-exist')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('returns already_paid once the order has been marked paid', () => {
    const order = createOrderFromAgent({ tableNumber: 3, dishes: [{ name: 'Борщ', modifiers: [] }] });
    markOrderPaid(order.id, 'WFP-existing-ref');
    expect(createInvoice(order.id)).toEqual({ ok: false, reason: 'already_paid' });
  });
});
