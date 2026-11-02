import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';
import {
  freezeOrderLegalDocuments,
  recordOrderLegalDocumentDelivery,
  type FrozenOrderDocument,
  type LegalDocumentTransaction,
} from '../src/legal-documents.ts';

let pg: PGlite;
let folder: string;
let userId: string;
let orderId: string;
let productId: string;
let priceId: string;
const one = async <T>(sql: string, values: unknown[] = []) => (await pg.query<T>(sql, values)).rows[0] as T;
const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const doc = (slug: FrozenOrderDocument['slug'], text = 'Dondurulmuş örnek belge'): FrozenOrderDocument => ({
  slug,
  version: '2026-10-25.1',
  text,
  sha256: hash(text),
  fields: { TUTAR_TL: '799,00' },
});
const docs = () => [doc('on-bilgilendirme'), doc('abonelik')];
const freeze = (documents: FrozenOrderDocument[], uid = userId) =>
  pg.transaction((tx) => freezeOrderLegalDocuments(tx as LegalDocumentTransaction, orderId, uid, documents));

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'kazuist-v12-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const path = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(path, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0005');
  writeFileSync(path, JSON.stringify(journal));
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: folder });
  userId = (
    await one<{ id: string }>("insert into users (email) values ('snapshot@example.invalid') returning id")
  ).id;
  priceId = (
    await one<{ id: string }>(
      "insert into price_tables (version,effective_from,operations) values ('old', '2026-01-01', '{}') returning id",
    )
  ).id;
  productId = (
    await one<{ id: string }>(
      "insert into products (code,kind,price_table_id,price_kurus,monthly_credits) values ('ogrenci.yillik','abonelik',$1,79900,1000) returning id",
      [priceId],
    )
  ).id;
  orderId = (
    await one<{ id: string }>(
      'insert into orders (user_id,product_id,amount_kurus,idempotency_key,consent_versions) values ($1,$2,79900,\'old-order\',\'{"preInfo":"2026-10-25.1","distance":"2026-10-25.1"}\' ) returning id',
      [userId, productId],
    )
  ).id;
  await pg.query(
    "insert into subscriptions (user_id,product_id,channel,provider_ref,status,price_kurus,grants_delivered) values ($1,$2,'iyzico','old-sub','aktif',79900,3)",
    [userId, productId],
  );
  await pg.query(
    "insert into invoices (order_id,user_id,number,total_kurus,issued_at) values ($1,$2,'OLD-1',79900,now())",
    [orderId, userId],
  );
  await migrate(drizzle(pg), { migrationsFolder });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);
afterAll(async () => {
  await pg.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('migration 0005 upgrades populated v1.2 without reassigning historical versions', () => {
  it('accepts two versions of the same code and preserves historical order, refund basis, subscription and invoice amounts', async () => {
    const p2 = (
      await one<{ id: string }>(
        "insert into price_tables (version,effective_from,operations) values ('new','2026-11-01','{}') returning id",
      )
    ).id;
    await pg.query(
      "insert into products (code,kind,price_table_id,price_kurus,monthly_credits) values ('ogrenci.yillik','abonelik',$1,99900,1500) on conflict (code,price_table_id) do update set price_kurus=excluded.price_kurus",
      [p2],
    );
    const original = await one<{ product_id: string; amount_kurus: number; price_kurus: number }>(
      'select o.product_id,o.amount_kurus,p.price_kurus from orders o join products p on p.id=o.product_id where o.id=$1',
      [orderId],
    );
    expect(original).toEqual({ product_id: productId, amount_kurus: 79900, price_kurus: 79900 });
    const sub = await one<{ price_kurus: number; grants_delivered: number }>(
      "select price_kurus,grants_delivered from subscriptions where provider_ref='old-sub'",
    );
    expect(sub.price_kurus - Math.floor((sub.price_kurus * sub.grants_delivered) / 12)).toBe(59925);
    expect(
      (await one<{ total_kurus: number }>("select total_kurus from invoices where number='OLD-1'"))
        .total_kurus,
    ).toBe(79900);
    expect(
      (await one<{ n: number }>("select count(*)::int n from products where code='ogrenci.yillik'")).n,
    ).toBe(2);
    await expect(pg.query('update products set price_kurus=1 where id=$1', [productId])).rejects.toThrow(
      /immutable/,
    );
    await expect(pg.query('delete from products where id=$1', [productId])).rejects.toThrow(/immutable/);
    await expect(
      pg.query(
        "insert into products (code,kind,price_table_id,price_kurus) values ('ogrenci.yillik','abonelik',$1,1)",
        [priceId],
      ),
    ).rejects.toThrow(/products_code_price_table_uq/);
  });
  it('keeps deletion refund default true and persists an explicit opt-out', async () => {
    expect(
      (
        await one<{ deletion_request_refund: boolean }>(
          'select deletion_request_refund from users where id=$1',
          [userId],
        )
      ).deletion_request_refund,
    ).toBe(true);
    await pg.query('update users set deletion_request_refund=false where id=$1', [userId]);
    expect(
      (
        await one<{ deletion_request_refund: boolean }>(
          'select deletion_request_refund from users where id=$1',
          [userId],
        )
      ).deletion_request_refund,
    ).toBe(false);
  });
  it('refuses incomplete or corrupt snapshots atomically', async () => {
    await expect(freeze([doc('on-bilgilendirme')])).rejects.toThrow(/Incomplete/);
    await expect(
      freeze([doc('on-bilgilendirme'), { ...doc('abonelik'), sha256: '0'.repeat(64) }]),
    ).rejects.toThrow(/order_legal_documents_hash/);
    expect((await one<{ n: number }>('select count(*)::int n from order_legal_documents')).n).toBe(0);
    await expect(freeze([doc('on-bilgilendirme'), doc('abonelik', '{{ALICI_AD}}')])).rejects.toThrow(
      /filled/,
    );
    expect((await one<{ n: number }>('select count(*)::int n from order_legal_documents')).n).toBe(0);
  });
  it('refuses ownership mismatch and receipts without a complete document set', async () => {
    const stranger = (
      await one<{ id: string }>("insert into users(email) values('stranger@example.invalid') returning id")
    ).id;
    await expect(freeze(docs(), stranger)).rejects.toThrow(/ownership/);
    await expect(
      pg.query(
        "insert into order_legal_documents(order_id,user_id,slug,version,filled_text,sha256,fields) values ($1,$2,'abonelik','v1','text',$3,'{}')",
        [orderId, stranger, hash('text')],
      ),
    ).rejects.toThrow(/ownership/);
    await expect(
      pg.query("insert into order_legal_document_deliveries values ($1,$2,'provider-id',now())", [
        orderId,
        userId,
      ]),
    ).rejects.toThrow(/incomplete/);
  });
  it('rejects a snapshot version differing from the accepted order version', async () => {
    await expect(
      freeze([doc('on-bilgilendirme'), { ...doc('abonelik'), version: 'different' }]),
    ).rejects.toThrow(/version differs/);
    expect((await one<{ n: number }>('select count(*)::int n from order_legal_documents')).n).toBe(0);
  });
  it('deduplicates identical document writes and rejects changed text or frozen fields', async () => {
    await freeze(docs());
    await freeze(docs());
    expect((await one<{ n: number }>('select count(*)::int n from order_legal_documents')).n).toBe(2);
    await expect(freeze([doc('on-bilgilendirme'), doc('abonelik', 'Başka metin')])).rejects.toThrow(
      /conflicts/,
    );
    await expect(
      freeze([doc('on-bilgilendirme'), { ...doc('abonelik'), fields: { TUTAR_TL: '999,00' } }]),
    ).rejects.toThrow(/conflicts/);
    await expect(pg.query("update order_legal_documents set version='new'")).rejects.toThrow(/append only/);
    await expect(pg.query('delete from order_legal_documents')).rejects.toThrow(/append only/);
    await expect(pg.query('truncate order_legal_documents')).rejects.toThrow(/append only/);
    expect(
      (
        await one<{ filled_text: string }>(
          "select filled_text from order_legal_documents where slug='abonelik'",
        )
      ).filled_text,
    ).toBe('Dondurulmuş örnek belge');
  });
  it('records a real provider receipt once and prevents false or mutable receipts', async () => {
    await expect(
      pg.query("insert into order_legal_document_deliveries values ($1,$2,'',now())", [orderId, userId]),
    ).rejects.toThrow(/message/);
    await expect(
      pg.query("insert into order_legal_document_deliveries values ($1,$2,'p',now()+interval '1 day')", [
        orderId,
        userId,
      ]),
    ).rejects.toThrow(/invalid/);
    await pg.query(
      "insert into order_legal_document_deliveries values ($1,$2,'provider-id',now()) on conflict (order_id) do nothing",
      [orderId, userId],
    );
    await pg.query(
      "insert into order_legal_document_deliveries values ($1,$2,'provider-id',now()) on conflict (order_id) do nothing",
      [orderId, userId],
    );
    expect((await one<{ n: number }>('select count(*)::int n from order_legal_document_deliveries')).n).toBe(
      1,
    );
    await expect(
      pg.query("update order_legal_document_deliveries set provider_message_id='other'"),
    ).rejects.toThrow(/append only/);
  });
  it('delivery helper deduplicates the actual provider receipt and rejects a divergent retry', async () => {
    const input = { orderId, userId, providerMessageId: 'provider-id', deliveredAt: new Date() };
    await pg.transaction((tx) => recordOrderLegalDocumentDelivery(tx as LegalDocumentTransaction, input));
    await expect(
      pg.transaction((tx) =>
        recordOrderLegalDocumentDelivery(tx as LegalDocumentTransaction, {
          ...input,
          providerMessageId: 'different',
        }),
      ),
    ).rejects.toThrow(/conflicts/);
  });
});
