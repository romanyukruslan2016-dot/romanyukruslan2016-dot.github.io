import { describe, expect, it } from 'vitest';
import { createOrderFromAgent, getOrderById } from '../demoEngine';
import { createInvoice } from './invoice';
import { generateMerchantSignature } from './signature';
import { handlePaymentWebhook } from './webhook';
import type { WebhookPayload } from './types';

const MERCHANT_ACCOUNT = 'kds_kitchen_demo';

function makeOrder() {
  return createOrderFromAgent({ tableNumber: 7, dishes: [{ name: 'Борщ', modifiers: [] }] });
}

function makeInvoice(orderId: string) {
  const result = createInvoice(orderId);
  if (!result.ok) throw new Error('expected invoice creation to succeed');
  return result;
}

async function buildPayload(
  orderReference: string,
  amount: number,
  transactionStatus: WebhookPayload['transactionStatus'],
): Promise<WebhookPayload> {
  return {
    merchantAccount: MERCHANT_ACCOUNT,
    orderReference,
    amount,
    currency: 'UAH',
    transactionStatus,
    merchantSignature: await generateMerchantSignature(orderReference, amount, 'UAH'),
  };
}

describe('handlePaymentWebhook — Definition of Done scenarios', () => {
  it('3. approved webhook marks the order paid', async () => {
    const order = makeOrder();
    const invoice = makeInvoice(order.id);
    const payload = await buildPayload(invoice.orderReference, invoice.amount, 'approved');

    const result = await handlePaymentWebhook(payload);

    expect(result).toEqual({ ok: true, alreadyProcessed: false, status: 'approved' });
    const updated = getOrderById(order.id);
    expect(updated?.isPaid).toBe(true);
    expect(updated?.paymentReference).toBe(invoice.orderReference);
    expect(updated?.paidAt).toBeDefined();
  });

  it('4. a repeated approved webhook for the same orderReference is idempotent — no second side effect', async () => {
    const order = makeOrder();
    const invoice = makeInvoice(order.id);
    const payload = await buildPayload(invoice.orderReference, invoice.amount, 'approved');

    const first = await handlePaymentWebhook(payload);
    expect(first).toEqual({ ok: true, alreadyProcessed: false, status: 'approved' });
    const paidAtAfterFirst = getOrderById(order.id)?.paidAt;

    const second = await handlePaymentWebhook(payload);
    expect(second).toEqual({ ok: true, alreadyProcessed: true });
    expect(getOrderById(order.id)?.paidAt).toBe(paidAtAfterFirst);
  });

  it('5. declined webhook leaves the order unpaid so the pay button can be retried', async () => {
    const order = makeOrder();
    const invoice = makeInvoice(order.id);
    const payload = await buildPayload(invoice.orderReference, invoice.amount, 'declined');

    const result = await handlePaymentWebhook(payload);

    expect(result).toEqual({ ok: true, alreadyProcessed: false, status: 'declined' });
    expect(getOrderById(order.id)?.isPaid).toBe(false);
  });

  it('6. a forged payload with a mismatched signature is rejected and changes nothing', async () => {
    const order = makeOrder();
    const invoice = makeInvoice(order.id);
    const validPayload = await buildPayload(invoice.orderReference, invoice.amount, 'approved');
    // Attacker bumps the amount but keeps the signature that was valid for
    // the original amount.
    const forged: WebhookPayload = { ...validPayload, amount: invoice.amount + 1000 };

    const result = await handlePaymentWebhook(forged);

    expect(result).toEqual({ ok: false, reason: 'invalid_signature' });
    expect(getOrderById(order.id)?.isPaid).toBe(false);
  });
});
