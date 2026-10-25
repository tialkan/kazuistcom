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
const { PRICE_TABLE_V1, addDays, addMonths } = await import(`${R}/index.ts`);
const { depsFromService } = await import('/Users/baris/Documents/GitHub/Kazuist/apps/worker-node/src/billing/deps.ts');

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
const alerts = async (e: any) => (await e.pg.query("select action from audit_log where action like 'billing.%' order by created_at")).rows.map((r: any) => r.action).join(',');

// R1: fraud review longer than 2 days: recheck fails the paid order; approval (2) afterwards never credits
{
  const e = await env();
  e.iyz.nextFraudStatus = 0;
  const s = await e.svc.startTopup(e.userId, 'key-r1aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  const tok = (await e.store.getOrder(s.orderId)).checkoutToken;
  await e.svc.completeCheckout(tok);
  e.setNow(addDays(e.getNow(), 3));
  await e.svc.recheckPendingOrders();
  const st1 = (await e.store.getOrder(s.orderId)).status;
  e.iyz.decideFraud(tok, 2);
  e.setNow(addDays(e.getNow(), 1));
  await e.svc.recheckPendingOrders();
  await e.svc.handleFraudNotification(JSON.stringify(e.iyz.fraudNotification(tok)));
  console.log('R1 order after 3 days in review:', st1, '| after approval (2) + recheck + IFN:', (await e.store.getOrder(s.orderId)).status, '| balance:', (await e.svc.wallet(e.userId)).balance, '| charged at iyzico:', e.iyz.transactions.filter((t: any) => t.kind === 'odeme').length);
  await e.pg.close();
}

// R2: one pending order whose re-query throws IyzicoError stops the whole daily billing chain
{
  const e = await env();
  const sub = await (async () => { const s = await e.svc.startSubscription(e.userId, 'key-r2subbbb', { planCode: 'ogrenci.yillik', ...consents }, buyer); return e.svc.completeSubscriptionCheckout((await e.store.getOrder(s.orderId)).checkoutToken); })();
  e.setNow(addDays(addMonths(sub.currentPeriodStart, 2), -1));
  const s = await e.svc.startTopup(e.userId, 'key-r2aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer); // abandoned checkout
  const badTok = (await e.store.getOrder(s.orderId)).checkoutToken;
  const orig = e.iyz.retrieveCheckoutForm.bind(e.iyz);
  e.iyz.retrieveCheckoutForm = async (t: string) => { if (t === badTok) throw new IyzicoError('/payment/iyzipos/checkoutform/auth/ecom/detail', false); return orig(t); };
  const deps = depsFromService(e.svc, () => e.getNow());
  const t1 = e.getNow();
  const results: string[] = [];
  for (const d of [1, 3, 6]) {
    e.setNow(addDays(t1, d));
    try { await deps.monthlyGrant(); results.push('ok'); } catch (x: any) { results.push(x.name); }
  }
  const grants = (await e.store.getSubscription(sub.id)).grantsDelivered;
  e.setNow(addDays(t1, 8));
  try { await deps.monthlyGrant(); results.push('ok'); } catch (x: any) { results.push(x.name); }
  console.log('R2 daily job results (day 1,3,6,8):', results.join(','), '| annual grants by day 6 (expected 3):', grants, '| after day 8:', (await e.store.getSubscription(sub.id)).grantsDelivered);
  await e.pg.close();
}

// R3: IFN with the documented body {paymentId, fraudStatus} is ignored; an unauthenticated body with an order id triggers a re-query
{
  const e = await env();
  e.iyz.nextFraudStatus = 0;
  const s = await e.svc.startTopup(e.userId, 'key-r3aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  const tok = (await e.store.getOrder(s.orderId)).checkoutToken;
  await e.svc.completeCheckout(tok);
  e.iyz.decideFraud(tok, 2);
  let calls = 0; const orig = e.iyz.retrieveCheckoutForm.bind(e.iyz); e.iyz.retrieveCheckoutForm = async (t: string) => { calls++; return orig(t); };
  const pid = e.iyz.checkouts.get(tok).paymentId;
  const r1 = await e.svc.handleFraudNotification(JSON.stringify({ paymentId: Number(pid), fraudStatus: 2 }));
  const afterDoc = (await e.store.getOrder(s.orderId)).status;
  const r2 = await e.svc.handleFraudNotification(JSON.stringify({ paymentConversationId: s.orderId }));
  console.log('R3 documented IFN body ->', JSON.stringify(r1), 'order', afterDoc, 'iyzico calls', calls, '| body with order id only (no auth) ->', JSON.stringify(r2), 'order', (await e.store.getOrder(s.orderId)).status, 'iyzico calls', calls);
  await e.pg.close();
}

// R4: refund outcome unknown, administrator resolves after the 30 day hold expired
{
  const e = await env();
  const s = await e.svc.startTopup(e.userId, 'key-r4aaaaaa', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout((await e.store.getOrder(s.orderId)).checkoutToken);
  e.iyz.nextRefund = 'unknown';
  try { await e.svc.requestRefund(e.userId, s.orderId); } catch {}
  e.setNow(addDays(e.getNow(), 31));
  const bal31 = (await e.svc.wallet(e.userId)).balance;
  let err: any = null; try { await e.svc.resolvePendingRefund(`paket:${s.orderId}`, 'basarili', 'admin-1'); } catch (x: any) { err = x.code ?? x.name; }
  const row = (await e.pg.query("select status from payments where kind='iade'")).rows[0];
  console.log('R4 balance after 31 days (refund unresolved):', bal31, '| admin resolve basarili:', err, '| refund row:', row.status, '| order:', (await e.store.getOrder(s.orderId)).status, '| balance:', (await e.svc.wallet(e.userId)).balance, '| money refunded:', e.iyz.refunds.length);
  await e.pg.close();
}

// R5: first period subscription refund when the iyzico cancel fails
{
  const e = await env();
  const s = await e.svc.startSubscription(e.userId, 'key-r5aaaaaa', { planCode: 'ogrenci.aylik', ...consents }, buyer);
  const sub = await e.svc.completeSubscriptionCheckout((await e.store.getOrder(s.orderId)).checkoutToken);
  e.setNow(addDays(e.getNow(), 2));
  e.iyz.failNextCancel = 'definite';
  let r1: any = null; try { r1 = await e.svc.requestRefund(e.userId, s.orderId); } catch (x: any) { r1 = x.code; }
  const st = await e.store.getSubscription(sub.id);
  const plan = await e.store.getPlan(e.userId);
  const n1 = (await e.store.listNotices(e.userId)).filter((n: any) => n.kind === 'fesih_teyidi').length;
  let r2: any = null; try { r2 = await e.svc.requestRefund(e.userId, s.orderId); } catch (x: any) { r2 = x.code; }
  const n2 = (await e.store.listNotices(e.userId)).filter((n: any) => n.kind === 'fesih_teyidi').length;
  console.log('R5 first:', JSON.stringify(r1), '| sub', st.status, 'plan', plan, '| retry:', JSON.stringify(r2), '| refunds', e.iyz.refunds.length, '| fesih_teyidi notices', n1, '->', n2, '| balance', (await e.svc.wallet(e.userId)).balance);
  await e.pg.close();
}

// R6: new annual formula values
{
  const { annualRefundKurus } = await import(`${R}/rules.ts`);
  console.log('R6 ogrenci.yillik 79900:', [1, 3, 6, 12].map((m) => `${m}ay=${annualRefundKurus({ paidKurus: 79900, grantedMonths: m })}`).join(' '), '| akademisyen 199000:', [1, 11].map((m) => `${m}ay=${annualRefundKurus({ paidKurus: 199000, grantedMonths: m })}`).join(' '));
}
