/** Plan 9.5 acceptance scenarios that fall into Wave 1, against the fake iyzico; run per store. */
import { randomUUID } from 'node:crypto';
import { addDays, addMonths } from '../../src/index.ts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { BillingService, type Buyer } from '../../src/billing/service.ts';
import type { BillingStore, CouponRow, LedgerPort, Subscription } from '../../src/billing/store.ts';

export interface ScenarioEnv {
  store: BillingStore;
  ledger: LedgerPort;
  userId: string;
  consentKinds(): Promise<string[]>;
  alertCount(): Promise<number>;
  addCoupon(c: CouponRow): Promise<void>;
  close(): Promise<void>;
}

export function runScenarios(name: string, make: () => Promise<ScenarioEnv>) {
  describe(`9.5 Wave 1 scenarios (fake iyzico, ${name})`, () => {
    let U: string;
    let buyer: Buyer;
    const consents = {
      preInfoConsentVersion: 'onb-taslak-1',
      distanceContractConsentVersion: 'mss-taslak-1',
    };

    let env: ScenarioEnv;
    let now: Date;
    let iyz: FakeIyzico;
    let store: BillingStore;
    let ledger: LedgerPort;
    let earsiv: FakeEArsiv;
    let svc: BillingService;
    let seq = 0;

    beforeEach(async () => {
      env = await make();
      U = env.userId;
      buyer = {
        id: U,
        email: 'a@example.invalid',
        name: 'Ada',
        surname: 'Deneme',
        identityNumber: '11111111111',
        ip: '127.0.0.1',
        city: 'Ankara',
        country: 'Turkey',
        address: 'Test adresi',
      };
      now = new Date('2026-10-20T09:00:00Z');
      iyz = new FakeIyzico();
      iyz.now = () => now;
      store = env.store;
      ledger = env.ledger;
      earsiv = new FakeEArsiv(() => now);
      svc = new BillingService({
        iyzico: iyz,
        iyzicoCfg: FAKE_CFG,
        earsiv,
        store,
        ledger,
        now: () => now,
        newId: () => randomUUID(),
        callbackBaseUrl: 'https://kazuist.test',
        webAddress: 'https://kazuist.com',
      });
      await svc.setupSubscriptionCatalog();
    }, 60_000);

    afterEach(async () => {
      await env.close();
    });

    const cur = async (id: string) => (await store.getSubscription(id)) as Subscription;
    const tokenOf = async (orderId: string) => (await store.getOrder(orderId))?.checkoutToken as string;
    const balance = async () => (await svc.wallet(U)).balance;

    async function buyPack(code: 'kredi.300' | 'kredi.1000' | 'kredi.3000' = 'kredi.300') {
      const s = await svc.startTopup(
        U,
        `idem-${++seq}`,
        { productCode: code, withdrawalWaiver: true, ...consents },
        buyer,
      );
      const token = await tokenOf(s.orderId);
      return { ...s, token };
    }

    async function subscribe(
      planCode: 'ogrenci.aylik' | 'ogrenci.yillik' | 'akademisyen.aylik' | 'akademisyen.yillik',
    ) {
      const s = await svc.startSubscription(U, `idem-${++seq}`, { planCode, ...consents }, buyer);
      return svc.completeSubscriptionCheckout(await tokenOf(s.orderId));
    }

    it('package purchase: 3DS form, server re-query, ledger grant, e-Arsiv invoice, consents', async () => {
      const s = await buyPack('kredi.1000');
      expect(s.checkoutFormContent).toContain('iyzico');
      expect(await balance()).toBe(0);
      const order = await svc.completeCheckout(s.token);
      expect(order.status).toBe('odendi');
      expect(await balance()).toBe(1000);
      expect(earsiv.issued).toHaveLength(1);
      expect(earsiv.issued[0]).toMatchObject({ kind: 'satis', totalKurus: 10900 });
      expect((await env.consentKinds()).sort()).toEqual([
        'cayma_istisnasi',
        'mesafeli_sozlesme',
        'on_bilgilendirme',
      ]);
    });

    it('checkout is refused without the confirmation or the withdrawal exception box', async () => {
      await expect(
        svc.startTopup(
          U,
          'idem-x1',
          { productCode: 'kredi.300', withdrawalWaiver: false, ...consents },
          buyer,
        ),
      ).rejects.toMatchObject({ code: 'withdrawal_waiver_required' });
      await expect(
        svc.startTopup(
          U,
          'idem-x2',
          {
            productCode: 'kredi.300',
            withdrawalWaiver: true,
            preInfoConsentVersion: '',
            distanceContractConsentVersion: 'v',
          },
          buyer,
        ),
      ).rejects.toMatchObject({ code: 'consent_required' });
    });

    it('3DS failure: no credits, order failed', async () => {
      iyz.nextOutcome = 'threeds_failure';
      const s = await buyPack();
      expect((await svc.completeCheckout(s.token)).status).toBe('basarisiz');
      expect(await balance()).toBe(0);
      expect(earsiv.issued).toHaveLength(0);
    });

    it('double webhook: signature checked, processed once; bad signature rejected', async () => {
      const s = await buyPack();
      const { body, signature } = iyz.checkoutWebhook(s.token);
      const raw = JSON.stringify(body);
      expect((await svc.handleWebhook(raw, 'deadbeef')).status).toBe(401);
      expect(await svc.handleWebhook(raw, signature)).toEqual({ status: 200 });
      expect(await svc.handleWebhook(raw, signature)).toEqual({ status: 200, duplicate: true });
      // The callback arriving as well changes nothing.
      await svc.completeCheckout(s.token);
      expect(await balance()).toBe(300);
      expect(
        (await ledger.movements(await store.walletOf(U))).filter((t) => t.kind === 'yukleme'),
      ).toHaveLength(1);
    });

    it('subscription start, renewal, failed renewal with 3 retries, then Ucretsiz with credits kept', async () => {
      const sub = await subscribe('ogrenci.aylik');
      expect(await balance()).toBe(1000);
      expect((await store.listNotices(U)).some((n) => n.kind === 'odeme_7_gun')).toBe(true);

      now = sub.currentPeriodEnd;
      const ok = iyz.simulateRenewal(sub.providerRef, true);
      expect((await svc.handleWebhook(JSON.stringify(ok.body), ok.signature)).status).toBe(200);
      expect(await balance()).toBe(2000);

      now = (await cur(sub.id)).currentPeriodEnd;
      const fail = iyz.simulateRenewal(sub.providerRef, false);
      await svc.handleWebhook(JSON.stringify(fail.body), fail.signature);
      expect((await cur(sub.id)).status).toBe('odeme_bekliyor');
      const failedAt = now;
      for (const day of [1, 3]) {
        now = addDays(failedAt, day);
        await svc.runDunning();
      }
      expect((await cur(sub.id)).failedRetries).toBe(2);
      expect((await cur(sub.id)).status).toBe('odeme_bekliyor');
      // The third retry fails on day 7 and the plan drops in the same daily tick (D1).
      now = addDays(failedAt, 7);
      await svc.runDunning();
      expect((await cur(sub.id)).failedRetries).toBe(3);
      expect((await cur(sub.id)).status).toBe('sona_erdi');
      expect(await store.getPlan(U)).toBe('ucretsiz');
      expect(await balance()).toBe(2000);
    });

    it('a retry that succeeds restores the plan and grants the month', async () => {
      const sub = await subscribe('ogrenci.aylik');
      now = sub.currentPeriodEnd;
      const fail = iyz.simulateRenewal(sub.providerRef, false);
      await svc.handleWebhook(JSON.stringify(fail.body), fail.signature);
      iyz.retryOutcomes = ['failure', 'success'];
      const failedAt = now;
      now = addDays(failedAt, 1);
      await svc.runDunning();
      now = addDays(failedAt, 3);
      await svc.runDunning();
      expect((await cur(sub.id)).status).toBe('aktif');
      expect(await balance()).toBe(2000);
    });

    it('cancel at period end: access until the end, no more renewal notices', async () => {
      const sub = await subscribe('akademisyen.aylik');
      const r = await svc.cancel(U, sub.id, 'donem_sonu');
      expect(r).toMatchObject({ status: 'donem_sonunda_bitecek', refundAmountKurus: 0 });
      expect((await store.listNotices(U)).some((n) => n.kind === 'odeme_7_gun')).toBe(false);
      expect((await store.listNotices(U)).some((n) => n.kind === 'fesih_teyidi')).toBe(true);
      await svc.closeEndedPeriods();
      expect((await cur(sub.id)).status).toBe('aktif');
      now = sub.currentPeriodEnd;
      await svc.closeEndedPeriods();
      expect((await cur(sub.id)).status).toBe('sona_erdi');
      expect(await balance()).toBe(3000);
    });

    it('immediate cancel of an annual plan refunds paid minus granted months x paid annual price / 12 (karar 2026-10-22)', async () => {
      const sub = await subscribe('ogrenci.yillik');
      const start = sub.currentPeriodStart;
      now = addMonths(start, 2);
      expect(await svc.monthlyGrant()).toBe(2);
      expect(await svc.monthlyGrant()).toBe(0);
      expect((await cur(sub.id)).grantsDelivered).toBe(3);
      const r = await svc.cancel(U, sub.id, 'hemen');
      expect(r.refundAmountKurus).toBe(79900 - Math.floor((3 * 79900) / 12));
      expect(iyz.refunds.at(-1)).toMatchObject({ priceKurus: 59925 });
      expect(earsiv.issued.at(-1)).toMatchObject({ kind: 'iade', totalKurus: 59925 });
      expect(await balance()).toBe(3000);
    });

    it('immediate cancel of a monthly plan: no refund, credits stay', async () => {
      const sub = await subscribe('ogrenci.aylik');
      const r = await svc.cancel(U, sub.id, 'hemen');
      expect(r.refundAmountKurus).toBe(0);
      expect(await balance()).toBe(1000);
    });

    it('14 day refund of an unused package; used or late packages are refused', async () => {
      const a = await buyPack();
      await svc.completeCheckout(a.token);
      now = addDays(now, 13);
      expect(await svc.refundPackage(U, a.orderId)).toMatchObject({ refunded: true, amountKurus: 3900 });
      expect(await balance()).toBe(0);

      const b = await buyPack();
      await svc.completeCheckout(b.token);
      const w = await store.walletOf(U);
      await ledger.run(w, (l) => {
        l.reserve({ operationId: 'op', walletId: w, estimatedCredits: 2, now });
        l.settle({ walletId: w, operationId: 'op', outcome: 'tamam', actualCredits: 2, now });
      });
      await expect(svc.refundPackage(U, b.orderId)).rejects.toMatchObject({ code: 'not_refundable' });

      const c = await buyPack();
      await svc.completeCheckout(c.token);
      now = addDays(now, 15);
      await expect(svc.refundPackage(U, c.orderId)).rejects.toMatchObject({ code: 'not_refundable' });
    });

    it('price change notice: 30 days ahead, applies from the next eligible period', async () => {
      const sub = await subscribe('ogrenci.aylik');
      now = addDays(sub.currentPeriodStart, 10);
      expect(await svc.announcePriceChange('ogrenci.aylik', 11900)).toBe(1);
      const notice = (await store.listNotices(U)).find((n) => n.kind === 'fiyat_degisikligi');
      expect(notice).toBeDefined();
      expect((await cur(sub.id)).pendingPrice?.effectiveAt.getTime()).toBeGreaterThanOrEqual(
        addDays(now, 30).getTime(),
      );
      expect((await cur(sub.id)).pendingPrice?.effectiveAt.toISOString()).toBe(
        addMonths(sub.currentPeriodStart, 2).toISOString(),
      );
    });

    it('chargeback after spending drives the balance below zero and blocks new AI work', async () => {
      const s = await buyPack();
      await svc.completeCheckout(s.token);
      const w = await store.walletOf(U);
      now = new Date(now.getTime() + 1000);
      await ledger.run(w, (l) => {
        l.reserve({ operationId: 'op', walletId: w, estimatedCredits: 100, now });
        l.settle({ walletId: w, operationId: 'op', outcome: 'tamam', actualCredits: 100, now });
      });
      now = new Date(now.getTime() + 1000);
      expect(await svc.chargeback(s.orderId, 'case-1')).toBe(-100);
      expect(await svc.chargeback(s.orderId, 'case-1')).toBe(-100);
      await expect(
        ledger.run(w, (l) => l.reserve({ operationId: 'op2', walletId: w, estimatedCredits: 1, now })),
      ).rejects.toThrow('negative_balance');
      const m = await svc.movements(U);
      expect(m.map((x) => x.kind)).toEqual(['ters_kayit', 'tuketim', 'yukleme']);
    });

    it('daily reconciliation flags differences between iyzico and the records', async () => {
      const s = await buyPack();
      await svc.completeCheckout(s.token);
      expect(await svc.reconcileDay(now)).toEqual({ disabled: false, diffs: [] });
      iyz.transactions.push({
        paymentId: 'ghost',
        conversationId: null,
        amountKurus: 100,
        kind: 'odeme',
        at: now,
      });
      const { diffs } = await svc.reconcileDay(now);
      expect(diffs).toMatchObject([{ paymentId: 'ghost', problem: 'kayitta_yok' }]);
      expect(await env.alertCount()).toBe(1);
    });

    it('credit coupon grants a 90 day promo lot once per user', async () => {
      await env.addCoupon({
        code: 'ASBU2026',
        credits: 200,
        percentOff: null,
        maxRedemptions: 100,
        redeemed: 0,
        validUntil: null,
      });
      await svc.redeemCoupon(U, 'asbu2026');
      await svc.redeemCoupon(U, 'ASBU2026');
      const w = await svc.wallet(U);
      expect(w.balance).toBe(200);
      expect(w.lots[0]?.expiresAt).toBe(addDays(now, 90).toISOString());
    });
  });
}
