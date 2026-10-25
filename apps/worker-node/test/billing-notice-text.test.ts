import { expect, it } from 'vitest';
import { renderBillingNotice } from '../src/billing/notice-text.ts';

it('Y5: renewal, price and cancellation notices carry amount, date and the right cancel text', () => {
  const sub = '6f1c2c0e-0000-4000-8000-000000000001';
  const r7 = renderBillingNotice(`odeme_7_gun:${sub}:9900:2026-11-20T09:00:00.000Z`);
  expect(r7?.body).toContain('99,00 TL');
  expect(r7?.body).toContain('20 Kasım 2026');
  expect(renderBillingNotice(`fesih_teyidi:${sub}:donem_sonu:2026-11-20T09:00:00.000Z`)?.body).toContain(
    'dönemin sonunda',
  );
  expect(renderBillingNotice(`fesih_teyidi:${sub}:hemen:2026-10-21T09:00:00.000Z`)?.title).toBe(
    'Aboneliğiniz sona erdi',
  );
  expect(renderBillingNotice(`odeme_alindi:${sub}:3900`)?.body).toContain('39,00 TL');
  expect(renderBillingNotice('odeme_7_gun:x:abc:not-a-date')).toBeNull();
  expect(renderBillingNotice('baska:1')).toBeNull();
});

it('Y5: the contract notice makes no PDF promise until the PDF exists', () => {
  expect(renderBillingNotice('sozlesme:order-1')?.body).not.toMatch(/PDF/);
});
