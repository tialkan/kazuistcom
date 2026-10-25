import { createHash } from 'node:crypto';
import {
  BillingError,
  createLegalSnapshot,
  orderFields,
  type Buyer,
  type Order,
  type PreparedLegalDocument,
} from '@kazuist/ledger/billing';
import { addMonths, findProduct, type PriceTable } from '@kazuist/ledger';
import { hukukiMetin } from '@/app/(kabuk)/_hukuki/yukle';

/** Freeze the accepted source and checkout fields before opening the external payment form. */
export function prepareCheckoutDocuments(
  order: Readonly<Order>,
  buyer: Buyer,
  table: PriceTable,
): readonly PreparedLegalDocument[] {
  const product = findProduct(table, order.productCode);
  if (!product) throw new BillingError(502, 'legal_documents_unavailable');
  const fields = orderFields({
    order,
    buyer,
    tables: [table],
    periodStart: order.createdAt,
    periodEnd: addMonths(order.createdAt, product.interval === 'yillik' ? 12 : 1),
  });
  const contract = product.kind === 'abonelik' ? 'abonelik' : 'mesafeli-satis';
  return (['on-bilgilendirme', contract] as const).map((slug) => {
    try {
      const source = hukukiMetin('tr', slug);
      if (!source) throw new Error('missing legal source');
      const snapshot = createLegalSnapshot({
        orderId: order.id,
        slug,
        acceptedVersion: String(order.consentVersions[slug === 'on-bilgilendirme' ? 'preInfo' : 'distance']),
        frontMatter: source.fm,
        body: source.ham,
        fields,
      });
      return { ...snapshot, sourceSha256: createHash('sha256').update(source.ham, 'utf8').digest('hex') };
    } catch {
      throw new BillingError(502, 'legal_documents_unavailable');
    }
  });
}
