// Client-side emulation of the WayForPay side of the payment flow — the
// part that in reality runs on WayForPay's own servers after the cardholder
// pays, and then calls our webhook. Simulates processing latency and hands
// a signed payload to handlePaymentWebhook exactly as the real gateway
// would. This is the module to delete/replace with the real WayForPay
// widget + a server-side webhook endpoint when going live; nothing else
// (webhook.ts, demoEngine, UI) needs to change shape.

import { getInvoiceByReference } from './invoice';
import { generateMerchantSignature } from './signature';
import { handlePaymentWebhook } from './webhook';
import type { TransactionStatus, WebhookResult } from './types';

export const MERCHANT_ACCOUNT = 'kds_kitchen_demo';

const MIN_DELAY_MS = 700;
const MAX_DELAY_MS = 1500;

function randomProcessingDelayMs(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Called by PaymentPage when the user clicks "Оплатити". `forcedResult` is
// the emulation's stand-in for what a real cardholder's bank would decide —
// a deterministic test hook (dev toggle / ?forceResult=), never real
// randomness, so scenarios stay reproducible.
export async function simulatePayment(
  orderReference: string,
  forcedResult: TransactionStatus,
): Promise<WebhookResult> {
  const invoice = getInvoiceByReference(orderReference);
  if (!invoice) {
    return { ok: false, reason: 'not_found' };
  }

  await delay(randomProcessingDelayMs());

  const merchantSignature = await generateMerchantSignature(orderReference, invoice.amount, invoice.currency);
  return handlePaymentWebhook({
    merchantAccount: MERCHANT_ACCOUNT,
    orderReference,
    amount: invoice.amount,
    currency: invoice.currency,
    transactionStatus: forcedResult,
    merchantSignature,
  });
}
