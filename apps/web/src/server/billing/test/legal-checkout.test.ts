import { vi, expect, it } from 'vitest';
import type { Order, Buyer } from '@kazuist/ledger/billing';
import { PRICE_TABLE_V1 } from '@kazuist/ledger';
const source = vi.hoisted(() => ({ status: 'yayinda', body: 'Alıcı: {{ALICI_AD}}\nTutar: {{TUTAR_TL}}' }));
vi.mock('@/app/(kabuk)/_hukuki/yukle', () => ({
  hukukiMetin: (_lang: string, slug: string) => ({
    fm: {
      title: 'Belge',
      slug,
      route: `/hukuki/${slug}`,
      lang: 'tr',
      binding: true,
      pdf: true,
      pdf_fields: ['ALICI_AD', 'TUTAR_TL'],
      version: '2026-10-26.1',
      date: '2026-10-26',
      status: source.status,
    },
    ham: source.body,
  }),
}));
import { prepareCheckoutDocuments } from '../legal-checkout.ts';
const buyer = { name: 'Çağrı', surname: 'Özgür', email: 'c@example.invalid' } as Buyer;
const order: Order = {
  id: '00000000-0000-4000-8000-000000000001',
  userId: 'u1',
  productCode: 'kredi.300',
  couponCode: null,
  amountKurus: 1900,
  status: 'bekliyor',
  idempotencyKey: 'test-key',
  consentVersions: { preInfo: '2026-10-26.1', distance: '2026-10-26.1' },
  checkoutToken: null,
  paymentId: null,
  createdAt: new Date('2026-10-26T00:00:00Z'),
  paidAt: null,
};
it('freezes the accepted source with actual discounted checkout and buyer fields', () => {
  const docs = prepareCheckoutDocuments(order, buyer, PRICE_TABLE_V1);
  expect(docs.map((d) => d.slug)).toEqual(['on-bilgilendirme', 'mesafeli-satis']);
  expect(docs[0]?.text).toContain('Çağrı Özgür');
  expect(docs[0]?.text).toContain('19,00');
  expect(docs[0]?.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  source.body = 'Yeni metin';
  expect(docs[0]?.text).toContain('19,00');
  source.body = 'Alıcı: {{ALICI_AD}}\nTutar: {{TUTAR_TL}}';
});
it('refuses draft or changed accepted versions instead of silently generating another contract', () => {
  source.status = 'taslak';
  expect(() => prepareCheckoutDocuments(order, buyer, PRICE_TABLE_V1)).toThrow('legal_documents_unavailable');
  source.status = 'yayinda';
  expect(() =>
    prepareCheckoutDocuments(
      { ...order, consentVersions: { preInfo: 'old', distance: '2026-10-26.1' } },
      buyer,
      PRICE_TABLE_V1,
    ),
  ).toThrow('legal_documents_unavailable');
});
