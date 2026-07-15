import { getOrderById } from '../lib/demoEngine';
import { closePayment, usePaymentUi } from '../lib/payment/paymentUiStore';

// Only ever rendered after a confirmed 'approved' webhook (see
// PaymentPage.handlePay -> showThankYou) — never right after the "Оплатити"
// click itself. That gap is the whole point: redirect vs. webhook.
export function ThankYouPage() {
  const ui = usePaymentUi();
  if (ui.view !== 'thankyou') return null;

  const order = getOrderById(ui.orderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-sm rounded-xl border border-[#C8FF00]/30 bg-[#1a1a1a] p-6 text-center">
        <p className="text-4xl">✓</p>
        <h2
          className="mt-2 text-xl font-extrabold uppercase tracking-tight text-white"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          Оплату підтверджено
        </h2>
        <p className="mt-2 text-sm text-white/60">
          Замовлення №{order?.orderNumber ?? '—'} · {ui.amount} грн
        </p>
        <p className="mt-1 font-mono text-xs text-white/30">{ui.orderReference}</p>
        <button
          type="button"
          className="mt-6 w-full rounded-lg border border-[#C8FF00]/40 py-2.5 text-sm font-semibold text-[#C8FF00] transition-colors hover:bg-[#C8FF00]/10"
          onClick={closePayment}
        >
          Повернутись до дошки
        </button>
      </div>
    </div>
  );
}
