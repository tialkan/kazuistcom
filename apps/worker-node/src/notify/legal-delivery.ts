import { readFile } from 'node:fs/promises';
import { renderContractPdf, verifyOrderDocumentSet, type LegalSnapshot } from '@kazuist/ledger/billing';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import type { SqlClient } from '../queue.ts';
import type { EmailTransport } from './types.ts';

interface OrderRow {
  kind: string;
  consent_versions: Record<string, unknown>;
}
interface DocumentRow {
  slug: LegalSnapshot['slug'];
  version: string;
  filled_text: string;
  sha256: string;
  fields: Record<string, string>;
}

/** This lock uses one checked-out connection, including SMTP acceptance and receipt persistence. */
export async function deliverLegalDocuments(input: {
  db: SqlClient;
  orderId: string;
  userId: string;
  recipient: string;
  email?: EmailTransport;
  now: Date;
  fontBytes?: Uint8Array;
}): Promise<'sent' | 'already_delivered'> {
  if (!input.email) throw new Error('Contract email transport is not configured');
  const pool = input.db as SqlClient & { connect?: () => Promise<SqlClient & { release(): void }> };
  const client = pool.connect ? await pool.connect() : input.db;
  try {
    await client.query('begin');
    const { rows: orders } = await client.query<OrderRow>(
      `select p.kind, o.consent_versions from orders o join products p on p.id = o.product_id
       where o.id = $1 and o.user_id = $2 for update of o`,
      [input.orderId, input.userId],
    );
    const order = orders[0];
    if (!order) throw new Error('Frozen legal order is unavailable');
    const receipt = await client.query(
      'select provider_message_id from order_legal_document_deliveries where order_id = $1 and user_id = $2',
      [input.orderId, input.userId],
    );
    if (receipt.rows.length) {
      await client.query('commit');
      return 'already_delivered';
    }
    const { rows } = await client.query<DocumentRow>(
      `select slug, version, filled_text, sha256, fields from order_legal_documents
       where order_id = $1 and user_id = $2 order by slug`,
      [input.orderId, input.userId],
    );
    const documents: LegalSnapshot[] = rows.map((row) => ({
      orderId: input.orderId,
      slug: row.slug,
      version: row.version,
      text: row.filled_text,
      sha256: row.sha256,
      fields: row.fields,
    }));
    if (!verifyOrderDocumentSet(documents, input.orderId, order.kind, order.consent_versions))
      throw new Error('Frozen legal document set is incomplete or corrupt');
    const font =
      input.fontBytes ??
      (await readFile(
        process.env.LEGAL_PDF_FONT_PATH ??
          new URL('../../../../packages/ledger/assets/fonts/DejaVuSans.ttf', import.meta.url),
      ));
    const attachments = await Promise.all(
      documents.map(async (document) => ({
        filename: `${document.slug}-${input.orderId}.pdf`,
        content: await renderContractPdf(document, font),
        contentType: 'application/pdf' as const,
      })),
    );
    const accepted = await input.email.send({
      to: input.recipient,
      subject: tr.eposta.sozlesme.konu,
      text: tr.eposta.sozlesme.metin,
      messageId: `<legal-${input.orderId}@kazuist.com>`,
      attachments,
    });
    if (!accepted?.messageId) throw new Error('Contract provider acceptance receipt is missing');
    await client.query(
      `insert into order_legal_document_deliveries (order_id,user_id,provider_message_id,delivered_at)
       values ($1,$2,$3,$4)`,
      [input.orderId, input.userId, accepted.messageId, input.now],
    );
    await client.query('commit');
    return 'sent';
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    if ('release' in client && typeof client.release === 'function') client.release();
  }
}
