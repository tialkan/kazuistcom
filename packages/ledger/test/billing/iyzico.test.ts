import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HttpIyzico,
  authorizationHeader,
  verifyWebhookSignature,
  webhookSignature,
} from '../../src/billing/iyzico.ts';

describe('iyzico auth and signatures (docs.iyzico.com, 2026-10-19)', () => {
  it('builds IYZWSv2 header from HMAC-SHA256(randomKey + path + body)', () => {
    const cfg = { apiKey: 'k', secretKey: 's' };
    const h = authorizationHeader(cfg, '/payment/test', '{"a":1}', 'r1');
    const sig = createHmac('sha256', 's').update('r1/payment/test{"a":1}').digest('hex');
    expect(h).toBe(`IYZWSv2 ${Buffer.from(`apiKey:k&randomKey:r1&signature:${sig}`).toString('base64')}`);
  });

  it('verifies HPP and subscription webhook signatures in the documented order', () => {
    const cfg = { secretKey: 'sec', merchantId: 'm1' };
    const hpp = {
      iyziEventType: 'CHECKOUT_FORM_AUTH',
      iyziPaymentId: 42,
      token: 't',
      paymentConversationId: 'c',
      status: 'SUCCESS',
      iyziReferenceCode: 'r',
    };
    expect(webhookSignature(cfg, hpp)).toBe(
      createHmac('sha256', 'sec').update('secCHECKOUT_FORM_AUTH42tcSUCCESS').digest('hex'),
    );
    const sub = {
      iyziEventType: 'subscription.order.success' as const,
      subscriptionReferenceCode: 's',
      orderReferenceCode: 'o',
      customerReferenceCode: 'cu',
      iyziReferenceCode: 'r',
    };
    const sig = createHmac('sha256', 'sec').update('m1secsubscription.order.successsocu').digest('hex');
    expect(verifyWebhookSignature(cfg, sub, sig)).toBe(true);
    expect(verifyWebhookSignature(cfg, sub, (sig.startsWith('a') ? 'b' : 'a') + sig.slice(1))).toBe(false);
    expect(verifyWebhookSignature(cfg, sub, null)).toBe(false);
  });

  it('refuses non sandbox hosts', () => {
    expect(() => new HttpIyzico({ apiKey: 'a', secretKey: 'b', baseUrl: 'https://api.iyzipay.com' })).toThrow(
      /sandbox/,
    );
  });
});
