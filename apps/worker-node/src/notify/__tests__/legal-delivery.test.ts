import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder, freezeOrderLegalDocuments, type LegalDocumentTransaction } from '@kazuist/db';
import { createLegalSnapshot } from '@kazuist/ledger/billing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { dispatch } from '../dispatch.ts';
import type { EmailMessage } from '../types.ts';

let pg: PGlite;
let uid: string;
let product: string;
const version = '2026-10-25.1';
// Use an explicit repository URL rather than depending on process working directory.
const fontBytes = readFile(
  new URL('../../../../../packages/ledger/assets/fonts/DejaVuSans.ttf', import.meta.url),
);
beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  uid =
    (await pg.query<{ id: string }>("insert into users(email) values('legal@example.invalid') returning id"))
      .rows[0]?.id ?? '';
  const table =
    (
      await pg.query<{ id: string }>(
        "insert into price_tables(version,effective_from,operations) values('legal-test',now(),'{}') returning id",
      )
    ).rows[0]?.id ?? '';
  product =
    (
      await pg.query<{ id: string }>(
        "insert into products(code,kind,price_table_id,price_kurus,credits) values('legal.package','paket',$1,34900,300) returning id",
        [table],
      )
    ).rows[0]?.id ?? '';
}, 60_000);
afterAll(async () => pg.close());

async function order(complete = true, recipient = 'frozen@example.invalid', conflict = false) {
  const id =
    (
      await pg.query<{ id: string }>(
        `insert into orders(user_id,product_id,amount_kurus,idempotency_key,consent_versions)
    values($1,$2,34900,gen_random_uuid()::text,$3::jsonb) returning id`,
        [uid, product, JSON.stringify({ preInfo: version, distance: version })],
      )
    ).rows[0]?.id ?? '';
  if (complete) {
    const documents = (['on-bilgilendirme', 'mesafeli-satis'] as const).map((slug) =>
      createLegalSnapshot({
        orderId: id,
        slug,
        acceptedVersion: version,
        frontMatter: {
          title: 'Yayımlanmış test metni',
          slug,
          route: `/hukuki/${slug}`,
          lang: 'tr',
          binding: true,
          version,
          date: '2026-10-25',
          status: 'yayinda',
          pdf: true,
          pdf_fields: ['ALICI_AD', 'TUTAR_TL'],
        },
        body: '# Test sözleşmesi\n\nAlıcı {{ALICI_AD}}, tutar {{TUTAR_TL}} TL.',
        fields: {
          ALICI_AD: 'Çağrı Özgür',
          TUTAR_TL: '349,00',
          ALICI_EPOSTA: conflict && slug === 'mesafeli-satis' ? 'other@example.invalid' : recipient,
        },
      }),
    );
    await pg.transaction((tx) =>
      freezeOrderLegalDocuments(tx as LegalDocumentTransaction, id, uid, documents),
    );
  }
  return id;
}
const sent: EmailMessage[] = [];
async function send(id: string, mode: 'accepted' | 'failed' | 'unverified' | 'missing' = 'accepted') {
  return dispatch(
    {
      db: pg,
      appUrl: 'https://kazuist.com',
      iys: { allowsEmail: async () => false },
      legalPdfFontBytes: await fontBytes,
      email:
        mode === 'missing'
          ? undefined
          : {
              send: async (m) => {
                sent.push(m);
                if (mode === 'failed') throw new Error('SMTP unavailable');
                return mode === 'unverified' ? undefined : { messageId: m.messageId ?? '' };
              },
            },
      webPush: {
        send: async () => {
          throw new Error('Contract must not reach push');
        },
      },
      apns: {
        send: async () => {
          throw new Error('Contract must not reach push');
        },
      },
    },
    { type: 'odeme', userId: uid, refId: `sozlesme:${id}` },
  );
}
it('attaches the frozen PDF set and records only provider acceptance, replay does not resend', async () => {
  const id = await order();
  expect((await send(id)).sent).toEqual(['email']);
  const message = sent.at(-1);
  if (!message) throw new Error('Expected email');
  expect(message.attachments).toHaveLength(2);
  expect(
    Buffer.from(message.attachments?.[0]?.content ?? [])
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');
  const receipt = await pg.query<{ provider_message_id: string }>(
    'select provider_message_id from order_legal_document_deliveries where order_id=$1',
    [id],
  );
  expect(receipt.rows[0]?.provider_message_id).toBe(`<legal-${id}@kazuist.com>`);
  const count = sent.length;
  expect((await send(id)).reason).toBe('already_delivered');
  expect(sent).toHaveLength(count);
});
it.each(['failed', 'unverified', 'missing'] as const)(
  'does not record a receipt when transport is %s',
  async (mode) => {
    const id = await order();
    await expect(send(id, mode)).rejects.toThrow();
    expect(
      (await pg.query('select 1 from order_legal_document_deliveries where order_id=$1', [id])).rows,
    ).toHaveLength(0);
  },
);
it('rejects missing historical snapshots instead of sending a generic notice', async () => {
  const id = await order(false);
  const count = sent.length;
  await expect(send(id)).rejects.toThrow('incomplete');
  expect(sent).toHaveLength(count);
});

it('delivers a paid deleted-account contract to its frozen checkout email while other notices stay skipped', async () => {
  const id = await order();
  await pg.query("update orders set status='odendi',paid_at=now() where id=$1", [id]);
  await pg.query("update users set deleted_at=now(),email='changed@example.invalid' where id=$1", [uid]);
  try {
    expect((await send(id)).sent).toEqual(['email']);
    expect(sent.at(-1)?.to).toBe('frozen@example.invalid');
    const count = sent.length;
    for (const type of ['kampanya', 'takip', 'odeme'] as const) {
      const generic = await dispatch(
        {
          db: pg,
          appUrl: 'https://kazuist.com',
          iys: { allowsEmail: async () => true },
          email: {
            send: async (m) => {
              sent.push(m);
              return { messageId: 'unexpected' };
            },
          },
          webPush: {
            send: async () => {
              throw new Error('Deleted account must not reach push');
            },
          },
          apns: {
            send: async () => {
              throw new Error('Deleted account must not reach APNs');
            },
          },
        },
        { type, userId: uid },
      );
      expect(generic.reason).toBe('no_user');
    }
    expect(sent).toHaveLength(count);
  } finally {
    await pg.query("update users set deleted_at=null,email='legal@example.invalid' where id=$1", [uid]);
  }
});

it.each(['', 'not-an-email'])(
  'fails closed with no receipt when frozen email is invalid: %s',
  async (recipient) => {
    const id = await order(true, recipient);
    const count = sent.length;
    await expect(send(id)).rejects.toThrow('recipient');
    expect(sent).toHaveLength(count);
    expect(
      (await pg.query('select 1 from order_legal_document_deliveries where order_id=$1', [id])).rows,
    ).toHaveLength(0);
  },
);
it('does not choose between conflicting snapshot recipient addresses', async () => {
  const id = await order(true, 'frozen@example.invalid', true);
  const count = sent.length;
  await expect(send(id)).rejects.toThrow('recipient');
  expect(sent).toHaveLength(count);
});
