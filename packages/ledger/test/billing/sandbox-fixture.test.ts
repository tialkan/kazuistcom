/**
 * Real iyzico sandbox answers of 2026-10-25 (fixtures/iyzico-sandbox.json: keys, types and enum values
 * only, no ids, keys or personal data). The fake and the service must read them the same way.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FakeEArsiv } from '../../src/billing/earsiv.ts';
import { FAKE_CFG, FakeIyzico } from '../../src/billing/fake-iyzico.ts';
import { HttpIyzico, IYZICO_SANDBOX_BASE_URL } from '../../src/billing/iyzico.ts';
import { BillingService } from '../../src/billing/service.ts';
import { MemoryBillingStore, MemoryLedgerPort } from '../../src/billing/store.ts';

type Shape = Record<string, unknown>;
const fx = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/iyzico-sandbox.json', import.meta.url)), 'utf8'),
) as { cases: Record<string, Shape> };
const buyer = {
  id: 'u1',
  email: 'a@kazuist.com',
  name: 'A',
  surname: 'B',
  identityNumber: '11111111111',
  ip: '127.0.0.1',
  city: 'Ankara',
  country: 'Turkey',
  address: 'x',
};
const pack = {
  preInfoConsentVersion: 'onb-1',
  distanceContractConsentVersion: 'mss-1',
  withdrawalWaiver: true,
};

function svcWith(detail: Shape) {
  const fetchStub = (async (url: string) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith('/initialize/auth/ecom'))
      return new Response(
        JSON.stringify({
          status: 'success',
          token: 'tok-x',
          checkoutFormContent: '<script></script>',
          paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=tok-x',
        }),
      );
    return new Response(JSON.stringify(detail));
  }) as unknown as typeof fetch;
  const store = new MemoryBillingStore();
  const now = new Date('2026-10-25T09:00:00Z');
  const svc = new BillingService({
    iyzico: new HttpIyzico({ apiKey: 'k', secretKey: 's', baseUrl: IYZICO_SANDBOX_BASE_URL }, fetchStub),
    iyzicoCfg: { secretKey: 's', merchantId: 'm' },
    earsiv: new FakeEArsiv(() => now),
    store,
    ledger: new MemoryLedgerPort(),
    now: () => now,
    newId: randomUUID,
    callbackBaseUrl: 'https://k.test',
    webAddress: 'https://k.test',
  });
  return { svc, store };
}

describe('iyzico sandbox answers', () => {
  it('records the documented error codes of the probed cases', () => {
    expect(fx.cases.checkoutDetailAbandoned).toMatchObject({ status: 'failure', errorCode: '5122' });
    expect(fx.cases.checkoutDetailUnknownToken).toMatchObject({ status: 'failure', errorCode: '5124' });
    expect(fx.cases.notSufficientFunds).toMatchObject({ status: 'failure', errorCode: '10051' });
    expect(fx.cases.doNotHonour).toMatchObject({ status: 'failure', errorCode: '10005' });
    expect(fx.cases.threeDsInitializeFailed).toMatchObject({ status: 'failure', errorCode: '5099' });
    expect(fx.cases.paymentSuccess).toMatchObject({
      status: 'success',
      fraudStatus: 1,
      currency: 'TRY',
      paymentId: 'string',
    });
    expect(fx.cases.refundPartial).toMatchObject({ status: 'success' });
  });

  it('an abandoned checkout token (5122) keeps the order waiting; a declined card (10051) fails it', async () => {
    const a = svcWith({ status: 'failure', errorCode: '5122', errorMessage: 'x' });
    const s1 = await a.svc.startTopup('u1', randomUUID(), { productCode: 'kredi.300', ...pack }, buyer);
    expect((await a.svc.completeCheckout('tok-x')).status).toBe('bekliyor');
    expect(a.store.orders.get(s1.orderId)?.status).toBe('bekliyor');
    const b = svcWith({ status: 'failure', errorCode: '10051', errorMessage: 'x' });
    await b.svc.startTopup('u1', randomUUID(), { productCode: 'kredi.300', ...pack }, buyer);
    expect((await b.svc.completeCheckout('tok-x')).status).toBe('basarisiz');
  });

  it('the fake answers an abandoned checkout like the sandbox', async () => {
    const iyz = new FakeIyzico();
    const store = new MemoryBillingStore();
    const svc = new BillingService({
      iyzico: iyz,
      iyzicoCfg: FAKE_CFG,
      earsiv: new FakeEArsiv(),
      store,
      ledger: new MemoryLedgerPort(),
      now: () => new Date(),
      newId: randomUUID,
      callbackBaseUrl: 'https://k.test',
      webAddress: 'https://k.test',
    });
    iyz.nextOutcome = 'abandoned';
    const s = await svc.startTopup('u1', randomUUID(), { productCode: 'kredi.300', ...pack }, buyer);
    expect((await svc.completeCheckout(store.orders.get(s.orderId)?.checkoutToken as string)).status).toBe(
      'bekliyor',
    );
  });
});
