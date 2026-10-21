import { randomUUID } from 'node:crypto';
const R = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { BillingService } = await import(`${R}/billing/service.ts`);
const { MemoryBillingStore, MemoryLedgerPort } = await import(`${R}/billing/store.ts`);
const { FakeIyzico, FAKE_CFG } = await import(`${R}/billing/fake-iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
const { addDays, addMonths } = await import(`${R}/index.ts`);

const buyer = { id: 'u1', email: 'a@example.invalid', name: 'A', surname: 'B', identityNumber: '11111111111', ip: '127.0.0.1', city: 'Ankara', country: 'Turkey', address: 'x' };
const consents = { preInfoConsentVersion: 'onb-1', distanceContractConsentVersion: 'mss-1' };

function env() {
  let now = new Date('2026-10-20T09:00:00Z');
  const iyz = new FakeIyzico(); iyz.now = () => now;
  const store = new MemoryBillingStore();
  const ledger = new MemoryLedgerPort();
  const earsiv = new FakeEArsiv(() => now);
  const svc = new BillingService({ iyzico: iyz, iyzicoCfg: FAKE_CFG, earsiv, store, ledger, now: () => now, newId: () => randomUUID(), callbackBaseUrl: 'https://k.test', webAddress: 'https://k.test' });
  return { iyz, store, ledger, earsiv, svc, setNow: (d: Date) => { now = d; }, getNow: () => now };
}

// 1. Coupon reuse via idempotent replay after coupon_already_used
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  e.store.coupons.set('YUZDE50', { code: 'YUZDE50', credits: null, percentOff: 50, maxRedemptions: null, redeemed: 0, validUntil: null });
  const a = await e.svc.startTopup('u1', 'key-aaaaaaaa', { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout(e.store.orders.get(a.orderId).checkoutToken);
  let err = null;
  try { await e.svc.startTopup('u1', 'key-bbbbbbbb', { productCode: 'kredi.3000', couponCode: 'yuzde50', withdrawalWaiver: true, ...consents }, buyer); } catch (x) { err = x.code; }
  const replay = await e.svc.startTopup('u1', 'key-bbbbbbbb', { productCode: 'kredi.3000', withdrawalWaiver: true, ...consents }, buyer);
  const o2 = e.store.orders.get(replay.orderId);
  await e.svc.completeCheckout(o2.checkoutToken);
  const consentsForO2 = e.store.consents.filter((c) => c.context.orderId === replay.orderId).length;
  console.log('1 coupon second use error:', err, '| replay order amount:', o2.amountKurus, 'status:', e.store.orders.get(replay.orderId).status, '| consents rows for that order:', consentsForO2, '| balance:', (await e.svc.wallet('u1')).balance);
}

// 2. Package refund: provider refund failure after ledger reversal
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const a = await e.svc.startTopup('u1', 'key-cccccccc', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout(e.store.orders.get(a.orderId).checkoutToken);
  const orig = e.iyz.refund.bind(e.iyz);
  e.iyz.refund = async () => { throw new Error('iyzico /v2/payment/refund failed'); };
  let first = null; try { await e.svc.refundPackage('u1', a.orderId); } catch (x) { first = x.message; }
  e.iyz.refund = orig;
  let second = null; try { await e.svc.refundPackage('u1', a.orderId); } catch (x) { second = x.code; }
  console.log('2 refund first:', first, '| retry:', second, '| order status:', e.store.orders.get(a.orderId).status, '| balance:', (await e.svc.wallet('u1')).balance, '| refunds at iyzico:', e.iyz.refunds.length);
}

// 3. Chargeback after a completed package refund creates debt
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const a = await e.svc.startTopup('u1', 'key-dddddddd', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  await e.svc.completeCheckout(e.store.orders.get(a.orderId).checkoutToken);
  await e.svc.refundPackage('u1', a.orderId);
  const bal = await e.svc.chargeback(a.orderId, 'case-9');
  const bal2 = await e.svc.chargeback(a.orderId, 'case-10');
  console.log('3 balance after refund+chargeback:', bal, '| after a second case ref:', bal2);
}

// 4. Dunning retries a subscription the user canceled (donem_sonu while odeme_bekliyor)
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const s = await e.svc.startSubscription('u1', 'key-eeeeeeee', { planCode: 'ogrenci.aylik', ...consents }, buyer);
  const sub = await e.svc.completeSubscriptionCheckout(e.store.orders.get(s.orderId).checkoutToken);
  e.setNow(sub.currentPeriodEnd);
  const fail = e.iyz.simulateRenewal(sub.providerRef, false);
  await e.svc.handleWebhook(JSON.stringify(fail.body), fail.signature);
  await e.svc.cancel('u1', sub.id, 'donem_sonu');
  let retries = 0; const orig = e.iyz.retrySubscriptionOrder.bind(e.iyz);
  e.iyz.retrySubscriptionOrder = async (r) => { retries++; return orig(r); };
  const failedAt = e.getNow();
  for (const d of [1, 3, 7, 8]) { e.setNow(addDays(failedAt, d)); await e.svc.closeEndedPeriods(); await e.svc.runDunning(); }
  console.log('4 retries after cancel:', retries, '| final status:', e.store.subscriptions.get(sub.id).status);
  // and a successful retry after cancel
  const e2 = env(); await e2.svc.setupSubscriptionCatalog();
  const s2 = await e2.svc.startSubscription('u1', 'key-ffffffff', { planCode: 'ogrenci.aylik', ...consents }, buyer);
  const sub2 = await e2.svc.completeSubscriptionCheckout(e2.store.orders.get(s2.orderId).checkoutToken);
  e2.setNow(sub2.currentPeriodEnd);
  const f2 = e2.iyz.simulateRenewal(sub2.providerRef, false);
  await e2.svc.handleWebhook(JSON.stringify(f2.body), f2.signature);
  await e2.svc.cancel('u1', sub2.id, 'donem_sonu');
  e2.iyz.retryOutcomes = ['success'];
  const fa2 = e2.getNow(); e2.setNow(addDays(fa2, 1)); await e2.svc.runDunning();
  const st = e2.store.subscriptions.get(sub2.id);
  console.log('4b after cancel + successful retry: status', st.status, 'cancelAtPeriodEnd', st.cancelAtPeriodEnd, 'payments', e2.store.payments.filter(p=>p.kind==='odeme').length, 'balance', (await e2.svc.wallet('u1')).balance, 'plan', await e2.store.getPlan('u1'));
}

// 5. Annual cancel 'hemen': e-Arsiv failure after iyzico refund -> second cancel refunds again
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const s = await e.svc.startSubscription('u1', 'key-gggggggg', { planCode: 'ogrenci.yillik', ...consents }, buyer);
  const sub = await e.svc.completeSubscriptionCheckout(e.store.orders.get(s.orderId).checkoutToken);
  const origIssue = e.earsiv.issue.bind(e.earsiv);
  e.earsiv.issue = async () => { throw new Error('earsiv down'); };
  let first = null; try { await e.svc.cancel('u1', sub.id, 'hemen'); } catch (x) { first = x.message; }
  e.earsiv.issue = origIssue;
  let second = null; try { second = await e.svc.cancel('u1', sub.id, 'hemen'); } catch (x) { second = x.code; }
  console.log('5 first cancel:', first, '| second cancel:', JSON.stringify(second), '| iyzico refunds:', e.iyz.refunds.map(r => r.priceKurus), '| refundRef used:', e.store.payments.filter(p=>p.kind==='iade').map(p=>p.refundRef), '| iyzico paymentId used for refund:', e.iyz.refunds.map(r=>r.paymentId));
}

// 6. Webhook for the initial subscription order (if iyzico sends one) is treated as a renewal
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const s = await e.svc.startSubscription('u1', 'key-hhhhhhhh', { planCode: 'ogrenci.aylik', ...consents }, buyer);
  const sub = await e.svc.completeSubscriptionCheckout(e.store.orders.get(s.orderId).checkoutToken);
  const fsub = e.iyz.subs.get(sub.providerRef);
  const firstOrder = fsub.orders[0].referenceCode;
  const { webhookSignature } = await import(`${R}/billing/iyzico.ts`);
  const body = { iyziEventType: 'subscription.order.success', subscriptionReferenceCode: fsub.ref, orderReferenceCode: firstOrder, customerReferenceCode: fsub.customerRef, iyziReferenceCode: 'evt-initial' };
  await e.svc.handleWebhook(JSON.stringify(body), webhookSignature(FAKE_CFG, body));
  const st = e.store.subscriptions.get(sub.id);
  console.log('6 after initial-order webhook: balance', (await e.svc.wallet('u1')).balance, '| period', sub.currentPeriodStart.toISOString(), '->', st.currentPeriodEnd.toISOString(), '| charges', e.store.payments.filter(p=>p.kind==='odeme').length, '| invoices', e.earsiv.issued.length);
}

// 7. Concurrent callback + webhook: invoices issued
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const a = await e.svc.startTopup('u1', 'key-iiiiiiii', { productCode: 'kredi.300', withdrawalWaiver: true, ...consents }, buyer);
  const tok = e.store.orders.get(a.orderId).checkoutToken;
  const wh = e.iyz.checkoutWebhook(tok);
  await Promise.all([e.svc.completeCheckout(tok), e.svc.handleWebhook(JSON.stringify(wh.body), wh.signature)]);
  console.log('7 concurrent callback+webhook: invoices', e.earsiv.issued.length, '| odeme_alindi notices', e.store.notices.filter(n=>n.kind==='odeme_alindi').length, '| balance', (await e.svc.wallet('u1')).balance);
}

// 8. Subscription checkout: no withdrawal waiver consent recorded; versions reuse
{
  const e = env(); await e.svc.setupSubscriptionCatalog();
  const s = await e.svc.startSubscription('u1', 'key-jjjjjjjj', { planCode: 'ogrenci.yillik', ...consents }, buyer);
  console.log('8 subscription consents:', e.store.consents.map(c => `${c.kind}@${c.version}`).join(', '));
  const t = await e.svc.startTopup('u1', 'key-kkkkkkkk', { productCode: 'kredi.300', withdrawalWaiver: true, preInfoConsentVersion: 'anything', distanceContractConsentVersion: 'x' }, buyer);
  console.log('8b topup accepted arbitrary versions:', e.store.consents.filter(c=>c.context.orderId===t.orderId).map(c => `${c.kind}@${c.version}`).join(', '));
}
