/** These records contain personal data. Never log them or put them in a job/push payload. ADR-0027. */
export interface FrozenOrderDocument {
  slug: 'on-bilgilendirme' | 'mesafeli-satis' | 'abonelik';
  version: string;
  text: string;
  sha256: string;
  sourceSha256?: string | null;
  fields: Readonly<Record<string, string>>;
}

/** Pass the checkout's existing transaction client, never a pool (the order and consents are atomic). */
export interface LegalDocumentTransaction {
  query(sql: string, parameters: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Serialize on the order. Identical retries are harmless; divergent snapshots abort the transaction. */
export async function freezeOrderLegalDocuments(
  tx: LegalDocumentTransaction,
  orderId: string,
  userId: string,
  documents: readonly FrozenOrderDocument[],
): Promise<void> {
  const result = await tx.query(
    'select o.user_id, p.kind from orders o join products p on p.id = o.product_id where o.id = $1 for update of o',
    [orderId],
  );
  const order = result.rows[0];
  if (!order || order.user_id !== userId) throw new Error('Legal document ownership mismatch');
  const required = ['on-bilgilendirme', order.kind === 'abonelik' ? 'abonelik' : 'mesafeli-satis'];
  if (
    documents.length !== new Set(documents.map((d) => d.slug)).size ||
    required.some((slug) => !documents.some((d) => d.slug === slug))
  )
    throw new Error('Incomplete frozen legal document set');
  // Reject all conflicts before any insert, including a retry whose changed fields yield the same text.
  const previous = await tx.query('select * from order_legal_documents where order_id = $1', [orderId]);
  for (const d of documents) {
    const old = previous.rows.find((row) => row.slug === d.slug);
    if (old) {
      const same = await tx.query(
        `select 1 from order_legal_documents where order_id = $1 and slug = $2 and version = $3
         and filled_text = $4 and sha256 = $5 and source_sha256 is not distinct from $6
         and fields = $7::jsonb and user_id = $8`,
        [
          orderId,
          d.slug,
          d.version,
          d.text,
          d.sha256,
          d.sourceSha256 ?? null,
          JSON.stringify(d.fields),
          userId,
        ],
      );
      if (!same.rows.length) throw new Error('Frozen legal document conflicts with stored content');
    }
  }
  for (const d of documents) {
    await tx.query(
      `insert into order_legal_documents (order_id, user_id, slug, version, filled_text, sha256, source_sha256, fields)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (order_id, slug) do nothing`,
      [
        orderId,
        userId,
        d.slug,
        d.version,
        d.text,
        d.sha256,
        d.sourceSha256 ?? null,
        JSON.stringify(d.fields),
      ],
    );
  }
}

/** A receipt is appended after provider acceptance, never merely after enqueueing notify.send. */
export async function recordOrderLegalDocumentDelivery(
  tx: LegalDocumentTransaction,
  input: { orderId: string; userId: string; providerMessageId: string; deliveredAt: Date },
): Promise<void> {
  const order = await tx.query('select user_id from orders where id = $1 for update', [input.orderId]);
  if (order.rows[0]?.user_id !== input.userId) throw new Error('Legal delivery ownership mismatch');
  const old = await tx.query(
    'select provider_message_id from order_legal_document_deliveries where order_id = $1',
    [input.orderId],
  );
  if (old.rows.length) {
    if (old.rows[0]?.provider_message_id !== input.providerMessageId)
      throw new Error('Legal delivery conflicts with the stored provider receipt');
    return;
  }
  await tx.query(
    'insert into order_legal_document_deliveries (order_id,user_id,provider_message_id,delivered_at) values ($1,$2,$3,$4)',
    [input.orderId, input.userId, input.providerMessageId, input.deliveredAt],
  );
}
