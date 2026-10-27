import { expect, it } from 'vitest';
import { BillingService, type BillingDeps, type Buyer } from '../../src/billing/service.ts';
import { PRICE_TABLE_V1 } from '../../src/index.ts';
it('rejects every new subscription before replay, persistence or provider access', async () => {
  const deps = new Proxy(
    {},
    {
      get() {
        throw new Error('side effect before sale rejection');
      },
    },
  ) as BillingDeps;
  const service = new BillingService(deps);
  for (const planCode of [
    'ogrenci.aylik',
    'ogrenci.yillik',
    'akademisyen.aylik',
    'akademisyen.yillik',
    'unknown',
  ])
    await expect(
      service.startSubscription(
        'user',
        'existing-or-new-key',
        { planCode, preInfoConsentVersion: '', distanceContractConsentVersion: '' },
        {} as Buyer,
      ),
    ).rejects.toMatchObject({ status: 409, code: 'subscription_sales_closed' });
});
it('advertises credit packs while preserving the immutable historical subscription catalog', () => {
  const service = new BillingService({ now: () => new Date('2026-10-27T00:00:00Z') } as BillingDeps);
  expect(service.prices().products).toHaveLength(3);
  expect(service.prices().products.every((p) => p.kind === 'paket')).toBe(true);
  expect(PRICE_TABLE_V1.products.filter((p) => p.kind === 'abonelik')).toHaveLength(4);
});
