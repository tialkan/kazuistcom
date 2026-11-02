/**
 * Order documents of the payment step (O6, content/hukuki/README.md "PDF'e dönüşen metinler"): the three
 * texts are filled with the order's fields, the draft note and the display rules paragraph are left out,
 * and the text version and order id head the document so it matches the consents row. A document with a
 * missing field is not produced. The PDF rendering and e-mail delivery sit on top of this (DEVIR).
 */
import { PRICE_TABLE_V1, findProduct, type PriceTable } from '../index.ts';
import type { Order } from './store.ts';

export type LegalDocSlug = 'on-bilgilendirme' | 'mesafeli-satis' | 'abonelik';

export const DOC_FIELDS: Record<LegalDocSlug, readonly string[]> = {
  'on-bilgilendirme': [
    'AYLIK_KREDI',
    'INDIRIM',
    'IOS_SURUM',
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
};

const tl = (kurus: number) =>
  (kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (d: Date) =>
  d.toLocaleDateString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

const PRODUCT_NAMES: Record<string, string> = {
  'kredi.300': 'Başlangıç kredi paketi (300 kredi)',
  'kredi.1000': 'Standart kredi paketi (1.000 kredi)',
  'kredi.3000': 'Yoğun kredi paketi (3.000 kredi)',
  'ogrenci.aylik': 'Öğrenci Plus, aylık',
  'ogrenci.yillik': 'Öğrenci Plus, yıllık',
  'akademisyen.aylik': 'Akademisyen, aylık',
  'akademisyen.yillik': 'Akademisyen, yıllık',
};

/** Field values of an order (amounts VAT included, dates in Europe/Istanbul). */
export function orderFields(p: {
  order: Order;
  buyer: { name: string; surname: string; email: string };
  tables?: PriceTable[];
  periodStart?: Date;
  periodEnd?: Date;
}): Record<string, string> {
  const table = p.tables?.[0] ?? PRICE_TABLE_V1;
  const product = findProduct(table, p.order.productCode);
  const list = product?.priceKurus ?? p.order.amountKurus;
  const monthlyList = product?.monthlyListKurus ?? 0;
  const yearly = product?.interval === 'yillik';
  const f: Record<string, string> = {
    ALICI_AD: `${p.buyer.name} ${p.buyer.surname}`.trim(),
    ALICI_EPOSTA: p.buyer.email,
    SIPARIS_TARIHI: date(p.order.createdAt),
    SOZLESME_TARIHI: date(p.order.createdAt),
    TUTAR_TL: tl(p.order.amountKurus),
    URUN_ADI: PRODUCT_NAMES[p.order.productCode] ?? p.order.productCode,
    PLAN_ADI: PRODUCT_NAMES[p.order.productCode] ?? p.order.productCode,
    URUN_TURU: product?.kind === 'abonelik' ? 'Abonelik' : 'Kredi paketi',
    URUN_ACIKLAMASI:
      product?.kind === 'abonelik'
        ? `Her ay ${product.monthlyCredits ?? 0} kredi yükleyen plan; plan özellikleri plan 4.2 tablosundadır.`
        : `${product?.credits ?? 0} kredi; satın alınan kredinin süresi dolmaz.`,
    KREDI: String(product?.credits ?? product?.monthlyCredits ?? 0),
    AYLIK_KREDI: String(product?.monthlyCredits ?? 0),
    ODEME_DONEMI: product?.kind === 'abonelik' ? (yearly ? 'Yıllık' : 'Aylık') : 'Tek seferlik',
    INDIRIM: list > p.order.amountKurus ? `${tl(list - p.order.amountKurus)} TL` : 'Yok',
    IOS_SURUM: 'Web',
    AYLIK_LISTE_FIYATI_TL: tl(monthlyList),
    AYLIK_INDIRIM_TL: yearly && monthlyList ? tl(Math.max(0, monthlyList - Math.floor(list / 12))) : tl(0),
    YILLIK_TUTAR_TL: yearly ? tl(list) : tl(0),
  };
  if (p.periodStart) f.DONEM_BASLANGIC = date(p.periodStart);
  if (p.periodEnd) f.DONEM_BITIS = date(p.periodEnd);
  return f;
}

/**
 * Fill one legal text body (front matter removed). The first quote block (draft note) and the display
 * rules paragraph of on-bilgilendirme stay out of the document.
 */
export function fillLegalDoc(p: {
  slug: LegalDocSlug;
  body: string;
  version: string;
  orderId: string;
  fields: Record<string, string>;
}): { ok: true; text: string } | { ok: false; missing: string[] } {
  const needed = [...new Set([...(p.body.match(/{{[A-Z_]+}}/g) ?? [])].map((m) => m.slice(2, -2)))];
  const company = new Set(['KEP', 'TELEFON']);
  const missing = needed.filter((k) => !p.fields[k] && !company.has(k)).sort();
  const open = needed.filter((k) => company.has(k));
  if (missing.length || open.length) return { ok: false, missing: [...missing, ...open] };
  const paras = p.body.split(/\n\s*\n/);
  let quoteDropped = false;
  const kept = paras.filter((para) => {
    const t = para.trim();
    if (!quoteDropped && /^>\s*TASLAK[,\s]/.test(t)) {
      quoteDropped = true;
      return false;
    }
    return !t.startsWith('Gösterim kuralları');
  });
  const text = kept.join('\n\n').replace(/{{([A-Z_]+)}}/g, (_, k: string) => p.fields[k] as string);
  return { ok: true, text: `Metin sürümü: ${p.version}\nSipariş: ${p.orderId}\n\n${text.trim()}\n` };
}

export * from './contract-snapshot.ts';
export * from './contract-pdf.ts';
