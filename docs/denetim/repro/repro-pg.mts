import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
const R = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { BillingService } = await import(`${R}/billing/service.ts`);
const { PgBillingStore, PgLedgerPort } = await import(`${R}/billing/pg-store.ts`);
const { FakeIyzico, FAKE_CFG } = await import(`${R}/billing/fake-iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
const { PRICE_TABLE_V1, LedgerReservationsAdapter } = await import(`${R}/index.ts`);
const { withWallet, walletRunner } = await import(`${R}/pg.ts`);

const buyer = { id: 'u1', email: 'a@example.invalid', name: 'A', surname: 'B', identityNumber: '11111111111', ip: '127.0.0.1', city: 'Ankara', country: 'Turkey', address: 'x' };
const consents = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'mss-1' };

async function env() {
  const pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  const db = pg as any;
  const store = new PgBillingStore(db, (id: string) => `hash-${id}`);
  await store.ensureCatalog(PRICE_TABLE_V1);
  await pg.query("insert into roles (id, description) values ('plus', 'p'), ('akademisyen', 'a') on conflict do nothing");
  const { rows } = await pg.query<{ id: string }>("insert into users (email) values ('o@example.invalid') returning id");
  const userId = rows[0].id;
  let now = new Date('2026-10-20T09:00:00Z');
  const iyz = new FakeIyzico(); iyz.now = () => now;
  const earsiv = new FakeEArsiv(() => now);
  const ledger = new PgLedgerPort(db);
  const svc = new BillingService({ iyzico: iyz, iyzicoCfg: FAKE_CFG, earsiv, store, ledger, now: () => now, newId: () => randomUUID(), callbackBaseUrl: 'https://k.test', webAddress: 'https://k.test' });
  await svc.setupSubscriptionCatalog();
  return { pg, db, store, iyz, earsiv, ledger, svc, userId, setNow: (d: Date) => { now = d; }, getNow: () => now };
}

// A. Annual immediate cancel: e-Arsiv failure after the iyzico refund -> second cancel refunds again (PG store)
{
  const e = await env();
  const s = await e.svc.startSubscription(e.userId, 'key-aaaaaaaa', { planCode: 'ogrenci.yillik', ...consents }, buyer);
  const tok = (await e.store.getOrder(s.orderId)).checkoutToken;
  const sub = await e.svc.completeSubscriptionCheckout(tok);
  const orig = e.earsiv.issue.bind(e.earsiv);
  e.earsiv.issue = async () => { throw new Error('earsiv down'); };
  let first: any = null; try { await e.svc.cancel(e.userId, sub.id, 'hemen'); } catch (x: any) { first = x.message; }
  e.earsiv.issue = orig;
  const mid = await e.store.getSubscription(sub.id);
  let second: any = null; try { second = await e.svc.cancel(e.userId, sub.id, 'hemen'); } catch (x: any) { second = x.code ?? x.message; }
  const refundRows = (await e.pg.query("select count(*)::int n from payments where kind='iade'")).rows[0];
  console.log('A first cancel:', first, '| db status after failure:', mid.status, '| plan after failure:', await e.store.getPlan(e.userId), '| second cancel:', JSON.stringify(second), '| iyzico refunds:', e.iyz.refunds.map((r: any) => r.priceKurus), '| payments iade rows:', refundRows);
  await e.pg.close();
}

// B. Coupon replay on PG
{
  const e = await env();
  await e.pg.query("insert into coupons (code, percent_off) values ('YUZDE50', 50)");
  const a = await e.svc.startTopup(e.userId, 'key-cccccccc', { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout((await e.store.getOrder(a.orderId)).checkoutToken);
  let err: any = null;
  try { await e.svc.startTopup(e.userId, 'key-dddddddd', { productCode: 'kredi.3000', couponCode: 'YUZDE50', withdrawalWaiver: true, ...consents }, buyer); } catch (x: any) { err = x.code; }
  const r = await e.svc.startTopup(e.userId, 'key-dddddddd', { productCode: 'kredi.3000', withdrawalWaiver: true, ...consents }, buyer);
  const o = await e.svc.completeCheckout((await e.store.getOrder(r.orderId)).checkoutToken);
  const c = (await e.pg.query("select count(*)::int n from consents where context->>'orderId' = $1", [r.orderId])).rows[0];
  console.log('B second coupon use:', err, '| replay paid amount:', o.amountKurus, o.status, '| consents for order:', c, '| balance', (await e.svc.wallet(e.userId)).balance);
  await e.pg.close();
}

// C. Expired reservation settled late: release is rolled back, credits stay held
{
  const e = await env();
  const w = await e.store.walletOf(e.userId);
  const t0 = new Date('2026-10-20T09:00:00Z');
  await withWallet(e.db, w, (l: any) => l.grant({ key: 'g1', walletId: w, source: 'paket', credits: 10, originRef: 'o1', now: t0 }));
  let clock = t0;
  const adapter = new LedgerReservationsAdapter(walletRunner({ client: e.db }), () => w, () => clock);
  const { reservationId } = await adapter.reserve({ userId: e.userId, credits: 10, idempotencyKey: 'req-1' });
  clock = new Date(t0.getTime() + 6 * 60_000);
  let err: any = null; try { await adapter.consume(reservationId, 10); } catch (x: any) { err = x.code; }
  const st = (await e.pg.query("select status from reservations where operation_id='req-1'")).rows[0];
  let err2: any = null; try { await adapter.reserve({ userId: e.userId, credits: 5, idempotencyKey: 'req-2' }); } catch (x: any) { err2 = x.code; }
  console.log('C consume after 6 min:', err, '| reservation row:', st, '| new reserve of 5 with 10 credits owned:', err2);
  await e.pg.close();
}

// D. Same idempotency key after settle: second run is free
{
  const e = await env();
  const w = await e.store.walletOf(e.userId);
  const t0 = new Date('2026-10-20T09:00:00Z');
  await withWallet(e.db, w, (l: any) => l.grant({ key: 'g1', walletId: w, source: 'paket', credits: 100, originRef: 'o1', now: t0 }));
  const adapter = new LedgerReservationsAdapter(walletRunner({ client: e.db }), () => w, () => t0);
  const a = await adapter.reserve({ userId: e.userId, credits: 30, idempotencyKey: 'req-x' });
  await adapter.consume(a.reservationId, 30);
  const b = await adapter.reserve({ userId: e.userId, credits: 30, idempotencyKey: 'req-x' });
  await adapter.consume(b.reservationId, 30);
  await adapter.release(b.reservationId);
  const bal = (await e.pg.query('select balance_snapshot::int n from wallets where id=$1', [w])).rows[0];
  console.log('D two runs with same key charged total:', 100 - bal.n, '| second consume and release threw: no');
  await e.pg.close();
}

// E. ledger_transactions rows are mutable
{
  const e = await env();
  const w = await e.store.walletOf(e.userId);
  await withWallet(e.db, w, (l: any) => l.grant({ key: 'g1', walletId: w, source: 'paket', credits: 100, originRef: 'o1', now: new Date() }));
  let res = 'ok';
  try { await e.pg.query("update ledger_transactions set kind = 'iade', idempotency_key = 'changed', wallet_id = null"); } catch (x: any) { res = x.message; }
  const r = (await e.pg.query('select kind, idempotency_key from ledger_transactions')).rows;
  let res2 = 'ok';
  try { await e.pg.query("update credit_lots set remaining_credits = original_credits"); } catch (x: any) { res2 = x.message; }
  console.log('E update ledger_transactions:', res, JSON.stringify(r), '| update credit_lots:', res2);
  await e.pg.close();
}
