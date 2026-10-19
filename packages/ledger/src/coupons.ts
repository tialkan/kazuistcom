/**
 * Coupons (9.4): either free promotional credits (90 day lot) or a percent discount on a purchase.
 * Discounts never make a price negative and are rounded down to whole kurus in the customer's favour.
 */
export interface Coupon {
  code: string;
  credits: number | null;
  percentOff: number | null;
  maxRedemptions: number | null;
  redeemed: number;
  validUntil: Date | null;
}

export type CouponCheck =
  | { ok: true; kind: 'kredi'; credits: number }
  | { ok: true; kind: 'indirim'; percentOff: number }
  | { ok: false; reason: 'bulunamadi' | 'suresi_doldu' | 'tukendi' | 'gecersiz' };

export function normalizeCouponCode(code: string): string {
  return code.trim().toLocaleUpperCase('tr-TR');
}

export function checkCoupon(c: Coupon | null, now: Date): CouponCheck {
  if (!c) return { ok: false, reason: 'bulunamadi' };
  if (c.validUntil && c.validUntil.getTime() < now.getTime()) return { ok: false, reason: 'suresi_doldu' };
  if (c.maxRedemptions !== null && c.redeemed >= c.maxRedemptions) return { ok: false, reason: 'tukendi' };
  if (c.credits && c.credits > 0) return { ok: true, kind: 'kredi', credits: c.credits };
  if (c.percentOff && c.percentOff > 0 && c.percentOff <= 100)
    return { ok: true, kind: 'indirim', percentOff: c.percentOff };
  return { ok: false, reason: 'gecersiz' };
}

export function applyDiscount(priceKurus: number, percentOff: number): number {
  const off = Math.ceil((priceKurus * percentOff) / 100);
  return Math.max(0, priceKurus - off);
}
