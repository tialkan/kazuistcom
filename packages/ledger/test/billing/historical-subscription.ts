/** Historical checkout fixture only. Production subscription sales are permanently closed by ADR-0029.
 * Preserves existing renewal/cancellation/refund regression setup without any production flag or bypass.
 */
import { createHash } from 'node:crypto';
import { BillingService, BillingError, type BillingDeps, type Buyer } from '../../src/billing/service.ts';
import { findProduct, type PriceTable } from '../../src/index.ts';
import type { BillingStore, Consent, Order, PreparedLegalDocument } from '../../src/billing/store.ts';
export { BillingError };
export type { Buyer, ConsentVersions } from '../../src/billing/service.ts';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
interface HistoricalContext {
  d: BillingDeps;
  s: BillingStore;
  replay(
    userId: string,
    key: string,
    hash: string,
  ): Promise<{ orderId: string; checkoutFormContent: string; paymentPageUrl: string | null } | null>;
  table(at?: Date): PriceTable;
  checkVersions(preInfo: string, contract: string, kind: 'abonelik_sozlesmesi'): void;
  consents(
    userId: string,
    items: [Consent['kind'], string, boolean][],
    context: Record<string, string>,
  ): Consent[];
  saveCheckout(order: Order, consents: Consent[], documents: readonly PreparedLegalDocument[]): Promise<void>;
  notify(userId: string, kind: string, at: Date, ref: string): Promise<void>;
}
export class HistoricalBillingService extends BillingService {
  override async startSubscription(
    userId: string,
    idempotencyKey: string,
    input: {
      planCode: string;
      couponCode?: string;
      preInfoConsentVersion: string;
      distanceContractConsentVersion: string;
      withdrawalWaiver?: boolean;
      annualCommitmentVersion?: string;
    },
    buyer: Buyer,
  ) {
    const fixture = this as unknown as HistoricalContext;
    const requestHash = hash({
      p: input.planCode,
      c: input.couponCode ?? null,
      v: [input.preInfoConsentVersion, input.distanceContractConsentVersion],
      w: input.withdrawalWaiver ?? null,
      annual: input.annualCommitmentVersion ?? null,
    });
    const again = await fixture.replay(userId, idempotencyKey, requestHash);
    if (again) return again;
    // Coupons on plans are not defined yet (O5): refuse instead of silently ignoring.
    if (input.couponCode) throw new BillingError(400, 'coupon_not_supported');
    const product = findProduct(fixture.table(), input.planCode);
    const planRef = (await fixture.s.planRefs(fixture.table().version)).get(input.planCode);
    if (!product || product.kind !== 'abonelik' || !planRef) throw new BillingError(400, 'unknown_plan');
    fixture.checkVersions(
      input.preInfoConsentVersion,
      input.distanceContractConsentVersion,
      'abonelik_sozlesmesi',
    );
    if (!input.withdrawalWaiver) throw new BillingError(400, 'withdrawal_waiver_required');
    if (
      product.interval === 'yillik' &&
      input.annualCommitmentVersion !== input.distanceContractConsentVersion
    )
      throw new BillingError(400, 'annual_commitment_version_mismatch');
    const orderId = fixture.d.newId();
    // The annual commitment is an integral section of the same published abonelik text.
    // Subscription step: abonelik_sozlesmesi, yillik_taahhutname for annual plans (ADR-0023) and the
    // withdrawal exception box until Tarik decides the unused first period case.
    const items: [Consent['kind'], string, boolean][] = [
      ['on_bilgilendirme', input.preInfoConsentVersion, true],
      ['abonelik_sozlesmesi', input.distanceContractConsentVersion, true],
    ];
    if (product.interval === 'yillik')
      items.push(['yillik_taahhutname', input.annualCommitmentVersion as string, true]);
    items.push(['cayma_istisnasi', input.distanceContractConsentVersion, true]);
    const order: Order = {
      id: orderId,
      userId,
      productCode: product.code,
      couponCode: null,
      amountKurus: product.priceKurus,
      status: 'bekliyor',
      idempotencyKey,
      consentVersions: {
        preInfo: input.preInfoConsentVersion,
        distance: input.distanceContractConsentVersion,
        requestHash,
        form: '',
      },
      checkoutToken: null,
      paymentId: null,
      createdAt: fixture.d.now(),
      paidAt: null,
    };
    const documents =
      (await fixture.d.prepareLegalDocuments?.(order, buyer, fixture.table(order.createdAt))) ?? [];
    const init = await fixture.d.iyzico.initSubscriptionCheckout({
      conversationId: orderId,
      pricingPlanReferenceCode: planRef,
      callbackUrl: `${fixture.d.callbackBaseUrl}/api/v1/checkout/subscription-callback`,
      customer: buyer,
    });
    // Consents only for a checkout that iyzico opened (D-N1).
    const consentRows = fixture.consents(userId, items, { orderId, productCode: product.code });
    order.checkoutToken = init.token;
    order.consentVersions.form = init.checkoutFormContent;
    if (init.paymentPageUrl) order.consentVersions.pageUrl = init.paymentPageUrl;
    await fixture.saveCheckout(order, consentRows, documents);
    await fixture.notify(userId, 'sozlesme', fixture.d.now(), orderId);
    return { orderId, checkoutFormContent: init.checkoutFormContent, paymentPageUrl: init.paymentPageUrl };
  }
}
