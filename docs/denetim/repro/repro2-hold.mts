import { randomUUID } from 'node:crypto';
const R = '/Users/baris/Documents/GitHub/Kazuist/packages/ledger/src';
const { BillingService } = await import(`${R}/billing/service.ts`);
const { MemoryBillingStore, MemoryLedgerPort } = await import(`${R}/billing/store.ts`);
const { FakeIyzico, FAKE_CFG } = await import(`${R}/billing/fake-iyzico.ts`);
const { FakeEArsiv } = await import(`${R}/billing/earsiv.ts`);
const buyer = { id: 'u1', email: 'a@example.invalid', name: 'A', surname: 'B', identityNumber: '11111111111', ip: '127.0.0.1', city: 'Ankara', country: 'Turkey', address: 'x' };
let now = new Date('2026-10-20T09:00:00Z');
const iyz = new FakeIyzico(); iyz.now = () => now;
const store = new MemoryBillingStore();
const svc = new BillingService({ iyzico: iyz, iyzicoCfg: FAKE_CFG, earsiv: new FakeEArsiv(() => now), store, ledger: new MemoryLedgerPort(), now: () => now, newId: () => randomUUID(), callbackBaseUrl: 'https://k.test', webAddress: 'https://k.test' });
const s = await svc.startTopup('u1', 'key-hold0001', { productCode: 'kredi.300', withdrawalWaiver: true, preInfoConsentVersion: 'a', distanceContractConsentVersion: 'b' }, buyer);
await svc.completeCheckout(store.orders.get(s.orderId).checkoutToken);
const orig = iyz.refund.bind(iyz);
iyz.refund = async (p: any) => { now = new Date(now.getTime() + 6 * 60_000); await svc.wallet('u1'); return orig(p); }; // slow provider; user opens the wallet meanwhile
let err: any = null; try { await svc.refundPackage('u1', s.orderId); } catch (x: any) { err = x.code; }
console.log('slow refund (>5 min):', err, '| money refunded:', iyz.refunds.length, '| order:', store.orders.get(s.orderId).status, '| balance:', (await svc.wallet('u1')).balance);
