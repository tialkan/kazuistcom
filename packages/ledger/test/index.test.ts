import { describe, expect, it } from 'vitest';
import {
  Ledger,
  LedgerError,
  PRICE_TABLE_V1,
  addDays,
  annualGrantsDue,
  annualRefundKurus,
  applyDiscount,
  checkCoupon,
  consumptionOrder,
  decideCancel,
  dunningPlan,
  effectiveTable,
  isBalanced,
  nextDunningStep,
  packageRefundAllowed,
  priceChangeEffectiveAt,
  renewalNotices,
} from '../src/index.ts';

const W = 'w';
const t0 = new Date('2026-10-19T10:00:00Z');

it('accepts balanced and rejects unbalanced transactions', () => {
  expect(
    isBalanced([
      { side: 'borc', credits: 5 },
      { side: 'alacak', credits: 5 },
    ]),
  ).toBe(true);
  expect(isBalanced([{ side: 'borc', credits: 5 }])).toBe(false);
  expect(
    isBalanced([
      { side: 'borc', credits: 5 },
      { side: 'alacak', credits: 4 },
    ]),
  ).toBe(false);
});

describe('consumption order (4.5/1)', () => {
  it('spends nearest expiring promo, then subscription, then package, each FIFO', () => {
    const l = new Ledger();
    l.grant({ key: 'p', walletId: W, source: 'paket', credits: 10, originRef: 'p', now: t0 });
    l.grant({ key: 's', walletId: W, source: 'abonelik', credits: 10, originRef: 's', now: addDays(t0, 1) });
    l.grant({
      key: 'pr2',
      walletId: W,
      source: 'promosyon',
      credits: 10,
      originRef: 'pr2',
      now: t0,
      expiresAt: addDays(t0, 60),
    });
    l.grant({
      key: 'pr1',
      walletId: W,
      source: 'promosyon',
      credits: 10,
      originRef: 'pr1',
      now: t0,
      expiresAt: addDays(t0, 30),
    });
    expect(consumptionOrder(l.wallet(W).lots, t0).map((x) => x.originRef)).toEqual(['pr1', 'pr2', 's', 'p']);
    const r = l.reserve({ operationId: 'o', walletId: W, estimatedCredits: 25, now: t0 });
    expect(r.allocations.map((a) => a.credits)).toEqual([10, 10, 5]);
  });

  it('gives promo lots a 90 day expiry and expires them', () => {
    const l = new Ledger();
    l.grant({ key: 'k', walletId: W, source: 'promosyon', credits: 50, originRef: 'kayit', now: t0 });
    expect(l.wallet(W).lots[0]?.expiresAt?.toISOString()).toBe(addDays(t0, 90).toISOString());
    expect(l.expirePromos(W, addDays(t0, 90))).toHaveLength(1);
    expect(l.balance(W)).toBe(0);
  });
});

describe('reservations (4.5/2-3)', () => {
  it('charges the actual amount and releases the rest; abstention and technical error are free', () => {
    const l = new Ledger();
    l.grant({ key: 'g', walletId: W, source: 'paket', credits: 100, originRef: 'g', now: t0 });
    l.reserve({ operationId: 'a', walletId: W, estimatedCredits: 60, now: t0 });
    expect(l.balance(W)).toBe(40);
    l.settle({ walletId: W, operationId: 'a', outcome: 'tamam', actualCredits: 2, now: t0 });
    expect(l.balance(W)).toBe(98);
    l.reserve({ operationId: 'b', walletId: W, estimatedCredits: 60, now: t0 });
    l.settle({ walletId: W, operationId: 'b', outcome: 'cekimser', now: t0 });
    l.reserve({ operationId: 'c', walletId: W, estimatedCredits: 60, now: t0 });
    l.settle({ walletId: W, operationId: 'c', outcome: 'teknik_hata', now: t0 });
    expect(l.balance(W)).toBe(98);
  });

  it('releases reservations after 5 minutes', () => {
    const l = new Ledger();
    l.grant({ key: 'g', walletId: W, source: 'paket', credits: 10, originRef: 'g', now: t0 });
    l.reserve({ operationId: 'a', walletId: W, estimatedCredits: 10, now: t0 });
    expect(l.sweepExpired(W, new Date(t0.getTime() + 4 * 60_000))).toHaveLength(0);
    expect(l.sweepExpired(W, new Date(t0.getTime() + 5 * 60_000))).toHaveLength(1);
    expect(l.balance(W)).toBe(10);
  });

  it('rejects when credits are short', () => {
    const l = new Ledger();
    expect(() => l.reserve({ operationId: 'a', walletId: W, estimatedCredits: 1, now: t0 })).toThrow(
      LedgerError,
    );
  });
});

describe('negative balance only through clawback (D1, 4.5/11)', () => {
  it('chargeback of a spent package drives the balance below zero and blocks new AI work', () => {
    const l = new Ledger();
    l.grant({ key: 'g', walletId: W, source: 'paket', credits: 300, originRef: 'pay-1', now: t0 });
    l.reserve({ operationId: 'a', walletId: W, estimatedCredits: 200, now: t0 });
    l.settle({ walletId: W, operationId: 'a', outcome: 'tamam', actualCredits: 200, now: t0 });
    l.clawback({ key: 'cb', walletId: W, originRef: 'pay-1', reason: 'ters_ibraz', now: t0 });
    expect(l.balance(W)).toBe(-200);
    expect(() => l.reserve({ operationId: 'b', walletId: W, estimatedCredits: 1, now: t0 })).toThrow(
      'negative_balance',
    );
    l.grant({ key: 'g2', walletId: W, source: 'paket', credits: 300, originRef: 'pay-2', now: t0 });
    expect(l.balance(W)).toBe(100);
  });

  it('chargeback debt is covered by other lots first', () => {
    const l = new Ledger();
    l.grant({ key: 'g1', walletId: W, source: 'paket', credits: 100, originRef: 'a', now: t0 });
    l.reserve({ operationId: 'x', walletId: W, estimatedCredits: 100, now: t0 });
    l.settle({ walletId: W, operationId: 'x', outcome: 'tamam', actualCredits: 100, now: t0 });
    l.grant({ key: 'g2', walletId: W, source: 'paket', credits: 300, originRef: 'b', now: t0 });
    l.clawback({ key: 'cb', walletId: W, originRef: 'a', reason: 'apple_iade', now: t0 });
    expect(l.balance(W)).toBe(200);
    expect(l.wallet(W).debt).toBe(0);
  });
});

describe('4.5 rules', () => {
  it('14 day unused package refund', () => {
    expect(
      packageRefundAllowed({
        purchasedAt: t0,
        now: addDays(t0, 14),
        originalCredits: 300,
        remainingCredits: 300,
      }),
    ).toBe(true);
    expect(
      packageRefundAllowed({
        purchasedAt: t0,
        now: addDays(t0, 15),
        originalCredits: 300,
        remainingCredits: 300,
      }),
    ).toBe(false);
    expect(
      packageRefundAllowed({ purchasedAt: t0, now: t0, originalCredits: 300, remainingCredits: 299 }),
    ).toBe(false);
  });

  it('annual refund formula never goes below zero', () => {
    expect(annualRefundKurus({ paidKurus: 79900, grantedMonths: 3, monthlyListKurus: 9900 })).toBe(50200);
    expect(annualRefundKurus({ paidKurus: 79900, grantedMonths: 9, monthlyListKurus: 9900 })).toBe(0);
  });

  it('cancellation modes', () => {
    const sub = {
      interval: 'yillik' as const,
      status: 'aktif' as const,
      paidKurus: 79900,
      monthlyListKurus: 9900,
      grantsDelivered: 2,
      currentPeriodStart: t0,
      currentPeriodEnd: addDays(t0, 365),
      cancelAtPeriodEnd: false,
    };
    const end = decideCancel(sub, 'donem_sonu', t0);
    expect(end).toMatchObject({ cancelAtPeriodEnd: true, refundAmountKurus: 0, status: 'aktif' });
    const now = decideCancel(sub, 'hemen', t0);
    expect(now).toMatchObject({ status: 'iptal', refundAmountKurus: 60100 });
    expect(now.refundDueBy?.toISOString()).toBe(addDays(t0, 15).toISOString());
    expect(decideCancel({ ...sub, interval: 'aylik', paidKurus: 9900 }, 'hemen', t0).refundAmountKurus).toBe(
      0,
    );
  });

  it('notices 7 days before each charge and 30 days before annual renewal', () => {
    const at = new Date('2027-10-19T00:00:00Z');
    expect(renewalNotices(at, 'aylik').map((n) => n.kind)).toEqual(['odeme_7_gun']);
    const y = renewalNotices(at, 'yillik');
    expect(y.map((n) => [n.kind, n.sendAt.toISOString().slice(0, 10)])).toEqual([
      ['yillik_30_gun', '2027-09-19'],
      ['odeme_7_gun', '2027-10-12'],
    ]);
  });

  it('price change applies from the first period at least 30 days after notice', () => {
    const notice = new Date('2026-11-01T00:00:00Z');
    const starts = ['2026-11-19', '2026-12-19', '2027-01-19'].map((d) => new Date(`${d}T00:00:00Z`));
    expect(
      priceChangeEffectiveAt({ noticeSentAt: notice, nextPeriodStarts: starts })?.toISOString().slice(0, 10),
    ).toBe('2026-12-19');
  });

  it('retries on day 1, 3, 7, then downgrades', () => {
    const plan = dunningPlan(t0);
    expect(plan.map((s) => s.action)).toEqual(['retry', 'retry', 'retry', 'downgrade']);
    expect(plan.map((s) => Math.round((s.at.getTime() - t0.getTime()) / 86_400_000))).toEqual([1, 3, 7, 7]);
    expect(nextDunningStep(t0, 3).action).toBe('downgrade');
  });

  it('annual monthly grants due', () => {
    expect(annualGrantsDue(t0, t0)).toBe(1);
    expect(annualGrantsDue(t0, new Date('2027-01-19T10:00:00Z'))).toBe(4);
    expect(annualGrantsDue(t0, new Date('2030-01-01T00:00:00Z'))).toBe(12);
  });
});

describe('prices and coupons', () => {
  it('serves the 4.2 and 4.3 values from the effective table', () => {
    const t = effectiveTable([PRICE_TABLE_V1], t0);
    expect(t?.products.find((p) => p.code === 'kredi.1000')).toMatchObject({
      priceKurus: 10900,
      credits: 1000,
    });
    expect(t?.operations['ozet.standart']).toBe(2);
    expect(effectiveTable([PRICE_TABLE_V1], new Date('2026-01-01'))).toBeNull();
  });

  it('checks coupons', () => {
    const base = {
      code: 'ASBU',
      credits: 200,
      percentOff: null,
      maxRedemptions: 1,
      redeemed: 0,
      validUntil: addDays(t0, 1),
    };
    expect(checkCoupon(base, t0)).toEqual({ ok: true, kind: 'kredi', credits: 200 });
    expect(checkCoupon({ ...base, redeemed: 1 }, t0)).toMatchObject({ ok: false, reason: 'tukendi' });
    expect(checkCoupon(base, addDays(t0, 2))).toMatchObject({ ok: false, reason: 'suresi_doldu' });
    expect(applyDiscount(10900, 20)).toBe(8720);
  });
});
