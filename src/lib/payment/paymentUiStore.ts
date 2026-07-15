// UI-visibility state for the payment/thank-you overlays. The project has
// no router, so — same pattern as demoEngine.ts — this is a tiny
// module-level store read via useSyncExternalStore instead of a Context.
// It only ever decides what's on screen; it never touches order/invoice
// state itself (that's webhook.ts's job, via demoEngine).

import { useSyncExternalStore } from 'react';
import { createInvoice } from './invoice';
import type { CreateInvoiceResult } from './types';

export type PaymentUiState =
  | { view: 'closed' }
  | { view: 'pay'; orderId: string; invoice: CreateInvoiceResult }
  | { view: 'thankyou'; orderId: string; orderReference: string; amount: number };

let state: PaymentUiState = { view: 'closed' };
const listeners = new Set<() => void>();

function setState(next: PaymentUiState): void {
  state = next;
  listeners.forEach((fn) => fn());
}

// The invoice is created here, once, at the moment the operator opens the
// page — not derived later inside PaymentPage — so there is exactly one
// createInvoice call per open and no render-time or effect-time side effect
// in the component itself.
export function openPaymentPage(orderId: string): void {
  setState({ view: 'pay', orderId, invoice: createInvoice(orderId) });
}

export function showThankYou(orderId: string, orderReference: string, amount: number): void {
  setState({ view: 'thankyou', orderId, orderReference, amount });
}

export function closePayment(): void {
  setState({ view: 'closed' });
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): PaymentUiState {
  return state;
}

export function usePaymentUi(): PaymentUiState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
