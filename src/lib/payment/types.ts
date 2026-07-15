// Types for the WayForPay emulation. Mirrors the real gateway's shape
// (orderReference/amount/currency/transactionStatus/merchantSignature) so
// swapping this module for the real widget later doesn't require touching
// callers — only paymentGateway.ts and webhook.ts change.

export type TransactionStatus = 'approved' | 'declined';
export type InvoiceStatus = 'pending' | 'approved' | 'declined';

export interface Invoice {
  orderReference: string;
  orderId: string;
  amount: number;
  currency: 'UAH';
  status: InvoiceStatus;
  createdAt: string;
  declineReason?: string;
}

export type CreateInvoiceFailureReason = 'not_found' | 'already_paid';

export type CreateInvoiceResult =
  | { ok: true; orderReference: string; amount: number; currency: 'UAH' }
  | { ok: false; reason: CreateInvoiceFailureReason };

export interface WebhookPayload {
  merchantAccount: string;
  orderReference: string;
  amount: number;
  currency: 'UAH';
  transactionStatus: TransactionStatus;
  merchantSignature: string;
}

export type WebhookFailureReason = 'invalid_signature' | 'not_found';

export type WebhookResult =
  | { ok: true; alreadyProcessed: true }
  | { ok: true; alreadyProcessed: false; status: TransactionStatus }
  | { ok: false; reason: WebhookFailureReason };
