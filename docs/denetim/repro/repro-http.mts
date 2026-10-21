const R = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { BillingService } = await import(`${R}/billing/service.ts`);
const { MemoryBillingStore, MemoryLedgerPort } = await import(`${R}/billing/store.ts`);
const { HttpIyzico, IYZICO_SANDBOX_BASE_URL } = await import(`${R}/billing/iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
// Response shaped as docs.iyzico.com describes the subscription detail (orders[].orderStatus, paymentAttempts[].paymentStatus/paymentId)
const calls: string[] = [];
const fetchStub = (async (url: string) => {
  calls.push(String(url));
  return new Response(JSON.stringify({ status: 'success', data: { items: [{ referenceCode: 'SUBREF', subscriptionStatus: 'ACTIVE', pricingPlanReferenceCode: 'PLAN',
    orders: [{ referenceCode: 'ORD-2', price: 99.0, currencyCode: 'TRY', startPeriod: 0, endPeriod: 0, orderStatus: 'SUCCESS',
      paymentAttempts: [{ conversationId: 'c', createdDate: 0, paymentStatus: 'SUCCESS', paymentId: '24680' }] }] }] } }), { status: 200 });
}) as unknown as typeof fetch;
const iyz = new HttpIyzico({ apiKey: 'k', secretKey: 's', baseUrl: IYZICO_SANDBOX_BASE_URL }, fetchStub);
const store = new MemoryBillingStore();
const now = new Date('2026-11-20T09:00:00Z');
const svc = new BillingService({ iyzico: iyz, iyzicoCfg: { secretKey: 's' }, earsiv: new FakeEArsiv(() => now), store, ledger: new MemoryLedgerPort(), now: () => now, newId: () => crypto.randomUUID(), callbackBaseUrl: 'https://k.test', webAddress: 'https://k.test' });
await store.saveSubscription({ id: 'sub-1', userId: 'u1', planCode: 'ogrenci.aylik', providerRef: 'SUBREF', status: 'aktif', priceKurus: 9900,
  currentPeriodStart: new Date('2026-10-20T09:00:00Z'), currentPeriodEnd: now, cancelAtPeriodEnd: false, canceledAt: null, grantsDelivered: 1,
  lastPaymentId: 'subpay-SUBREF-1', firstFailureAt: null, failedRetries: 0, failedOrderRef: null, pendingPrice: null });
const s = await svc.onSubscriptionOrder('SUBREF', 'ORD-2');
console.log('successful iyzico order (orderStatus SUCCESS) handled as:', s.status, '| failedOrderRef:', s.failedOrderRef, '| notices:', store.notices.map(n => n.kind), '| calls:', calls.map(u => new URL(u).pathname));
