/**
 * Re-audit of 2026-10-22 (docs/denetim/defter-odeme.md, "Yeniden denetim"): one block per finding, written
 * before the fixes. Memory store; the Postgres variants are in audit2-pg.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
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

function env() {
  let now = new Date('2026-10-20T09:00:00Z');
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
  const token = (id: string) => store.orders.get(id)?.checkoutToken as string;
  return {
    iyz,
    store,
    ledger,
    earsiv,
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
    async subscribe(planCode: string) {
      await svc.setupSubscriptionCatalog();
      const s = await svc.startSubscription('u1', randomUUID(), { planCode, ...plan }, buyer);
      return svc.completeSubscriptionCheckout(token(s.orderId));
    },
  };
}
const balance = async (e: ReturnType<typeof env>) => (await e.svc.wallet('u1')).balance;

describe('high', () => {
  it('Y-N1: annual immediate cancel with a failed iyzico cancel opens the refund row and refunds on retry', async () => {
    const e = env();
    const sub = await e.subscribe('ogrenci.yillik');
    e.iyz.failNextCancel = 'unknown';
    await expect(e.svc.cancel('u1', sub.id, 'hemen')).rejects.toMatchObject({ code: 'cancel_failed' });
    expect(e.store.payments.filter((p) => p.kind === 'iade')).toHaveLength(1);
    const second = await e.svc.cancel('u1', sub.id, 'hemen');
    expect(second.refundAmountKurus).toBe(70000);
    expect(e.iyz.refunds.map((r) => r.priceKurus)).toEqual([70000]);
    expect(e.iyz.subs.get(sub.providerRef)?.status).toBe('CANCELED');
  });

  it('Y-N2: a period end cancel whose iyzico call failed is retried, also by the daily job', async () => {
    const e = env();
    const sub = await e.subscribe('ogrenci.aylik');
    e.iyz.failNextCancel = 'unknown';
    await expect(e.svc.cancel('u1', sub.id, 'donem_sonu')).rejects.toMatchObject({ code: 'cancel_failed' });
    await e.svc.cancel('u1', sub.id, 'donem_sonu');
    expect(e.iyz.subs.get(sub.providerRef)?.status).toBe('CANCELED');

    const f = env();
    const s2 = await f.subscribe('ogrenci.aylik');
    f.iyz.failNextCancel = 'unknown';
    await expect(f.svc.cancel('u1', s2.id, 'donem_sonu')).rejects.toMatchObject({ code: 'cancel_failed' });
    await f.svc.reconcileCancellations();
    expect(f.iyz.subs.get(s2.providerRef)?.status).toBe('CANCELED');
  });

  it('Y-N2: account deletion keeps going when one iyzico cancel fails and the daily job finishes it', async () => {
    const e = env();
    const sub = await e.subscribe('ogrenci.aylik');
    e.iyz.failNextCancel = 'unknown';
    expect(await e.svc.onAccountDeletion('u1')).toMatchObject({ canceled: 1 });
    expect(e.store.subscriptions.get(sub.id)?.status).toBe('iptal');
    expect(e.iyz.subs.get(sub.providerRef)?.status).toBe('ACTIVE');
    await e.svc.reconcileCancellations();
    expect(e.iyz.subs.get(sub.providerRef)?.status).toBe('CANCELED');
  });

  it('Y-N3: fraudStatus 0 then 2 (approved after review) grants once through the recheck job or the IFN trigger', async () => {
    const e = env();
    e.iyz.nextFraudStatus = 0;
    const a = await e.buy();
    expect((await e.svc.completeCheckout(a.token)).status).toBe('bekliyor');
    e.iyz.decideFraud(a.token, 2);
    expect(await e.svc.recheckPendingOrders()).toBe(1);
    expect(await balance(e)).toBe(300);

    e.iyz.nextFraudStatus = 0;
    const b = await e.buy();
    await e.svc.completeCheckout(b.token);
    e.iyz.decideFraud(b.token, 2);
    // The IFN body is only a trigger: the state is re-queried at iyzico.
    expect(
      (await e.svc.handleFraudNotification(JSON.stringify(e.iyz.fraudNotification(b.token)))).status,
    ).toBe(200);
    expect(await balance(e)).toBe(600);
    expect((await e.svc.handleFraudNotification('{"paymentConversationId":"nope"}')).status).toBe(200);
  });

  it('Y-N4: a paid subscription without the browser callback is opened by the webhook or the recheck job', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    const s = await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', ...plan },
      buyer,
    );
    const r = await e.iyz.retrieveSubscriptionCheckout(e.token(s.orderId));
    const wh = e.iyz.initialOrderWebhook(r.subscriptionReferenceCode as string);
    expect((await e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature)).status).toBe(200);
    expect([...e.store.subscriptions.values()]).toHaveLength(1);
    expect(await balance(e)).toBe(1000);

    const f = env();
    await f.svc.setupSubscriptionCatalog();
    const s2 = await f.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', ...plan },
      buyer,
    );
    await f.iyz.retrieveSubscriptionCheckout(f.token(s2.orderId));
    expect(await f.svc.recheckPendingOrders()).toBe(1);
    expect([...f.store.subscriptions.values()]).toHaveLength(1);
  });
});

describe('medium', () => {
  it('O-N1: an unknown refund outcome keeps the credits locked until an administrator resolves it', async () => {
    const e = env();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    e.iyz.nextRefund = 'unknown';
    await expect(e.svc.requestRefund('u1', a.orderId)).rejects.toMatchObject({ code: 'refund_pending' });
    e.set(addDays(e.now, 1));
    expect(await balance(e)).toBe(0);
    const pending = await e.svc.listPendingRefunds();
    expect(pending).toHaveLength(1);
    await e.svc.resolvePendingRefund(pending[0]?.refundRef as string, 'basarili');
    expect(await balance(e)).toBe(0);
    expect(e.store.orders.get(a.orderId)?.status).toBe('iade_edildi');
    expect(await e.svc.listPendingRefunds()).toHaveLength(0);

    const f = env();
    const b = await f.buy();
    await f.svc.completeCheckout(b.token);
    f.iyz.nextRefund = 'unknown';
    await expect(f.svc.requestRefund('u1', b.orderId)).rejects.toMatchObject({ code: 'refund_pending' });
    const [p] = await f.svc.listPendingRefunds();
    await f.svc.resolvePendingRefund(p?.refundRef as string, 'basarisiz');
    expect(await balance(f)).toBe(300);
  });

  it('O-N2: a failed payment gives the coupon use back', async () => {
    const e = env();
    e.store.coupons.set('YUZDE50', {
      code: 'YUZDE50',
      credits: null,
      percentOff: 50,
      maxRedemptions: 1,
      redeemed: 0,
      validUntil: null,
    });
    e.iyz.nextOutcome = 'threeds_failure';
    const a = await e.buy({ couponCode: 'YUZDE50' });
    expect((await e.svc.completeCheckout(a.token)).status).toBe('basarisiz');
    expect(e.store.coupons.get('YUZDE50')?.redeemed).toBe(0);
    const b = await e.buy({ couponCode: 'YUZDE50' });
    expect(b.orderId).toBeTruthy();
  });
});

describe('low', () => {
  it('D-N1: no consent row is left when the iyzico start fails', async () => {
    const e = env();
    e.iyz.initCheckoutForm = async () => {
      throw new Error('iyzico down');
    };
    await expect(e.buy()).rejects.toThrow();
    expect(e.store.consents).toHaveLength(0);
  });

  it('D-N5: a refund call slower than 5 minutes keeps the hold', async () => {
    const e = env();
    const a = await e.buy();
    await e.svc.completeCheckout(a.token);
    const orig = e.iyz.refund.bind(e.iyz);
    e.iyz.refund = async (p) => {
      e.set(new Date(e.now.getTime() + 6 * 60_000));
      await e.svc.wallet('u1');
      return orig(p);
    };
    expect(await e.svc.refundPackage('u1', a.orderId)).toMatchObject({ refunded: true });
    expect(await balance(e)).toBe(0);
  });

  it('Y7: two runs of one open reservation are charged once and the second consume is refused', async () => {
    const l = new Ledger();
    l.grant({ key: 'g', walletId: 'w', source: 'paket', credits: 100, originRef: 'o', now: new Date() });
    const a = new LedgerReservationsAdapter(memoryRunner(l), () => 'w');
    const r1 = await a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-same' });
    const r2 = await a.reserve({ userId: 'u', credits: 30, idempotencyKey: 'req-same' });
    await a.consume(r1.reservationId, 30);
    await expect(a.consume(r2.reservationId, 30)).rejects.toMatchObject({ code: 'already_settled' });
  });

  it('Y5: notices carry the amount, the date and the cancel mode for the text', async () => {
    const e = env();
    const sub = await e.subscribe('ogrenci.aylik');
    const n7 = e.store.notices.find((n) => n.kind === 'odeme_7_gun');
    expect(n7?.ref).toContain(':9900:');
    await e.svc.cancel('u1', sub.id, 'donem_sonu');
    expect(e.store.notices.find((n) => n.kind === 'fesih_teyidi')?.ref).toContain(':donem_sonu:');
  });

  it('O5: the subscription step records the withdrawal exception consent', async () => {
    const e = env();
    await e.svc.setupSubscriptionCatalog();
    await e.svc.startSubscription(
      'u1',
      randomUUID(),
      { planCode: 'ogrenci.aylik', withdrawalWaiver: true, ...plan },
      buyer,
    );
    expect(e.store.consents.map((c) => c.kind)).toContain('cayma_istisnasi');
  });

  it('karar 2026-10-22: unused first subscription period refunded in full within 14 days', async () => {
    const e = env();
    const sub = await e.subscribe('ogrenci.aylik');
    const order = [...e.store.orders.values()].find((o) => o.productCode === 'ogrenci.aylik');
    e.set(addDays(e.now, 10));
    expect(await e.svc.requestRefund('u1', order?.id as string)).toMatchObject({
      status: 'tamamlandi',
      amountKurus: 9900,
    });
    expect(e.iyz.refunds.map((r) => r.priceKurus)).toEqual([9900]);
    expect(e.store.subscriptions.get(sub.id)?.status).toBe('iptal');
    expect(await balance(e)).toBe(0);
  });
});
