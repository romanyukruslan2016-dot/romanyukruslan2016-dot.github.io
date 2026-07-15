// Emulates WayForPay's merchantSignature. In a real integration this hash is
// computed server-side with a secret key that never reaches the browser —
// here it's a learning stand-in for the same principle: any change to the
// signed fields (amount, orderReference, currency) must invalidate the
// signature. The "secret" below is a fake demo constant, not a real key.
const FAKE_MERCHANT_SECRET = 'demo_secret_never_use_in_production';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateMerchantSignature(
  orderReference: string,
  amount: number,
  currency: string,
): Promise<string> {
  const signedString = `${orderReference};${amount};${currency};${FAKE_MERCHANT_SECRET}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(signedString));
  return toHex(digest);
}
