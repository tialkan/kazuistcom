import { freezeOrderLegalDocuments, type LegalDocumentTransaction } from '@kazuist/db';
import { createLegalSnapshot } from '@kazuist/ledger/billing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { meDelete } from '../handlers.ts';
import { meOrderLegalDocumentsGet } from '../legal-documents.ts';
import { api, createHarness, params, signUp, type Harness } from './harness.ts';

let h: Harness;
let owner: { token: string };
let other: { token: string };
let uid: string;
let orderId: string;
let emptyId: string;
const version = '2026-10-25.1';
beforeAll(async () => {
  h = await createHarness();
  owner = await signUp('document-owner@example.invalid');
  other = await signUp('document-other@example.invalid');
  uid =
    (await h.pg.query<{ id: string }>("select id from users where email='document-owner@example.invalid'"))
      .rows[0]?.id ?? '';
  const table =
    (
      await h.pg.query<{ id: string }>(
        "insert into price_tables(version,effective_from,operations) values('legal-test',now(),'{}') returning id",
      )
    ).rows[0]?.id ?? '';
  const product =
    (
      await h.pg.query<{ id: string }>(
        "insert into products(code,kind,price_table_id,price_kurus,credits) values('legal.package','paket',$1,34900,300) returning id",
        [table],
      )
    ).rows[0]?.id ?? '';
  const create = async () =>
    (
      await h.pg.query<{ id: string }>(
        `insert into orders(user_id,product_id,amount_kurus,idempotency_key,consent_versions)
    values($1,$2,34900,gen_random_uuid()::text,$3::jsonb) returning id`,
        [uid, product, JSON.stringify({ preInfo: version, distance: version })],
      )
    ).rows[0]?.id ?? '';
  orderId = await create();
  emptyId = await create();
  const documents = (['on-bilgilendirme', 'mesafeli-satis'] as const).map((slug) =>
    createLegalSnapshot({
      orderId,
      slug,
      acceptedVersion: version,
      frontMatter: {
        title: 'Test metni',
        slug,
        route: `/hukuki/${slug}`,
        lang: 'tr',
        binding: true,
        version,
        date: '2026-10-25',
        status: 'yayinda',
        pdf: true,
        pdf_fields: ['ALICI_AD'],
      },
      body: 'Alıcı: {{ALICI_AD}}',
      fields: { ALICI_AD: 'Çağrı Özgür' },
    }),
  );
  await h.pg.transaction((tx) =>
    freezeOrderLegalDocuments(tx as LegalDocumentTransaction, orderId, uid, documents),
  );
}, 60_000);
afterAll(async () => h.pg.close());
const get = (token: string | null, id = orderId) =>
  meOrderLegalDocumentsGet(api(`/v1/me/orders/${id}/legal-documents`, token), params({ orderId: id }));
it('returns the immutable complete set only to its owner, without internal fields', async () => {
  const response = await get(owner.token);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const data = await response.json();
  expect(data.documents).toHaveLength(2);
  expect(data.documents[0].text).toContain('Çağrı Özgür');
  expect(data.documents[0].fields).toBeUndefined();
  expect((await get(null)).status).toBe(401);
  expect((await get(other.token)).status).toBe(404);
  expect((await get(owner.token, emptyId)).status).toBe(404);
  expect((await get(owner.token, 'invalid')).status).toBe(404);
});
it.each([true, false])(
  'persists deletion refund preference %s and passes it to the billing hook',
  async (requestRefund) => {
    const user = await signUp(`delete-pref-${requestRefund}@example.invalid`);
    const calls: unknown[] = [];
    const original = h.ctx.hooks.onDeletion;
    h.ctx.hooks.onDeletion = async (id, options) => {
      calls.push({ id, options });
    };
    try {
      const response = await meDelete(
        api('/v1/me', user.token, { method: 'DELETE', body: JSON.stringify({ requestRefund }) }),
      );
      expect(response.status).toBe(202);
      const row = (
        await h.pg.query<{ id: string; deletion_request_refund: boolean; deleted_at: Date }>(
          'select id,deletion_request_refund,deleted_at from users where email=$1',
          [`delete-pref-${requestRefund}@example.invalid`],
        )
      ).rows[0];
      if (!row) throw new Error('Expected deleted user');
      expect(row.deletion_request_refund).toBe(requestRefund);
      expect(row.deleted_at).not.toBeNull();
      expect(calls).toEqual([{ id: row.id, options: { requestRefund } }]);
    } finally {
      h.ctx.hooks.onDeletion = original;
    }
  },
);
it('rejects malformed or extra deletion fields before closing the account', async () => {
  const user = await signUp('delete-invalid@example.invalid');
  for (const body of [
    '{',
    JSON.stringify({ requestRefund: 'false' }),
    JSON.stringify({ requestRefund: false, userId: uid }),
  ])
    expect((await meDelete(api('/v1/me', user.token, { method: 'DELETE', body }))).status).toBe(400);
  expect((await meDelete(api('/v1/me', user.token, { method: 'DELETE' }))).status).toBe(202);
  expect(
    (
      await h.pg.query<{ deletion_request_refund: boolean }>(
        "select deletion_request_refund from users where email='delete-invalid@example.invalid'",
      )
    ).rows[0]?.deletion_request_refund,
  ).toBe(true);
});
