/** Regression tests for docs/denetim/defter-odeme.md (one block per finding), memory store and fake iyzico. */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { HttpIyzico, IYZICO_SANDBOX_BASE_URL, webhookSignature } from '../../src/billing/iyzico.ts';
import { BillingService, type Buyer, type ConsentVersions } from '../../src/billing/service.ts';
import { MemoryBillingStore, MemoryLedgerPort } from '../../src/billing/store.ts';
import { Ledger, LedgerReservationsAdapter, addDays, memoryRunner } from '../../src/index.ts';

const buyer: Buyer = {
  id: 'u1',
  email: 'a@example.invalid',
  name: 'A',
  surname: 'B',
  identityNumber: '11111111111',
  ip: '127.0.0.1',
  city: 'Ankara',
  country: 'Turkey',
  address: 'x',
};
const V: ConsentVersions = {
  on_bilgilendirme: 'onb-1',
  mesafeli_sozlesme: 'mss-1',
  abonelik_sozlesmesi: 'abo-1',
};
const pack = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'mss-1' };
const plan = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'abo-1' };

function env(start = new Date('2026-10-20T09:00:00Z')) {
  let now = start;
  const iyz = new FakeIyzico();
  iyz.now = () => now;
  const store = new MemoryBillingStore();
  const ledger = new MemoryLedgerPort();
  const earsiv = new FakeEArsiv(() => now);
  const svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv,
    store,
    ledger,
    consentVersions: V,
    now: () => now,
    newId: () => randomUUID(),
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  const set = (d: Date) => {
    now = d;
  };
  const token = (id: string) => store.orders.get(id)?.checkoutToken as string;
  const buy = async (code = 'kredi.300', key = randomUUID()) => {
    const s = await svc.startTopup('u1', key, { productCode: code, withdrawalWaiver: true, ...pack }, buyer);
    return { ...s, token: token(s.orderId) };
  };
  const subscribe = async (planCode: string) => {
    const s = await svc.startSubscription('u1', randomUUID(), { planCode, ...plan }, buyer);
    return svc.completeSubscriptionCheckout(token(s.orderId));
  };
  return {
    iyz,
    store,
    ledger,
    earsiv,
    svc,
    set,
    get now() {
      return now;
    },
    buy,
    subscribe,
  };
}

const balance = async (e: ReturnType<typeof env>) => (await e.svc.wallet('u1')).balance;

describe('critical', () => {
  it('K1: a renewal with orderStatus SUCCESS and a successful paymentAttempt is a renewal (HTTP shape)', async () => {
    const fetchStub = (async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          data: {
            items: [
              {
                referenceCode: 'SUBREF',
                subscriptionStatus: 'ACTIVE',
                pricingPlanReferenceCode: 'PLAN',
                orders: [
                  {
                    referenceCode: 'ORD-2',
                    price: 99.0,
                    currencyCode: 'TRY',
                    startPeriod: 0,
                    endPeriod: 0,
                    orderStatus: 'SUCCESS',
                    paymentAttempts: [
                      { conversationId: 'c', createdDate: 0, paymentStatus: 'SUCCESS', paymentId: 24680 },
                    ],
                  },
                ],
              },
            ],
          },
        }),
      )) as unknown as typeof fetch;
    const store = new MemoryBillingStore();
    const now = new Date('2026-11-20T09:00:00Z');
    const svc = new BillingService({
      iyzico: new HttpIyzico({ apiKey: 'k', secretKey: 's', baseUrl: IYZICO_SANDBOX_BASE_URL }, fetchStub),
      iyzicoCfg: { secretKey: 's' },
      earsiv: new FakeEArsiv(() => now),
      store,
      ledger: new MemoryLedgerPort(),
      now: () => now,
      newId: randomUUID,
      callbackBaseUrl: 'https://k.test',
      webAddress: 'https://k.test',
    });
    await store.saveSubscription({
      id: 'sub-1',
      userId: 'u1',
      planCode: 'ogrenci.aylik',
      providerRef: 'SUBREF',
      status: 'aktif',
      priceKurus: 9900,
      currentPeriodStart: new Date('2026-10-20T09:00:00Z'),
      currentPeriodEnd: now,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      grantsDelivered: 1,
      lastPaymentId: '11111',
      firstFailureAt: null,
      failedRetries: 0,
      failedOrderRef: null,
      pendingPrice: null,
    });
    const s = await svc.onSubscriptionOrder('SUBREF', 'ORD-2');
    expect(s.status).toBe('aktif');
    expect(s.failedOrderRef).toBeNull();
    expect(s.lastPaymentId).toBe('24680');
    expect(await svc.wallet('u1')).toMatchObject({ balance: 1000 });
  });

  it('K1: the fake answers in the documented shape (orderStatus, paymentAttempts, numeric ids)', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.aylik');
    const d = await e.iyz.retrieveSubscription(sub.providerRef);
    expect(d.orders[0]).toMatchObject({
      orderStatus: 'SUCCESS',
      paymentAttempts: [{ paymentStatus: 'SUCCESS' }],
    });
    expect(d.orders[0]?.paymentAttempts[0]?.paymentId).toMatch(/^\d+$/);
  });

  it('K2: the webhook of the first subscription order is not a renewal', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.aylik');
    const end = sub.currentPeriodEnd.toISOString();
    const w = e.iyz.initialOrderWebhook(sub.providerRef);
    expect((await e.svc.handleWebhook(JSON.stringify(w.body), w.signature)).status).toBe(200);
    expect(await balance(e)).toBe(1000);
    expect(e.store.payments.filter((p) => p.kind === 'odeme')).toHaveLength(1);
    expect(e.earsiv.issued).toHaveLength(1);
    expect(e.store.subscriptions.get(sub.id)?.currentPeriodEnd.toISOString()).toBe(end);
  });
});

describe('high', () => {
  it('Y1: the real iyzico paymentId is stored and used for the annual refund', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.yillik');
    const pid = (await e.iyz.retrieveSubscription(sub.providerRef)).orders[0]?.paymentAttempts[0]?.paymentId;
    expect(sub.lastPaymentId).toBe(pid);
    await e.svc.cancel('u1', sub.id, 'hemen');
    expect(e.iyz.refunds.map((r) => r.paymentId)).toEqual([pid]);
  });

  it('Y2: a failed e-Arsiv after the refund does not refund twice on a second cancel', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.yillik');
    e.earsiv.issue = async () => {
      throw new Error('earsiv down');
    };
    await e.svc.cancel('u1', sub.id, 'hemen');
    expect(e.store.subscriptions.get(sub.id)?.status).toBe('iptal');
    await e.svc.cancel('u1', sub.id, 'hemen');
    expect(e.iyz.refunds).toHaveLength(1);
    expect(e.store.alerts.map((a) => a.kind)).toContain('fatura_bekliyor');
  });

  it('Y2: a definite iyzico refund failure can be retried; an unknown outcome is never resent', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.yillik');
    e.iyz.nextRefund = 'definite';
    await expect(e.svc.cancel('u1', sub.id, 'hemen')).rejects.toMatchObject({ code: 'refund_failed' });
    expect(e.store.subscriptions.get(sub.id)?.status).toBe('iptal');
    await e.svc.cancel('u1', sub.id, 'hemen');
    expect(e.iyz.refunds).toHaveLength(1);

    const f = env();
    await f.svc.setupSubscriptionCatalog();
    const s2 = await f.subscribe('ogrenci.yillik');
    f.iyz.nextRefund = 'unknown';
    await expect(f.svc.cancel('u1', s2.id, 'hemen')).rejects.toMatchObject({ code: 'refund_pending' });
    await expect(f.svc.cancel('u1', s2.id, 'hemen')).rejects.toMatchObject({ code: 'refund_pending' });
    expect(f.iyz.refunds).toHaveLength(1);
    expect(f.store.alerts.map((a) => a.kind)).toContain('iade_sonucu_bilinmiyor');
  });

  it('Y3: a failed package refund at iyzico keeps the credits and can be retried', async () => {
    const e = env();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    e.iyz.nextRefund = 'definite';
    await expect(e.svc.refundPackage('u1', a.orderId)).rejects.toMatchObject({ code: 'refund_failed' });
    expect(await balance(e)).toBe(300);
    expect(e.store.orders.get(a.orderId)?.status).toBe('odendi');
    expect(await e.svc.refundPackage('u1', a.orderId)).toMatchObject({ refunded: true });
    expect(await balance(e)).toBe(0);
    expect(e.iyz.refunds).toHaveLength(1);
  });

  it('Y4: a replay cannot use a spent coupon or skip consents; a reused key with another body is refused', async () => {
    const e = env();
    e.store.coupons.set('YUZDE50', {
      code: 'YUZDE50',
      credits: null,
      percentOff: 50,
      maxRedemptions: null,
      redeemed: 0,
      validUntil: null,
    });
    const a = await e.svc.startTopup(
      'u1',
      'key-aaaaaaaa',
      { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...pack },
      buyer,
    );
    await e.svc.completeCheckout(e.store.orders.get(a.orderId)?.checkoutToken as string);
    await expect(
      e.svc.startTopup(
        'u1',
        'key-bbbbbbbb',
        { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...pack },
        buyer,
      ),
    ).rejects.toMatchObject({ code: 'coupon_already_used' });
    expect([...e.store.orders.values()].filter((o) => o.idempotencyKey === 'key-bbbbbbbb')).toHaveLength(0);
    await expect(
      e.svc.startTopup(
        'u1',
        'key-aaaaaaaa',
        { productCode: 'kredi.3000', withdrawalWaiver: true, ...pack },
        buyer,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_key_reused' });
    for (const o of e.store.orders.values())
      expect(e.store.consents.filter((c) => c.context.orderId === o.id).length).toBeGreaterThan(0);
  });

  it('Y6: concurrent callback and webhook invoice once', async () => {
    const e = env();
    const a = await e.buy();
    const wh = e.iyz.checkoutWebhook(a.token);
    await Promise.all([
      e.svc.completeCheckout(a.token),
      e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature),
    ]);
    expect(e.earsiv.issued).toHaveLength(1);
    expect(e.store.notices.filter((n) => n.kind === 'odeme_alindi')).toHaveLength(1);
    expect(await balance(e)).toBe(300);
  });

  it('Y7: a consumed reservation key is never charged again; reserve failures are typed', async () => {
    const l = new Ledger();
    const t0 = new Date('2026-10-20T09:00:00Z');
    l.grant({ key: 'g', walletId: 'w', source: 'paket', credits: 100, originRef: 'o', now: t0 });
    const a = new LedgerReservationsAdapter(
      memoryRunner(l),
      () => 'w',
      () => t0,
    );
    const r = await a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-x' });
    await a.consume(r.reservationId, 30);
    await expect(a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-x' })).rejects.toMatchObject({
      code: 'already_settled',
    });
    await expect(a.reserve({ userId: 'u', credits: 999, idempotencyKey: 'req-y' })).rejects.toMatchObject({
      code: 'insufficient_credits',
    });
    expect(l.balance('w')).toBe(70);
  });
});

describe('medium', () => {
  it('O2: no dunning retry after the user canceled; the period then ends', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.aylik');
    e.set(sub.currentPeriodEnd);
    const f = e.iyz.simulateRenewal(sub.providerRef, false);
    await e.svc.handleWebhook(JSON.stringify(f.body), f.signature);
    await e.svc.cancel('u1', sub.id, 'donem_sonu');
    let retries = 0;
    const orig = e.iyz.retrySubscriptionOrder.bind(e.iyz);
    e.iyz.retrySubscriptionOrder = async (r) => {
      retries++;
      return orig(r);
    };
    const failedAt = e.now;
    for (const d of [1, 3, 7, 8]) {
      e.set(addDays(failedAt, d));
      await e.svc.closeEndedPeriods();
      await e.svc.runDunning();
    }
    expect(retries).toBe(0);
  });

  it('O3: a chargeback after a completed refund creates no debt, and a second case changes nothing', async () => {
    const e = env();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    await e.svc.refundPackage('u1', a.orderId);
    expect(await e.svc.chargeback(a.orderId, 'case-9')).toBe(0);
    expect(await e.svc.chargeback(a.orderId, 'case-10')).toBe(0);
  });

  it('O4: fraudStatus 0 waits, -1 fails, currency or amount mismatch raises an alert', async () => {
    const e = env();
    e.iyz.nextFraudStatus = 0;
    const a = await e.buy();
    expect((await e.svc.completeCheckout(a.token)).status).toBe('bekliyor');
    expect(await balance(e)).toBe(0);
    e.iyz.decideFraud(a.token, 1);
    const w = e.iyz.checkoutWebhook(a.token);
    await e.svc.handleWebhook(JSON.stringify(w.body), w.signature);
    expect(await balance(e)).toBe(300);

    e.iyz.nextFraudStatus = -1;
    const b = await e.buy();
    expect((await e.svc.completeCheckout(b.token)).status).toBe('basarisiz');

    const c = await e.buy();
    const orig = e.iyz.retrieveCheckoutForm.bind(e.iyz);
    e.iyz.retrieveCheckoutForm = async (t) => ({ ...(await orig(t)), currency: 'USD' });
    expect((await e.svc.completeCheckout(c.token)).status).toBe('bekliyor');
    expect(e.store.alerts.map((x) => x.kind)).toContain('odeme_uyusmazligi');
  });

  it('O5: consent versions must match the published texts; plans refuse coupons; annual adds the commitment', async () => {
    const e = env();
    await expect(
      e.svc.startTopup(
        'u1',
        randomUUID(),
        {
          productCode: 'kredi.300',
          withdrawalWaiver: true,
          preInfoConsentVersion: 'x',
          distanceContractConsentVersion: 'y',
        },
        buyer,
      ),
    ).rejects.toMatchObject({ code: 'consent_version_mismatch' });
    await e.svc.setupSubscriptionCatalog();
    await expect(
      e.svc.startSubscription(
        'u1',
        randomUUID(),
        { planCode: 'ogrenci.aylik', couponCode: 'X', ...plan },
        buyer,
      ),
    ).rejects.toMatchObject({ code: 'coupon_not_supported' });
    await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.yillik', withdrawalWaiver: true, ...plan },
      buyer,
    );
    expect(e.store.consents.map((c) => c.kind).sort()).toEqual([
      'abonelik_sozlesmesi',
      'cayma_istisnasi',
      'on_bilgilendirme',
      'yillik_taahhutname',
    ]);
  });

  it('O7: the end of an old plan does not remove the plan of another live subscription', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s1 = await e.subscribe('ogrenci.aylik');
    await e.svc.cancel('u1', s1.id, 'donem_sonu');
    e.set(new Date('2026-10-25T09:00:00Z'));
    await e.subscribe('akademisyen.aylik');
    expect(await e.store.getPlan('u1')).toBe('akademisyen');
    e.set(s1.currentPeriodEnd);
    await e.svc.closeEndedPeriods();
    expect(await e.store.getPlan('u1')).toBe('akademisyen');
  });

  it('O8: without the report call reconciliation is disabled with an alert, not failing', async () => {
    const e = env();
    e.iyz.listTransactions = async () => {
      throw new Error('no report');
    };
    expect(await e.svc.reconcileDay(e.now)).toEqual({ disabled: true, diffs: [] });
    expect(e.store.alerts.map((a) => a.kind)).toEqual(['mutabakat_devre_disi']);
  });

  it('O9: refund requests outside the rule wait for approval; account deletion cancels at iyzico', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    e.set(addDays(e.now, 20));
    expect(await e.svc.requestRefund('u1', a.orderId)).toMatchObject({ status: 'bekliyor' });
    expect(e.iyz.refunds).toHaveLength(0);
    const sub = await e.subscribe('ogrenci.aylik');
    expect(await e.svc.onAccountDeletion('u1')).toEqual({
      canceled: 1,
      providerPending: 0,
      refundRequested: true,
    });
    expect(e.iyz.canceled).toContain(sub.providerRef);
    expect(await e.store.getPlan('u1')).toBe('ucretsiz');
  });
});

describe('low', () => {
  it('D1: retries run on calendar day 1, 3 and 7 even when the tick runs early in the morning', async () => {
    const e = env(new Date('2026-10-20T15:00:00Z'));
    await e.svc.setupSubscriptionCatalog();
    const sub = await e.subscribe('ogrenci.aylik');
    e.set(sub.currentPeriodEnd);
    const f = e.iyz.simulateRenewal(sub.providerRef, false);
    await e.svc.handleWebhook(JSON.stringify(f.body), f.signature);
    // 00:30 Istanbul on the next calendar day is less than 24 hours later.
    e.set(new Date(Date.UTC(2026, 10, 20, 21, 30)));
    await e.svc.runDunning();
    expect(e.store.subscriptions.get(sub.id)?.failedRetries).toBe(1);
  });

  it('D7: credits that come back to an expired promo lot expire instead of hanging in the balance', () => {
    const l = new Ledger();
    const t0 = new Date('2026-10-20T09:00:00Z');
    l.grant({ key: 'promo', walletId: 'w', source: 'promosyon', credits: 50, originRef: 'k', now: t0 });
    const exp = new Date(t0.getTime() + 90 * 86_400_000);
    l.reserve({
      operationId: 'op',
      walletId: 'w',
      estimatedCredits: 10,
      now: new Date(exp.getTime() - 60_000),
    });
    const after = new Date(exp.getTime() + 60_000);
    l.expirePromos('w', after);
    l.sweepExpired('w', new Date(after.getTime() + 5 * 60_000));
    expect(l.wallet('w').lots[0]?.remainingCredits).toBe(0);
    expect(l.balance('w')).toBe(0);
  });

  it('D8: the signup gift is 50 promotional credits once', async () => {
    const e = env();
    await e.svc.grantSignupPromo('u1');
    await e.svc.grantSignupPromo('u1');
    expect(await e.svc.wallet('u1')).toMatchObject({ balance: 50, lots: [{ source: 'promosyon' }] });
  });

  it('D10: the coupon limit holds across users', async () => {
    const e = env();
    e.store.coupons.set('TEK', {
      code: 'TEK',
      credits: 100,
      percentOff: null,
      maxRedemptions: 1,
      redeemed: 0,
      validUntil: null,
    });
    await e.svc.redeemCoupon('u1', 'tek');
    await expect(e.svc.redeemCoupon('u2', 'tek')).rejects.toMatchObject({ code: 'coupon_exhausted' });
    expect(e.store.coupons.get('TEK')?.redeemed).toBe(1);
  });

  it('webhook signature of the first order matches the documented format', () => {
    const body = {
      iyziEventType: 'subscription.order.success' as const,
      subscriptionReferenceCode: 's',
      orderReferenceCode: 'o',
      customerReferenceCode: 'c',
      iyziReferenceCode: 'r',
    };
    expect(webhookSignature(FAKE_CFG, body)).toMatch(/^[0-9a-f]{64}$/);
  });
});
