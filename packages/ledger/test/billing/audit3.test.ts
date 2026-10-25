/**
 * Third audit of 2026-10-25 (docs/denetim/defter-odeme.md "Üçüncü denetim"): one block per finding,
 * written before the fixes (memory store; PGlite variants in audit3-pg.test.ts).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { depsFromService } from '../../../../apps/worker-node/src/billing/deps.ts';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { HttpIyzico, IYZICO_SANDBOX_BASE_URL, IyzicoError } from '../../src/billing/iyzico.ts';
import { BillingService, type Buyer, type ConsentVersions } from '../../src/billing/service.ts';
import { MemoryBillingStore, MemoryLedgerPort } from '../../src/billing/store.ts';
import { addDays, addMonths } from '../../src/index.ts';

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
const plan = {
  preInfoConsentVersion: 'onb-1',
  distanceContractConsentVersion: 'abo-1',
  withdrawalWaiver: true,
  annualCommitmentVersion: 'abo-1',
};

function env() {
  let now = new Date('2026-10-20T09:00:00Z');
  const iyz = new FakeIyzico();
  iyz.now = () => now;
  const store = new MemoryBillingStore();
  const svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv: new FakeEArsiv(() => now),
    store,
    ledger: new MemoryLedgerPort(),
    consentVersions: V,
    now: () => now,
    newId: () => randomUUID(),
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  const token = (id: string) => store.orders.get(id)?.checkoutToken as string;
  return {
    iyz,
    store,
    svc,
    token,
    set: (d: Date) => {
      now = d;
    },
    get now() {
      return now;
    },
    async buy(extra: { couponCode?: string } = {}) {
      const s = await svc.startTopup(
        'u1',
        randomUUID(),
        { productCode: 'kredi.300', withdrawalWaiver: true, ...pack, ...extra },
        buyer,
      );
      return { ...s, token: token(s.orderId) };
    },
  };
}
const balance = async (e: ReturnType<typeof env>) => (await e.svc.wallet('u1')).balance;

describe('high', () => {
  it('Y-N5: a paid order in fraud review longer than 2 days stays inceleniyor and is credited on approval', async () => {
    const e = env();
    e.store.coupons.set('YUZDE50', {
      code: 'YUZDE50',
      credits: null,
      percentOff: 50,
      maxRedemptions: 1,
      redeemed: 0,
      validUntil: null,
    });
    e.iyz.nextFraudStatus = 0;
    const a = await e.buy({ couponCode: 'YUZDE50' });
    expect((await e.svc.completeCheckout(a.token)).status).toBe('inceleniyor');
    e.set(addDays(e.now, 3));
    await e.svc.recheckPendingOrders();
    expect(e.store.orders.get(a.orderId)?.status).toBe('inceleniyor');
    expect(e.store.coupons.get('YUZDE50')?.redeemed).toBe(1);
    e.iyz.decideFraud(a.token, 2);
    const pid = e.iyz.checkouts.get(a.token)?.paymentId;
    await e.svc.handleFraudNotification(JSON.stringify({ paymentId: Number(pid), fraudStatus: 2 }));
    expect(e.store.orders.get(a.orderId)?.status).toBe('odendi');
    expect(await balance(e)).toBe(300);
  });

  it.each(['10051', '10005'])(
    'Y-N6: declined card %s closes the order and gives the coupon back',
    async (errorCode) => {
      const fetchStub = (async (url: string) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith('/initialize/auth/ecom'))
          return new Response(
            JSON.stringify({
              status: 'success',
              token: 'tok-x',
              checkoutFormContent: '<script></script>',
              paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=tok-x',
            }),
          );
        return new Response(
          JSON.stringify({ status: 'failure', errorCode, paymentStatus: 'FAILURE', token: 'tok-x' }),
        );
      }) as unknown as typeof fetch;
      const store = new MemoryBillingStore();
      store.coupons.set('YUZDE50', {
        code: 'YUZDE50',
        credits: null,
        percentOff: 50,
        maxRedemptions: 1,
        redeemed: 0,
        validUntil: null,
      });
      const now = new Date('2026-10-20T09:00:00Z');
      const svc = new BillingService({
        iyzico: new HttpIyzico({ apiKey: 'k', secretKey: 's', baseUrl: IYZICO_SANDBOX_BASE_URL }, fetchStub),
        iyzicoCfg: { secretKey: 's', merchantId: 'm' },
        earsiv: new FakeEArsiv(() => now),
        store,
        ledger: new MemoryLedgerPort(),
        now: () => now,
        newId: randomUUID,
        callbackBaseUrl: 'https://k.test',
        webAddress: 'https://k.test',
      });
      const s = await svc.startTopup(
        'u1',
        randomUUID(),
        { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, ...pack },
        buyer,
      );
      expect((await svc.completeCheckout('tok-x')).status).toBe('basarisiz');
      expect(store.orders.get(s.orderId)?.status).toBe('basarisiz');
      expect(store.coupons.get('YUZDE50')?.redeemed).toBe(0);
    },
  );

  it('Y-N6: one failing re-query does not stop the daily chain; every step runs and failures are reported', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s = await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.yillik', ...plan },
      buyer,
    );
    const sub = await e.svc.completeSubscriptionCheckout(e.token(s.orderId));
    e.set(addDays(addMonths(sub.currentPeriodStart, 2), -1));
    const bad = await e.buy();
    const orig = e.iyz.retrieveCheckoutForm.bind(e.iyz);
    e.iyz.retrieveCheckoutForm = async (t: string) => {
      if (t === bad.token) throw new IyzicoError('/payment/iyzipos/checkoutform/auth/ecom/detail', false);
      return orig(t);
    };
    e.set(addDays(e.now, 1));
    const r = await depsFromService(e.svc, () => e.now).monthlyGrant();
    expect(e.store.subscriptions.get(sub.id)?.grantsDelivered).toBe(3);
    expect(r).toMatchObject({ granted: 2 });
    expect(e.store.alerts.map((a) => a.kind)).toContain('yeniden_sorgu_hatasi');
  });
});

describe('medium and low', () => {
  it('O-N3: an IFN body without a known paymentId triggers nothing', async () => {
    const e = env();
    e.iyz.nextFraudStatus = 0;
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    e.iyz.decideFraud(a.token, 2);
    let calls = 0;
    const orig = e.iyz.retrieveCheckoutForm.bind(e.iyz);
    e.iyz.retrieveCheckoutForm = async (t: string) => {
      calls++;
      return orig(t);
    };
    await e.svc.handleFraudNotification(JSON.stringify({ paymentConversationId: a.orderId }));
    await e.svc.handleFraudNotification(JSON.stringify({ paymentId: 99999999, fraudStatus: 2 }));
    expect(calls).toBe(0);
    expect(e.store.orders.get(a.orderId)?.status).toBe('inceleniyor');
  });

  it('D-N6: an unknown refund keeps the credits locked after 30 days and a late decision is consistent', async () => {
    const e = env();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    e.iyz.nextRefund = 'unknown';
    await expect(e.svc.requestRefund('u1', a.orderId)).rejects.toMatchObject({ code: 'refund_pending' });
    e.set(addDays(e.now, 31));
    expect(await balance(e)).toBe(0);
    await e.svc.resolvePendingRefund(`paket:${a.orderId}`, 'basarili', 'admin-1');
    expect(e.store.orders.get(a.orderId)?.status).toBe('iade_edildi');
    expect(await balance(e)).toBe(0);
  });

  it('D-N8: an abandoned subscription checkout and a failed card are modelled by the fake', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s = await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', ...plan },
      buyer,
    );
    e.iyz.abandonSubscriptionCheckout(e.token(s.orderId));
    await expect(e.svc.completeSubscriptionCheckout(e.token(s.orderId))).rejects.toMatchObject({
      code: 'subscription_failed',
    });
    expect(e.store.orders.get(s.orderId)?.status).toBe('bekliyor');
    e.iyz.nextOutcome = 'card_failure';
    const b = await e.buy();
    expect((await e.svc.completeCheckout(b.token)).status).toBe('basarisiz');
  });

  it('D-N9: cancellations older than 60 days are not queried again', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s = await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', ...plan },
      buyer,
    );
    const sub = await e.svc.completeSubscriptionCheckout(e.token(s.orderId));
    await e.svc.cancel('u1', sub.id, 'hemen');
    e.set(addDays(e.now, 61));
    let calls = 0;
    const orig = e.iyz.retrieveSubscription.bind(e.iyz);
    e.iyz.retrieveSubscription = async (r: string) => {
      calls++;
      return orig(r);
    };
    await e.svc.reconcileCancellations();
    expect(calls).toBe(0);
  });

  it('D-N1: no subscription consent row when the iyzico start fails', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    e.iyz.initSubscriptionCheckout = async () => {
      throw new Error('iyzico down');
    };
    await expect(
      e.svc.startSubscription('u1', randomUUID(), { planCode: 'ogrenci.aylik', ...plan }, buyer),
    ).rejects.toThrow();
    expect(e.store.consents).toHaveLength(0);
  });

  it('O9: deleted accounts with live subscriptions are canceled by the daily job when the hook failed', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s = await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', ...plan },
      buyer,
    );
    const sub = await e.svc.completeSubscriptionCheckout(e.token(s.orderId));
    e.store.deletedUsers.add('u1');
    expect(await e.svc.reconcileDeletedAccounts()).toBe(1);
    expect(e.store.subscriptions.get(sub.id)?.status).toBe('iptal');
    expect(e.iyz.subs.get(sub.providerRef)?.status).toBe('CANCELED');
  });
});

it('Y-N7: technical or unknown failure preserves paid fraud review until IFN approval', async () => {
  for (const code of ['100001', '1000', '10214', 'unknown']) {
    const e = env();
    e.iyz.nextFraudStatus = 0;
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    const retrieve = e.iyz.retrieveCheckoutForm.bind(e.iyz);
    e.iyz.retrieveCheckoutForm = async () => {
      throw new IyzicoError('/detail', true, code);
    };
    await e.svc.recheckPendingOrders();
    expect(e.store.orders.get(a.orderId)?.status).toBe('inceleniyor');
    expect(e.store.alerts.some((x) => x.kind === 'yeniden_sorgu_hatasi')).toBe(true);
    e.iyz.retrieveCheckoutForm = retrieve;
    e.iyz.decideFraud(a.token, 2);
    const pid = e.iyz.checkouts.get(a.token)?.paymentId;
    await e.svc.handleFraudNotification(JSON.stringify({ paymentId: Number(pid), fraudStatus: 2 }));
    expect(await balance(e)).toBe(300);
  }
});

it('O5: subscription consent rejects absent waiver and annual version and records accepted versions', async () => {
  const e = env();
  await e.svc.setupSubscriptionCatalog();
  await expect(
    e.svc.startSubscription(
      'u1',
      randomUUID(),
      { ...plan, planCode: 'ogrenci.aylik', withdrawalWaiver: undefined },
      buyer,
    ),
  ).rejects.toMatchObject({ code: 'withdrawal_waiver_required' });
  await expect(
    e.svc.startSubscription(
      'u1',
      randomUUID(),
      { ...plan, planCode: 'ogrenci.yillik', annualCommitmentVersion: 'stale' },
      buyer,
    ),
  ).rejects.toMatchObject({ code: 'annual_commitment_version_mismatch' });
  await expect(
    e.svc.startSubscription(
      'u1',
      randomUUID(),
      { ...plan, planCode: 'ogrenci.yillik', annualCommitmentVersion: undefined },
      buyer,
    ),
  ).rejects.toMatchObject({ code: 'annual_commitment_version_mismatch' });
  await e.svc.startSubscription('u1', randomUUID(), { ...plan, planCode: 'ogrenci.yillik' }, buyer);
  expect(e.store.consents.filter((c) => c.kind === 'cayma_istisnasi' && c.granted)).toHaveLength(1);
  expect(
    e.store.consents.filter((c) => c.kind === 'yillik_taahhutname' && c.version === 'abo-1'),
  ).toHaveLength(1);
});

it('D3: cancellation keys bind target and mode and replay the original result', async () => {
  const e = env();
  await e.svc.setupSubscriptionCatalog();
  const a = await e.svc.startSubscription('u1', randomUUID(), { ...plan, planCode: 'ogrenci.aylik' }, buyer);
  const sub = await e.svc.completeSubscriptionCheckout(e.token(a.orderId));
  const first = await e.svc.cancel('u1', sub.id, 'donem_sonu', 'cancel-key');
  expect(await e.svc.cancel('u1', sub.id, 'donem_sonu', 'cancel-key')).toEqual(first);
  await expect(e.svc.cancel('u1', sub.id, 'hemen', 'cancel-key')).rejects.toMatchObject({ status: 409 });
});
it('D3: refund key binds reason and order and concurrent repeats do not duplicate refunds', async () => {
  const e = env();
  const a = await e.buy();
  await e.svc.completeCheckout(a.token);
  const results = await Promise.allSettled([
    e.svc.requestRefund('u1', a.orderId, 'reason', 'refund-key'),
    e.svc.requestRefund('u1', a.orderId, 'reason', 'refund-key'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const first = results.find((r) => r.status === 'fulfilled');
  expect(await e.svc.requestRefund('u1', a.orderId, 'reason', 'refund-key')).toEqual(
    first?.status === 'fulfilled' ? first.value : null,
  );
  await expect(e.svc.requestRefund('u1', a.orderId, 'different', 'refund-key')).rejects.toMatchObject({
    status: 409,
  });
  expect(e.iyz.refunds).toHaveLength(1);
});
