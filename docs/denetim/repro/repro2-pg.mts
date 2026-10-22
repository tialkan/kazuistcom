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
const { IyzicoError } = await import(`${R}/billing/iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
const { PRICE_TABLE_V1, addMonths } = await import(`${R}/index.ts`);

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
const failCancelOnce = (iyz: any) => { const orig = iyz.cancelSubscription.bind(iyz); let n = 0; iyz.cancelSubscription = async (r: string) => { if (n++ === 0) throw new IyzicoError('/v2/subscription/subscriptions/cancel', false); return orig(r); }; };
async function subscribe(e: any, plan: string, key: string) {
  const s = await e.svc.startSubscription(e.userId, key, { planCode: plan, ...consents }, buyer);
  return e.svc.completeSubscriptionCheckout((await e.store.getOrder(s.orderId)).checkoutToken);
}

// N1: annual 'hemen' cancel, iyzico cancel call fails once (timeout) -> retry never refunds
{
  const e = await env();
  const sub = await subscribe(e, 'ogrenci.yillik', 'key-n1aaaaaa');
  failCancelOnce(e.iyz);
  let first: any = null; try { await e.svc.cancel(e.userId, sub.id, 'hemen'); } catch (x: any) { first = x.code ?? x.name; }
  const second = await e.svc.cancel(e.userId, sub.id, 'hemen');
  const rows = (await e.pg.query("select count(*)::int n from payments where kind='iade'")).rows[0];
  console.log('N1 first:', first, '| retry:', JSON.stringify(second), '| iyzico refunds:', e.iyz.refunds.length, '| iade rows:', rows.n, '| expected refund: 70000');
  await e.pg.close();
}

// N2: 'donem_sonu' cancel, iyzico cancel fails once -> retry returns early, iyzico stays ACTIVE, next renewal charges
{
  const e = await env();
  const sub = await subscribe(e, 'ogrenci.aylik', 'key-n2aaaaaa');
  failCancelOnce(e.iyz);
  let first: any = null; try { await e.svc.cancel(e.userId, sub.id, 'donem_sonu'); } catch (x: any) { first = x.code ?? x.name; }
  const second = await e.svc.cancel(e.userId, sub.id, 'donem_sonu');
  const iyzStatus = e.iyz.subs.get(sub.providerRef).status;
  e.setNow(sub.currentPeriodEnd);
  const ren = e.iyz.simulateRenewal(sub.providerRef, true);
  await e.svc.handleWebhook(JSON.stringify(ren.body), ren.signature);
  const charges = (await e.pg.query("select count(*)::int n from payments where kind='odeme'")).rows[0].n;
  const alerts = (await e.pg.query("select action from audit_log where action like 'billing.%'")).rows.map((r: any) => r.action);
  console.log('N2 first:', first, '| retry:', JSON.stringify(second), '| iyzico sub status after retry:', iyzStatus, '| charges after period end:', charges, '| alerts:', alerts.join(','));
  await e.pg.close();
}

// N3: fraudStatus 0 then iyzico approves after review (IFN value 2): credits never granted
{
  const e = await env();
  e.iyz.nextFraudStatus = 0;
  const s = await e.svc.startTopup(e.userId, 'key-n3aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  const tok = (await e.store.getOrder(s.orderId)).checkoutToken;
  const o1 = await e.svc.completeCheckout(tok);
  e.iyz.checkouts.get(tok).fraudStatus = 2; // docs.iyzico.com fraud notifications: 2 = approved after review
  const wh = e.iyz.checkoutWebhook(tok);
  await e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature);
  const o2 = await e.svc.completeCheckout(tok);
  console.log('N3 after review approved (2): order', o1.status, '->', o2.status, '| balance', (await e.svc.wallet(e.userId)).balance, '| provider transactions (charged):', e.iyz.transactions.length);
  await e.pg.close();
}

// N4: coupon burned by a failed 3DS payment; slot consumed by abandoned checkout
{
  const e = await env();
  await e.pg.query("insert into coupons (code, percent_off, max_redemptions) values ('YUZDE50', 50, 1)");
  e.iyz.nextOutcome = 'threeds_failure';
  const a = await e.svc.startTopup(e.userId, 'key-n4aaaaaa', { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, ...consents }, buyer);
  const oa = await e.svc.completeCheckout((await e.store.getOrder(a.orderId)).checkoutToken);
  let retry: any = null; try { await e.svc.startTopup(e.userId, 'key-n4bbbbbb', { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, ...consents }, buyer); } catch (x: any) { retry = x.code; }
  let replay: any = null; try { await e.svc.startTopup(e.userId, 'key-n4aaaaaa', { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, ...consents }, buyer); } catch (x: any) { replay = x.code; }
  const c = (await e.pg.query("select redeemed from coupons where code='YUZDE50'")).rows[0];
  console.log('N4 first order:', oa.status, '| retry with new key:', retry, '| replay same key:', replay, '| coupon redeemed counter:', c.redeemed);
  await e.pg.close();
}

// N5: refund outcome unknown (timeout after iyzico refunded): credits back to spendable, no resolver
{
  const e = await env();
  const s = await e.svc.startTopup(e.userId, 'key-n5aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout((await e.store.getOrder(s.orderId)).checkoutToken);
  e.iyz.nextRefund = 'unknown';
  let r1: any = null; try { await e.svc.requestRefund(e.userId, s.orderId); } catch (x: any) { r1 = x.code; }
  let r2: any = null; try { await e.svc.requestRefund(e.userId, s.orderId); } catch (x: any) { r2 = x.code; }
  const w = await e.svc.wallet(e.userId);
  const pay = (await e.pg.query("select kind, status from payments order by kind")).rows;
  const rr = (await e.pg.query("select status from refund_requests")).rows;
  console.log('N5 refund:', r1, '| again:', r2, '| money refunded at iyzico:', e.iyz.refunds.length, '| spendable balance:', w.balance, '| payments:', JSON.stringify(pay), '| refund_requests:', JSON.stringify(rr));
  await e.pg.close();
}

// N6: subscription paid at iyzico but the browser callback never arrives: the webhook cannot activate it
{
  const e = await env();
  const s = await e.svc.startSubscription(e.userId, 'key-n6aaaaaa', { planCode: 'ogrenci.aylik', ...consents }, buyer);
  const tok = (await e.store.getOrder(s.orderId)).checkoutToken;
  const r = await e.iyz.retrieveSubscriptionCheckout(tok); // iyzico side: subscription created and first order charged
  const wh = e.iyz.initialOrderWebhook(r.subscriptionReferenceCode);
  let res: any = null; for (let i = 0; i < 3; i++) { try { res = await e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature); } catch (x: any) { res = x.code ?? x.name; } }
  const subs = (await e.pg.query('select count(*)::int n from subscriptions')).rows[0].n;
  console.log('N6 webhook x3 result:', JSON.stringify(res), '| local subscriptions:', subs, '| balance:', (await e.svc.wallet(e.userId)).balance, '| order:', (await e.store.getOrder(s.orderId)).status, '| charged at iyzico:', e.iyz.transactions.length);
  await e.pg.close();
}

// A again (old Y2) and B (old Y4), C (O1), E (D6) from repro-pg
{
  const e = await env();
  const sub = await subscribe(e, 'ogrenci.yillik', 'key-aaaaaaaa');
  const orig = e.earsiv.issue.bind(e.earsiv);
  e.earsiv.issue = async () => { throw new Error('earsiv down'); };
  let first: any = null; try { await e.svc.cancel(e.userId, sub.id, 'hemen'); } catch (x: any) { first = x.message; }
  e.earsiv.issue = orig;
  let second: any = null; try { second = await e.svc.cancel(e.userId, sub.id, 'hemen'); } catch (x: any) { second = x.code ?? x.message; }
  const alerts = (await e.pg.query("select action from audit_log where action like 'billing.%'")).rows.map((r: any) => r.action);
  console.log('A first:', first, '| second:', JSON.stringify(second), '| iyzico refunds:', e.iyz.refunds.map((r: any) => r.priceKurus), '| alerts:', alerts.join(','));
  await e.pg.close();
}
{
  const e = await env();
  const { withWallet } = await import(`${R}/pg.ts`);
  const w = await e.store.walletOf(e.userId);
  await withWallet(e.db, w, (l: any) => l.grant({ key: 'g1', walletId: w, source: 'paket', credits: 100, originRef: 'o1', now: new Date() }));
  let res = 'ok'; try { await e.pg.query("update ledger_transactions set kind = 'iade', idempotency_key = 'changed'"); } catch (x: any) { res = x.message; }
  console.log('E update ledger_transactions:', res);
  await e.pg.close();
}
