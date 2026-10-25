const R = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { BillingService } = await import(`${R}/billing/service.ts`);
const { MemoryBillingStore, MemoryLedgerPort } = await import(`${R}/billing/store.ts`);
const { HttpIyzico, IYZICO_SANDBOX_BASE_URL } = await import(`${R}/billing/iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
// No network: fetch stub. Checkout form init succeeds; the detail query answers status failure (failed card).
const fetchStub = (async (url: string) => {
  const path = new URL(String(url)).pathname;
  if (path.endsWith('/initialize/auth/ecom'))
    return new Response(JSON.stringify({ status: 'success', token: 'tok-x', checkoutFormContent: '<script></script>', paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=tok-x' }));
  return new Response(JSON.stringify({ status: 'failure', errorCode: '10051', errorMessage: 'Kart limiti yetersiz', paymentStatus: 'FAILURE', token: 'tok-x' }));
}) as unknown as typeof fetch;
const iyz = new HttpIyzico({ apiKey: 'k', secretKey: 's', baseUrl: IYZICO_SANDBOX_BASE_URL }, fetchStub);
const store = new MemoryBillingStore();
store.coupons.set('YUZDE50', { code: 'YUZDE50', credits: null, percentOff: 50, maxRedemptions: 1, redeemed: 0, validUntil: null });
let now = new Date('2026-10-20T09:00:00Z');
const svc = new BillingService({ iyzico: iyz, iyzicoCfg: { secretKey: 's', merchantId: 'm' }, earsiv: new FakeEArsiv(() => now), store, ledger: new MemoryLedgerPort(), now: () => now, newId: () => crypto.randomUUID(), callbackBaseUrl: 'https://k.test', webAddress: 'https://k.test' });
const buyer = { id: 'u1', email: 'a@example.invalid', name: 'A', surname: 'B', identityNumber: '11111111111', ip: '127.0.0.1', city: 'Ankara', country: 'Turkey', address: 'x' };
const s = await svc.startTopup('u1', 'key-http0001', { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, preInfoConsentVersion: 'a', distanceContractConsentVersion: 'b' }, buyer);
let e1: any = null; try { await svc.completeCheckout('tok-x'); } catch (x: any) { e1 = `${x.name} definite=${x.definite}`; }
now = new Date(now.getTime() + 3 * 86_400_000);
let e2: any = null; try { await svc.recheckPendingOrders(); } catch (x: any) { e2 = x.name; }
let e3: any = null; try { await svc.startTopup('u1', 'key-http0002', { productCode: 'kredi.300', couponCode: 'YUZDE50', withdrawalWaiver: true, preInfoConsentVersion: 'a', distanceContractConsentVersion: 'b' }, buyer); } catch (x: any) { e3 = x.code; }
console.log('callback on failed card:', e1, '| recheck after 3 days:', e2, '| order:', store.orders.get(s.orderId).status, '| coupon reuse:', e3);
