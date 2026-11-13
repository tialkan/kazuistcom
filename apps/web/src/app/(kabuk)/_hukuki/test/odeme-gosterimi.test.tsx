import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  LegalFrontMatter,
  legalPdfProblems,
  legalPlaceholders,
  legalPublishBlockers,
} from '@kazuist/contracts';
import { PRICE_TABLE_V1, addMonths, findProduct } from '@kazuist/ledger';
import { DOC_FIELDS, createLegalSnapshot, orderFields, type Order } from '@kazuist/ledger/billing';
import { describe, expect, it } from 'vitest';
import { CheckoutStep } from '../../../(odeme)/odeme/checkout-step.tsx';
import { buildCheckoutLegalPresentation } from '../../../(odeme)/odeme/legal-presentation.ts';
import { onBilgi } from '../md.ts';
import { hukukiMetin, hukukiMetinler, type HukukiMetin } from '../yukle.ts';

/**
 * docs/istekler/hukuk-uyum-p5-tutarlilik.md madde 1: the front matter parser reads YAML lists, so the three
 * order texts can declare `pdf: true` and `pdf_fields`, and the payment step can show them. These tests use
 * the real files under content/hukuki and the real order fields of the ledger.
 */

const PDF_FIELDS = {
  'on-bilgilendirme': [
    'AYLIK_KREDI',
    'INDIRIM',
    'KREDI',
    'ODEME_DONEMI',
    'TUTAR_TL',
    'URUN_ACIKLAMASI',
    'URUN_ADI',
    'URUN_TURU',
  ],
  'mesafeli-satis': ['ALICI_AD', 'ALICI_EPOSTA', 'SIPARIS_TARIHI', 'TUTAR_TL', 'URUN_ADI'],
  abonelik: [
    'ALICI_AD',
    'ALICI_EPOSTA',
    'AYLIK_INDIRIM_TL',
    'AYLIK_KREDI',
    'AYLIK_LISTE_FIYATI_TL',
    'DONEM_BASLANGIC',
    'DONEM_BITIS',
    'ODEME_DONEMI',
    'PLAN_ADI',
    'SOZLESME_TARIHI',
    'TUTAR_TL',
    'YILLIK_TUTAR_TL',
  ],
} as const;
type Slug = keyof typeof PDF_FIELDS;

const metin = (slug: string): HukukiMetin => {
  const m = hukukiMetin('tr', slug);
  if (!m) throw new Error(`${slug} missing`);
  return m;
};

/**
 * What publication changes: Tarık's approval (status yayinda) and the company KEP address. Nothing else in
 * the text is touched, so every other open marker would still close the payment step.
 */
const yayimlanmis = (m: HukukiMetin) => ({
  fm: { ...m.fm, status: 'yayinda' as const },
  ham: m.ham.replaceAll('{{KEP}}', 'kep-ornegi@example.invalid'),
});

const fields = (code: string) => {
  const product = findProduct(PRICE_TABLE_V1, code);
  if (!product) throw new Error(`${code} missing`);
  const createdAt = new Date('2026-11-13T09:00:00Z');
  const order: Order = {
    id: 'checkout-preview',
    userId: 'u1',
    productCode: product.code,
    amountKurus: product.priceKurus,
    couponCode: null,
    status: 'bekliyor',
    idempotencyKey: '',
    consentVersions: {},
    checkoutToken: null,
    paymentId: null,
    createdAt,
    paidAt: null,
  };
  return {
    product,
    values: orderFields({
      order,
      buyer: { name: 'Çağrı', surname: 'Özgür', email: 'cagri@example.invalid' },
      tables: [PRICE_TABLE_V1],
      periodStart: createdAt,
      periodEnd: addMonths(createdAt, product.interval === 'yillik' ? 12 : 1),
    }),
  };
};

describe('front matter lists', () => {
  it('reads a flow sequence, quoted items, an empty list and comments', () => {
    expect(onBilgi('pdf: true\npdf_fields: [TUTAR_TL, "URUN_ADI", \'KREDI\'] # order fields')).toEqual({
      pdf: true,
      pdf_fields: ['TUTAR_TL', 'URUN_ADI', 'KREDI'],
    });
    expect(onBilgi('pdf_fields: []')).toEqual({ pdf_fields: [] });
  });
  it('reads a block sequence and keeps a bare key an empty string', () => {
    expect(onBilgi('pdf_fields:\n  - TUTAR_TL\n  - URUN_ADI\nslug: x\nbos:')).toEqual({
      pdf_fields: ['TUTAR_TL', 'URUN_ADI'],
      slug: 'x',
      bos: '',
    });
  });
  it('does not turn a title with brackets or a nested sequence into a list', () => {
    expect(onBilgi('title: "[Taslak] Metin"\nx: [[A], B]')).toEqual({
      title: '[Taslak] Metin',
      x: '[[A], B]',
    });
  });
  it('matches the full YAML parser on every legal text', async () => {
    const { parse } = await import('yaml');
    for (const m of hukukiMetinler('tr')) {
      const ham =
        readFileSync(m.dosya, 'utf8')
          .split('\n---')[0]
          ?.replace(/^---\n/, '') ?? '';
      expect(LegalFrontMatter.parse(onBilgi(ham)), m.dosya).toEqual(LegalFrontMatter.parse(parse(ham)));
    }
  });
});

describe('order texts declare their PDF fields', () => {
  it.each(Object.keys(PDF_FIELDS) as Slug[])('%s', (slug) => {
    const m = metin(slug);
    expect(m.fm.pdf).toBe(true);
    expect(m.fm.pdf_fields).toEqual(PDF_FIELDS[slug]);
    expect(legalPdfProblems(slug, m.fm, m.ham)).toEqual([]);
    // The ledger fills every declared field.
    for (const f of PDF_FIELDS[slug]) expect(DOC_FIELDS[slug], f).toContain(f);
  });
  it('leaves only the approval and the company KEP address between the texts and the payment step', () => {
    for (const slug of Object.keys(PDF_FIELDS) as Slug[]) {
      const m = metin(slug);
      const open = legalPlaceholders(m.ham).filter((p) => !m.fm.pdf_fields?.includes(p));
      expect(new Set(open), slug).toEqual(new Set(slug === 'on-bilgilendirme' ? ['KEP'] : []));
      expect(legalPublishBlockers(m.fm, m.ham), slug).toContain('taslak');
    }
  });
});

describe('payment step shows the legal texts', () => {
  it('keeps payment closed while the texts are drafts', () => {
    const { product, values } = fields('kredi.300');
    const preInfo = metin('on-bilgilendirme');
    const contract = metin('mesafeli-satis');
    const legal = buildCheckoutLegalPresentation({
      kind: product.kind,
      annual: false,
      preInfo,
      contract,
      acceptedVersions: { preInfo: preInfo.fm.version, contract: contract.fm.version },
      fields: values,
    });
    expect(legal).toBeNull();
  });

  it('renders the filled pre-information form and distance contract once published', () => {
    const { product, values } = fields('kredi.300');
    const preInfo = yayimlanmis(metin('on-bilgilendirme'));
    const contract = yayimlanmis(metin('mesafeli-satis'));
    const legal = buildCheckoutLegalPresentation({
      kind: product.kind,
      annual: false,
      preInfo,
      contract,
      acceptedVersions: { preInfo: preInfo.fm.version, contract: contract.fm.version },
      fields: values,
    });
    if (!legal) throw new Error('payment step must show the published legal texts');
    expect(legal.documents.map((d) => d.slug)).toEqual(['on-bilgilendirme', 'mesafeli-satis']);

    const html = renderToStaticMarkup(
      createElement(CheckoutStep, {
        kind: product.kind,
        code: product.code,
        productLabel: 'Başlangıç kredi paketi',
        priceLabel: values.TUTAR_TL ?? '',
        legal,
      }),
    );
    expect(html).toContain(preInfo.fm.title);
    expect(html).toContain(contract.fm.title);
    expect(html).toContain('Çağrı Özgür');
    expect(html).toContain('cagri@example.invalid');
    expect(html).toContain(values.URUN_ADI);
    expect(html).not.toContain('{{');
    expect(html).not.toContain('TASLAK, Tarık');
    expect(html).not.toContain('Gösterim kuralları');
  });

  it('freezes the same published texts as order snapshots', () => {
    const { values } = fields('kredi.300');
    for (const slug of ['on-bilgilendirme', 'mesafeli-satis'] as const) {
      const src = yayimlanmis(metin(slug));
      const snap = createLegalSnapshot({
        orderId: 'o1',
        slug,
        acceptedVersion: src.fm.version,
        frontMatter: src.fm,
        body: src.ham,
        fields: values,
      });
      expect(snap.version).toBe(src.fm.version);
      expect(snap.text).toContain('Sipariş: o1');
      expect(snap.text).not.toContain('{{');
    }
  });

  it('accepts the published subscription contract for a running annual plan', () => {
    const { values } = fields('ogrenci.yillik');
    const src = yayimlanmis(metin('abonelik'));
    const snap = createLegalSnapshot({
      orderId: 'o2',
      slug: 'abonelik',
      acceptedVersion: src.fm.version,
      frontMatter: src.fm,
      body: src.ham,
      fields: values,
    });
    expect(snap.text).toContain(values.YILLIK_TUTAR_TL);
    expect(snap.text).not.toContain('{{');
  });
});
