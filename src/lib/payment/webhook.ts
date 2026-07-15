// Emulated WayForPay webhook receiver. This is the ONLY function that may
// flip an order's `isPaid` — the "Оплатити" button on PaymentPage never
// touches order state directly, it only triggers paymentGateway.ts, which
// eventually calls this. Processing order matches the spec exactly:
// signature -> idempotency -> declined/approved.

import { markOrderPaid, markOrderPaymentDeclined } from '../demoEngine';
import { getInvoiceByReference, markInvoiceApproved, markInvoiceDeclined } from './invoice';
import { generateMerchantSignature } from './signature';
import type { WebhookPayload, WebhookResult } from './types';

const DECLINE_REASON = 'Платіж відхилено. Спробуйте, будь ласка, ще раз або скористайтесь іншою карткою.';

export async function handlePaymentWebhook(payload: WebhookPayload): Promise<WebhookResult> {
  const expectedSignature = await generateMerchantSignature(
    payload.orderReference,
    payload.amount,
    payload.currency,
  );
  if (expectedSignature !== payload.merchantSignature) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const invoice = getInvoiceByReference(payload.orderReference);
  if (!invoice) {
    return { ok: false, reason: 'not_found' };
  }

  if (invoice.status === 'approved') {
    return { ok: true, alreadyProcessed: true };
  }

  if (payload.transactionStatus === 'declined') {
    markInvoiceDeclined(payload.orderReference, DECLINE_REASON);
    markOrderPaymentDeclined(invoice.orderId, DECLINE_REASON);
    return { ok: true, alreadyProcessed: false, status: 'declined' };
  }

  markInvoiceApproved(payload.orderReference);
  markOrderPaid(invoice.orderId, payload.orderReference);
  return { ok: true, alreadyProcessed: false, status: 'approved' };
}
