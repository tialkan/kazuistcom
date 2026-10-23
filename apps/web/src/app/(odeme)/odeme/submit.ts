/**
 * Checkout request of the payment step (O6): the accepted text versions come from content/hukuki through
 * the page, the Idempotency-Key is created once per page view so a double click opens one order.
 */
import type { CheckoutKind } from './gate.ts';

export interface PaymentVersions {
  preInfo: string;
  contract: string;
}

export function checkoutRequest(p: {
  kind: CheckoutKind;
  code: string;
  versions: PaymentVersions;
  withdrawalWaiver: boolean;
  idempotencyKey: string;
}): { url: string; init: RequestInit } {
  const body =
    p.kind === 'paket'
      ? {
          productCode: p.code,
          preInfoConsentVersion: p.versions.preInfo,
          distanceContractConsentVersion: p.versions.contract,
          withdrawalWaiver: p.withdrawalWaiver,
        }
      : {
          planCode: p.code,
          preInfoConsentVersion: p.versions.preInfo,
          distanceContractConsentVersion: p.versions.contract,
        };
  return {
    url: p.kind === 'paket' ? '/api/v1/checkout/topup' : '/api/v1/checkout/subscription',
    init: {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': p.idempotencyKey },
      body: JSON.stringify(body),
    },
  };
}

/** Where the browser goes next: iyzico's hosted page when given, otherwise the form content in a frame. */
export function nextStep(session: {
  paymentPageUrl?: string | null;
  checkoutFormContent?: string;
}): { kind: 'redirect'; url: string } | { kind: 'frame'; html: string } | { kind: 'error' } {
  const url = session.paymentPageUrl;
  if (url && /^https:\/\/([a-z0-9-]+\.)*iyzipay\.com([/?#]|$)/.test(url)) return { kind: 'redirect', url };
  if (session.checkoutFormContent) return { kind: 'frame', html: session.checkoutFormContent };
  return { kind: 'error' };
}
