/**
 * Payment step gate (9.2/8): the pay button opens only after the confirmation box (Mesafeli Sozlesmeler
 * Yon. m.7); for credit packages the separate withdrawal exception box (m.15/1-g, h) is also required.
 */
export type CheckoutKind = 'paket' | 'abonelik';

export function canPay(s: { kind: CheckoutKind; confirmed: boolean; withdrawalWaiver: boolean }): boolean {
  return s.confirmed && (s.kind === 'abonelik' || s.withdrawalWaiver);
}
