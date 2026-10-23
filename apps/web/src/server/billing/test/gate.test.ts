import { expect, it } from 'vitest';
import { canPay } from '../../../app/(odeme)/odeme/gate.ts';
import { checkoutRequest, nextStep } from '../../../app/(odeme)/odeme/submit.ts';

it('opens payment only after the confirmation and the withdrawal exception boxes', () => {
  expect(canPay({ kind: 'paket', confirmed: false, withdrawalWaiver: true })).toBe(false);
  expect(canPay({ kind: 'paket', confirmed: true, withdrawalWaiver: false })).toBe(false);
  expect(canPay({ kind: 'paket', confirmed: true, withdrawalWaiver: true })).toBe(true);
  expect(canPay({ kind: 'abonelik', confirmed: true, withdrawalWaiver: false })).toBe(false);
  expect(canPay({ kind: 'abonelik', confirmed: true, withdrawalWaiver: true })).toBe(true);
});

it('O6: posts the published versions with one Idempotency-Key and continues only to iyzico', () => {
  const r = checkoutRequest({
    kind: 'paket',
    code: 'kredi.300',
    versions: { preInfo: 'a', contract: 'b' },
    withdrawalWaiver: true,
    idempotencyKey: 'k-123456789',
  });
  expect(r.url).toBe('/api/v1/checkout/topup');
  expect(new Headers(r.init.headers).get('Idempotency-Key')).toBe('k-123456789');
  expect(JSON.parse(String(r.init.body))).toEqual({
    productCode: 'kredi.300',
    preInfoConsentVersion: 'a',
    distanceContractConsentVersion: 'b',
    withdrawalWaiver: true,
  });
  const s = checkoutRequest({
    kind: 'abonelik',
    code: 'ogrenci.aylik',
    versions: { preInfo: 'a', contract: 'c' },
    withdrawalWaiver: true,
    idempotencyKey: 'k',
  });
  expect(s.url).toBe('/api/v1/checkout/subscription');
  expect(nextStep({ paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/?token=t' })).toEqual({
    kind: 'redirect',
    url: 'https://sandbox-cpp.iyzipay.com/?token=t',
  });
  expect(
    nextStep({ paymentPageUrl: 'https://evil.example/x', checkoutFormContent: '<script></script>' }).kind,
  ).toBe('frame');
  expect(nextStep({}).kind).toBe('error');
  // D-N3: the hosted page address iyzico returns has no slash before the query.
  expect(nextStep({ paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=t' }).kind).toBe('redirect');
  expect(nextStep({ paymentPageUrl: 'https://iyzipay.com.evil.example/x' }).kind).toBe('error');
});

it('D-N4: production accepts only published legal texts as consent versions', async () => {
  const { consentVersionsFromContent } = await import('../context.ts');
  expect(consentVersionsFromContent('development')).not.toBeNull();
  // The payment texts are drafts (status taslak) until Tarik approves them.
  expect(consentVersionsFromContent('production')).toBeNull();
});
