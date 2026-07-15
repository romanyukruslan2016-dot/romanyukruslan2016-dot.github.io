import { useState } from 'react';
import { getOrderById } from '../lib/demoEngine';
import { simulatePayment } from '../lib/payment/paymentGateway';
import { closePayment, showThankYou, usePaymentUi } from '../lib/payment/paymentUiStore';
import type { CreateInvoiceResult, TransactionStatus } from '../lib/payment/types';

// Note: there are deliberately no card-number/CVV fields anywhere below —
// the real card form lives entirely on WayForPay's side. This page only
// ever shows the amount and a "Оплатити" button.

function readForcedResultFromUrl(): TransactionStatus | null {
  const value = new URLSearchParams(window.location.search).get('forceResult');
  return value === 'approved' || value === 'declined' ? value : null;
}

const RESULT_OPTIONS: { value: TransactionStatus; label: string }[] = [
  { value: 'approved', label: 'Успішна оплата' },
  { value: 'declined', label: 'Відхилена оплата' },
];

export function PaymentPage() {
  const ui = usePaymentUi();
  if (ui.view !== 'pay') return null;

  // `key` remounts PaymentPageContent whenever a different order is opened,
  // so its local UI state (forced result, decline message) always starts
  // fresh — no effect needed to reset it manually.
  return <PaymentPageContent key={ui.orderId} orderId={ui.orderId} invoice={ui.invoice} />;
}

function PaymentPageContent({ orderId, invoice }: { orderId: string; invoice: CreateInvoiceResult }) {
  const [forcedResult, setForcedResult] = useState<TransactionStatus>(() => readForcedResultFromUrl() ?? 'approved');
  const [isProcessing, setIsProcessing] = useState(false);
  const [declineMessage, setDeclineMessage] = useState<string | null>(null);

  const order = getOrderById(orderId);

  async function handlePay() {
    if (!invoice.ok || isProcessing) return;
    setIsProcessing(true);
    setDeclineMessage(null);

    const result = await simulatePayment(invoice.orderReference, forcedResult);
    setIsProcessing(false);

    if (result.ok && (result.alreadyProcessed || result.status === 'approved')) {
      showThankYou(orderId, invoice.orderReference, invoice.amount);
      return;
    }
    if (result.ok && !result.alreadyProcessed && result.status === 'declined') {
      setDeclineMessage('Платіж відхилено банком. Спробуйте, будь ласка, ще раз.');
      return;
    }
    setDeclineMessage('Оплату не вдалося обробити. Спробуйте, будь ласка, ще раз.');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-sm rounded-xl border border-white/[0.08] bg-[#1a1a1a] p-6">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-extrabold uppercase tracking-tight text-white"
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              Оплата рахунку
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Стіл №{order?.tableNumber ?? '—'} · Замовлення №{order?.orderNumber ?? '—'}
            </p>
          </div>
          <button type="button" className="shrink-0 text-xs text-white/40 hover:text-white" onClick={closePayment}>
            Закрити
          </button>
        </header>

        {!invoice.ok ? (
          <p className="text-sm text-white/60">
            {invoice.reason === 'already_paid' ? 'Це замовлення вже оплачено.' : 'Замовлення не знайдено.'}
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-baseline justify-between rounded-lg border border-white/[0.08] bg-[#0d0d0d] px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-white/40">До сплати</span>
              <span className="font-mono text-2xl font-bold text-[#C8FF00]">{invoice.amount} грн</span>
            </div>

            <div className="mb-4 flex flex-col gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                Dev: результат емуляції
              </span>
              <div className="flex gap-2">
                {RESULT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                      forcedResult === opt.value
                        ? 'border-[#C8FF00] text-[#C8FF00]'
                        : 'border-white/10 text-white/50 hover:border-white/30'
                    }`}
                    onClick={() => setForcedResult(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {declineMessage && (
              <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {declineMessage}
              </p>
            )}

            <button
              type="button"
              className="w-full rounded-lg bg-[#C8FF00] py-2.5 text-sm font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-90 disabled:opacity-50"
              onClick={handlePay}
              disabled={isProcessing}
            >
              {isProcessing ? 'Обробка…' : 'Оплатити'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
