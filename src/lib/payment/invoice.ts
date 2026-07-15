// Invoice store for the WayForPay emulation. Kept separate from
// demoEngine's `orders` — WayForPay only ever knows an orderReference and an
// amount, never the internal order shape — but every invoice is anchored
// back to a real order via `orderId`, and only demoEngine (via
// markOrderPaid/markOrderPaymentDeclined, called from webhook.ts) may flip
// that order's isPaid flag. This module never mutates `orders` directly.

import { getOrderById } from '../demoEngine';
import { findMenuItem } from '../menu';
import type { Dish } from '../../types';
import type { CreateInvoiceResult, Invoice } from './types';

const invoices = new Map<string, Invoice>();

function computeAmount(dishes: Dish[]): number {
  return dishes.reduce((sum, dish) => sum + (findMenuItem(dish.name)?.price ?? 0), 0);
}

export function createInvoice(orderId: string): CreateInvoiceResult {
  const order = getOrderById(orderId);
  if (!order) return { ok: false, reason: 'not_found' };
  if (order.isPaid) return { ok: false, reason: 'already_paid' };

  const orderReference = `WFP-${crypto.randomUUID()}`;
  const invoice: Invoice = {
    orderReference,
    orderId,
    amount: computeAmount(order.dishes),
    currency: 'UAH',
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  invoices.set(orderReference, invoice);

  return { ok: true, orderReference, amount: invoice.amount, currency: invoice.currency };
}

export function getInvoiceByReference(orderReference: string): Invoice | undefined {
  return invoices.get(orderReference);
}

export function markInvoiceApproved(orderReference: string): void {
  const invoice = invoices.get(orderReference);
  if (!invoice) return;
  invoices.set(orderReference, { ...invoice, status: 'approved' });
}

export function markInvoiceDeclined(orderReference: string, reason: string): void {
  const invoice = invoices.get(orderReference);
  if (!invoice) return;
  invoices.set(orderReference, { ...invoice, status: 'declined', declineReason: reason });
}
