import { verifyOrderDocumentSet, type LegalSnapshot } from '@kazuist/ledger/billing';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withAuth } from './guard.ts';
import { schema } from './db.ts';
import { apiError, json } from './http.ts';

export const meOrderLegalDocumentsGet = withAuth(
  { rate: { name: 'me-order-documents', limit: 30, windowSec: 60 } },
  async (_req, principal, ctx, params) => {
    const orderId = params.orderId;
    if (!orderId || !z.uuid().safeParse(orderId).success) return apiError('not_found');
    const [order] = await ctx.db
      .select({
        kind: schema.products.kind,
        consentVersions: schema.orders.consentVersions,
      })
      .from(schema.orders)
      .innerJoin(schema.products, eq(schema.orders.productId, schema.products.id))
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.userId, principal.userId)));
    if (!order) return apiError('not_found');
    const rows = await ctx.db
      .select()
      .from(schema.orderLegalDocuments)
      .where(
        and(
          eq(schema.orderLegalDocuments.orderId, orderId),
          eq(schema.orderLegalDocuments.userId, principal.userId),
        ),
      );
    const documents: LegalSnapshot[] = rows.map((row) => ({
      orderId,
      slug: row.slug as LegalSnapshot['slug'],
      version: row.version,
      text: row.filledText,
      sha256: row.sha256,
      fields: row.fields,
    }));
    if (
      !verifyOrderDocumentSet(
        documents,
        orderId,
        order.kind,
        order.consentVersions as Record<string, unknown>,
      )
    )
      return apiError('not_found');
    return json(
      { documents: documents.map(({ slug, version, text, sha256 }) => ({ slug, version, text, sha256 })) },
      200,
      { 'Cache-Control': 'private, no-store' },
    );
  },
);
