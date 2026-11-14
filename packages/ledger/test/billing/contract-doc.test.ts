import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LegalFrontMatter, legalPdfProblems, legalPlaceholders, splitFrontMatter } from '@kazuist/contracts';
import { describe, expect, it } from 'vitest';
import { DOC_FIELDS, fillLegalDoc, orderFields, type LegalDocSlug } from '../../src/billing/contract-doc.ts';
import type { Order } from '../../src/billing/store.ts';

const file = (slug: LegalDocSlug) =>
  readFileSync(fileURLToPath(new URL(`../../../../content/hukuki/tr/${slug}.md`, import.meta.url)), 'utf8');
const body = (slug: LegalDocSlug) => file(slug).replace(/^---\n[\s\S]*?\n---\n/, '');

/**
 * Front matter of a legal text as LegalFrontMatter. The ledger has no YAML dependency, so this reads the subset
 * content/hukuki uses (`key: value`, booleans, flow `[A, B]` and block `- A` lists) and lets zod reject the rest.
 */
const frontMatter = (slug: LegalDocSlug): LegalFrontMatter => {
  const split = splitFrontMatter(file(slug));
  if (!split) throw new Error(`${slug}: no front matter`);
  const out: Record<string, unknown> = {};
  let list: string[] | null = null;
  const scalar = (v: string) => v.trim().replace(/^(['"])(.*)\1$/, '$2');
  for (const raw of split.frontMatter.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && list) {
      list.push(scalar(item[1] ?? ''));
      continue;
    }
    list = null;
    const m = /^([a-z_]+):\s*(.*)$/.exec(line);
    if (!m?.[1]) continue;
    const v = (m[2] ?? '').trim();
    if (!v) out[m[1]] = list = [];
    else if (/^\[.*\]$/.test(v))
      out[m[1]] = v
        .slice(1, -1)
        .split(',')
        .map(scalar)
        .filter((x) => x !== '');
    else out[m[1]] = v === 'true' ? true : v === 'false' ? false : scalar(v);
  }
  return LegalFrontMatter.parse(out);
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

/** Company fields fillLegalDoc leaves to the publication gate; they are not order fields. */
const COMPANY = new Set(['KEP', 'TELEFON']);
const SLUGS = Object.keys(DOC_FIELDS) as LegalDocSlug[];
const sorted = (xs: Iterable<string>) => [...new Set(xs)].sort();

describe('DOC_FIELDS matches the pdf_fields of the legal texts (hukuk-uyum-p5-tutarlilik madde 4)', () => {
  it.each(SLUGS)('%s: same fields as the front matter, each a placeholder of the body', (slug) => {
    const fm = frontMatter(slug);
    expect(fm.slug).toBe(slug);
    expect(fm.pdf).toBe(true);
    expect(sorted(DOC_FIELDS[slug])).toEqual(sorted(fm.pdf_fields ?? []));
    expect(DOC_FIELDS[slug]).toHaveLength(fm.pdf_fields?.length ?? -1);
    expect(legalPdfProblems(slug, { ...fm, pdf_fields: DOC_FIELDS[slug] }, body(slug))).toEqual([]);
    // Every order placeholder of the body is declared; only company fields stay for the publication gate.
    const orderPlaceholders = legalPlaceholders(body(slug)).filter((p) => !COMPANY.has(p));
    expect(sorted(orderPlaceholders)).toEqual(sorted(DOC_FIELDS[slug]));
  });

  it('drops the iOS version field: the pre-information form is used only for web sales', () => {
    expect(DOC_FIELDS['on-bilgilendirme']).not.toContain('IOS_SURUM');
    expect(body('on-bilgilendirme')).not.toContain('IOS_SURUM');
    expect(orderFields({ order, buyer })).not.toHaveProperty('IOS_SURUM');
  });

  it('orderFields fills every declared field for a credit pack and a historical annual plan', () => {
    const pack = orderFields({ order, buyer });
    for (const slug of ['on-bilgilendirme', 'mesafeli-satis'] as const)
      for (const f of DOC_FIELDS[slug]) expect(pack[f]?.trim(), `${slug} ${f}`).toBeTruthy();
    const annual = orderFields({
      order: { ...order, productCode: 'ogrenci.yillik' },
      buyer,
      periodStart: new Date('2026-10-20T09:00:00Z'),
      periodEnd: new Date('2027-10-20T09:00:00Z'),
    });
    for (const f of DOC_FIELDS.abonelik) expect(annual[f]?.trim(), `abonelik ${f}`).toBeTruthy();
  });

  it('fills the pre-information form with no field left open but the company KEP address', () => {
    const r = fillLegalDoc({
      slug: 'on-bilgilendirme',
      body: body('on-bilgilendirme'),
      version: frontMatter('on-bilgilendirme').version,
      orderId: order.id,
      fields: orderFields({ order, buyer }),
    });
    expect(r).toEqual({ ok: false, missing: ['KEP'] });
  });
});
