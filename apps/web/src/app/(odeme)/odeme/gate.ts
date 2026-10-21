/**
 * Payment step gate (9.2/8): the pay button opens only after the confirmation box (Mesafeli Sozlesmeler
 * Yon. m.7) and the separate withdrawal exception box (m.15/1-g, h). The subscription step shows the
 * exception box too until Tarik decides the unused first period case (mimar-yonlendirme-odeme.md madde 4).
 */
export type CheckoutKind = 'paket' | 'abonelik';

export function canPay(s: { kind: CheckoutKind; confirmed: boolean; withdrawalWaiver: boolean }): boolean {
  return s.confirmed && s.withdrawalWaiver;
}
