/** Audit findings that depend on Postgres behaviour (docs/denetim/defter-odeme.md, repro-pg.mts). */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { PgLedgerPort } from '../../src/billing/pg-store.ts';
import { HistoricalBillingService as BillingService, type Buyer } from './historical-subscription.ts';
import { LedgerReservationsAdapter } from '../../src/index.ts';
import { walletRunner, withWallet } from '../../src/pg.ts';
import { pgBillingEnv } from './pg-env.ts';

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
const pack = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'mss-1' };
const plan = {
  preInfoConsentVersion: 'onb-1',
  distanceContractConsentVersion: 'abo-1',
  withdrawalWaiver: true,
  annualCommitmentVersion: 'abo-1',
};

async function env() {
  const base = await pgBillingEnv();
  const now = new Date('2026-10-20T09:00:00Z');
  const iyz = new FakeIyzico();
  iyz.now = () => now;
  const earsiv = new FakeEArsiv(() => now);
  const svc = new BillingService({
    iyzico: iyz,
    iyzicoCfg: FAKE_CFG,
    earsiv,
    store: base.store,
    ledger: new PgLedgerPort(base.db),
    consentVersions: { on_bilgilendirme: 'onb-1', mesafeli_sozlesme: 'mss-1', abonelik_sozlesmesi: 'abo-1' },
    now: () => now,
    newId: randomUUID,
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  await svc.setupSubscriptionCatalog();
  return { ...base, iyz, earsiv, svc };
}

describe('audit on PGlite', () => {
  it('Y2: annual cancel with e-Arsiv down is stored as iptal and refunds once', async () => {
    const e = await env();
    const s = await e.svc.startSubscription(
      e.userId,
      'key-aaaaaaaa',
      { planCode: 'ogrenci.yillik', ...plan },
      buyer,
    );
    const sub = await e.svc.completeSubscriptionCheckout(
      (await e.store.getOrder(s.orderId))?.checkoutToken as string,
    );
    e.earsiv.issue = async () => {
      throw new Error('earsiv down');
    };
    await e.svc.cancel(e.userId, sub.id, 'hemen');
    expect((await e.store.getSubscription(sub.id))?.status).toBe('iptal');
    expect(await e.store.getPlan(e.userId)).toBe('ucretsiz');
    await e.svc.cancel(e.userId, sub.id, 'hemen');
    expect(e.iyz.refunds).toHaveLength(1);
    const rows = (await e.pg.query<{ status: string }>("select status from payments where kind = 'iade'"))
      .rows;
    expect(rows).toEqual([{ status: 'basarili' }]);
    await e.pg.close();
  }, 60_000);

  it('Y4: coupon replay is refused and every order has consents', async () => {
    const e = await env();
    await e.pg.query("insert into coupons (code, percent_off) values ('YUZDE50', 50)");
    const a = await e.svc.startTopup(
      e.userId,
      'key-cccccccc',
      { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...pack },
      buyer,
    );
    await e.svc.completeCheckout((await e.store.getOrder(a.orderId))?.checkoutToken as string);
    await expect(
      e.svc.startTopup(
        e.userId,
        'key-dddddddd',
        { productCode: 'kredi.3000', couponCode: 'YUZDE50', withdrawalWaiver: true, ...pack },
        buyer,
      ),
    ).rejects.toMatchObject({ code: 'coupon_already_used' });
    const missing = (
      await e.pg.query<{ n: number }>(
        "select count(*)::int n from orders o where not exists (select 1 from consents c where c.context->>'orderId' = o.id::text)",
      )
    ).rows[0]?.n;
    expect(missing).toBe(0);
    expect(
      (await e.pg.query<{ n: number }>("select redeemed n from coupons where code = 'YUZDE50'")).rows[0]?.n,
    ).toBe(1);
    await e.pg.close();
  }, 60_000);

  it('O1: a late settle releases the expired hold for good; Y7: a settled key is refused', async () => {
    const e = await env();
    const w = await e.store.walletOf(e.userId);
    const t0 = new Date('2026-10-20T09:00:00Z');
    await withWallet(e.db, w, (l) =>
      l.grant({ key: 'g1', walletId: w, source: 'paket', credits: 10, originRef: 'o1', now: t0 }),
    );
    let clock = t0;
    const adapter = new LedgerReservationsAdapter(
      walletRunner({ client: e.db }),
      () => w,
      () => clock,
    );
    const { reservationId } = await adapter.reserve({
      userId: e.userId,
      credits: 10,
      idempotencyKey: 'req-1',
    });
    clock = new Date(t0.getTime() + 6 * 60_000);
    await expect(adapter.consume(reservationId, 10)).rejects.toMatchObject({ code: 'reservation_expired' });
    expect((await e.pg.query("select status from reservations where operation_id = 'req-1'")).rows).toEqual([
      { status: 'cozuldu' },
    ]);
    await adapter.reserve({ userId: e.userId, credits: 5, idempotencyKey: 'req-2' });
    await expect(
      adapter.reserve({ userId: e.userId, credits: 5, idempotencyKey: 'req-1' }),
    ).rejects.toMatchObject({ code: 'already_settled' });
    await e.pg.close();
  }, 60_000);
});
