import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { fillLegalDoc, orderFields, type LegalDocSlug } from '../../src/billing/contract-doc.ts';
import type { Order } from '../../src/billing/store.ts';

const body = (slug: LegalDocSlug) => {
  const t = readFileSync(
    fileURLToPath(new URL(`../../../../content/hukuki/tr/${slug}.md`, import.meta.url)),
    'utf8',
  );
  return t.replace(/^---\n[\s\S]*?\n---\n/, '');
};
const order: Order = {
  id: '6f1c2c0e-0000-4000-8000-000000000001',
  userId: 'u',
  productCode: 'kredi.300',
  couponCode: null,
  amountKurus: 3900,
  status: 'bekliyor',
  idempotencyKey: 'k',
  consentVersions: {},
  checkoutToken: 't',
  paymentId: null,
  createdAt: new Date('2026-10-20T09:00:00Z'),
  paidAt: null,
};
const buyer = { name: 'Ada', surname: 'Deneme', email: 'a@example.invalid' };

it('O6: fills the distance sales contract, drops the draft note, heads it with version and order', () => {
  const r = fillLegalDoc({
    slug: 'mesafeli-satis',
    body: body('mesafeli-satis'),
    version: '2026-10-22.1',
    orderId: order.id,
    fields: orderFields({ order, buyer }),
  });
  if (!r.ok) throw new Error(`missing ${r.missing.join(',')}`);
  expect(r.text.startsWith(`Metin sürümü: 2026-10-22.1\nSipariş: ${order.id}`)).toBe(true);
  expect(r.text).toContain('Ada Deneme');
  expect(r.text).toContain('39,00');
  expect(r.text).not.toContain('{{');
  expect(r.text).not.toContain('TASLAK, Tarık onayı bekliyor');
});

it('O6: refuses a document with a missing field', () => {
  const r = fillLegalDoc({
    slug: 'abonelik',
    body: body('abonelik'),
    version: 'v',
    orderId: order.id,
    fields: orderFields({ order: { ...order, productCode: 'ogrenci.yillik' }, buyer }),
  });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.missing).toEqual(expect.arrayContaining(['DONEM_BASLANGIC', 'DONEM_BITIS']));
});
