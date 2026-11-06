/**
 * Card and deck data model of the Pratik module (SRS section 7 card model and plan 10.6/1: hmgsAlani, zorluk,
 * kaynakKayitIdleri, editorler[2], surum). Decks live in content/desteler/*.json and are validated here; nothing is
 * published that fails these rules.
 *
 * A card has no stored status. The status is computed (`kartDurumu`): a card without a source verified word for word
 * is a draft (taslak); a verified card without enough editor approvals waits for approval (onay_bekliyor); only a
 * verified card with the required approvals for its current version is published (yayinda). HMGS cards need two
 * different editors (plan 10.6/4, Ek G), other cards one.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { hmgsAlanSlugleri } from './hmgs-alanlari.ts';

export const oyunlar = ['olay_karti', 'hala_gecerli_mi', 'dogru_yanlis', 'hangisi_once'] as const;
export type Oyun = (typeof oyunlar)[number];

export const durumlar = ['taslak', 'onay_bekliyor', 'yayinda'] as const;
export type KartDurumu = (typeof durumlar)[number];

export const DOGRU_YANLIS_SECENEKLERI = ['Doğru', 'Yanlış'] as const;
export const HALA_GECERLI_SECENEKLERI = ['Hâlâ geçerli', 'Değişti', 'Geçersiz (yürürlükten kalktı)'] as const;

const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date as YYYY-MM-DD');
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lower case slug');
const EM_DASH = String.fromCharCode(0x2014);
const metin = (alt: number, ust: number) =>
  z
    .string()
    .min(alt)
    .max(ust)
    .refine((s) => !s.includes(EM_DASH), 'no U+2014 in text')
    .refine((s) => s === s.trim(), 'no surrounding whitespace');

export const kaynakSchema = z
  .object({
    /** Site the quotation was verified on. */
    kaynak: z.enum(['mevzuat.gov.tr', 'anayasa.gov.tr']),
    kanunNo: z.string().regex(/^\d{1,5}$/),
    kanunAdi: metin(3, 200),
    /** Article label ("11", "27"); null when the quotation comes from the header block (kunye) of the law. */
    madde: z
      .string()
      .regex(/^\d{1,4}(\/[A-Z])?$/)
      .nullable(),
    bolum: z.enum(['madde', 'kunye']),
    url: z.url().refine((u) => u.startsWith('https://'), 'https only'),
    /** mevzuat.gov.tr address parameters; required for that site so dogrula.ts can fetch the text. */
    mevzuatTur: z.number().int().positive().optional(),
    tertip: z.number().int().positive().optional(),
    /** Exact quotations; each must appear word for word in the cited article (dogrula.ts). */
    alintilar: z.array(metin(12, 700)).min(1).max(4),
    /** Date of the last successful word for word check; null while unverified. */
    dogrulamaTarihi: tarih.nullable(),
    /** Fingerprint of the article text at that check; a changed text changes it (dogrulama.ts maddeOzeti). */
    maddeOzeti: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .nullable(),
  })
  .strict()
  .superRefine((k, ctx) => {
    if ((k.bolum === 'madde') !== (k.madde !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['madde'],
        message: 'madde is required exactly when bolum is madde',
      });
    }
    if ((k.dogrulamaTarihi === null) !== (k.maddeOzeti === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['maddeOzeti'],
        message: 'dogrulamaTarihi and maddeOzeti are set together',
      });
    }
    if (k.kaynak === 'mevzuat.gov.tr' && (k.mevzuatTur === undefined || k.tertip === undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['tertip'],
        message: 'mevzuatTur and tertip are required for mevzuat.gov.tr',
      });
    }
    const host = new URL(k.url).hostname;
    if (!host.endsWith(k.kaynak)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: `url must be on ${k.kaynak}` });
    }
  });
export type Kaynak = z.infer<typeof kaynakSchema>;

export const editorSchema = z
  .object({ ad: metin(3, 120), tarih, surum: z.number().int().positive() })
  .strict();
export type EditorOnayi = z.infer<typeof editorSchema>;

export const kartSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\.\d{3}$/),
    oyun: z.enum(oyunlar),
    soru: metin(20, 900),
    secenekler: z.array(metin(1, 400)).min(2).max(5),
    dogruIndex: z.number().int().min(0).max(4),
    aciklama: metin(20, 1200),
    kaynaklar: z.array(kaynakSchema).min(1).max(3),
    /** One of the 20 HMGS subject areas (Ek G); null for a card outside the exam syllabus. */
    hmgsAlani: z.string().nullable(),
    zorluk: z.number().int().min(1).max(3),
    /** Corpus source keys (records.source_key): mevzuat:<no>:m<madde>, or mevzuat:<no> for a header quotation. */
    kaynakKayitIdleri: z.array(z.string().regex(/^[a-z-]+:\d{1,5}(:m\d{1,4})?$/)).min(1),
    /** Who wrote the draft: "yz_taslagi" for an AI draft, otherwise the name of the human author. */
    hazirlayan: metin(3, 120),
    editorler: z.array(editorSchema).max(2),
    surum: z.number().int().positive(),
    guncelleme: tarih,
    gorsel: z
      .object({ src: z.string().startsWith('/'), alt: metin(5, 200) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const bekle = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (c.dogruIndex >= c.secenekler.length) bekle(['dogruIndex'], 'dogruIndex is outside secenekler');
    if (new Set(c.secenekler).size !== c.secenekler.length)
      bekle(['secenekler'], 'choices must be different');
    if (c.oyun === 'dogru_yanlis' && c.secenekler.join('|') !== DOGRU_YANLIS_SECENEKLERI.join('|')) {
      bekle(['secenekler'], 'dogru_yanlis needs exactly Doğru and Yanlış');
    }
    if (c.oyun === 'hala_gecerli_mi' && c.secenekler.join('|') !== HALA_GECERLI_SECENEKLERI.join('|')) {
      bekle(['secenekler'], 'hala_gecerli_mi needs the three fixed choices');
    }
    if (c.oyun === 'hangisi_once') {
      if (c.secenekler.length !== 2) bekle(['secenekler'], 'hangisi_once needs exactly two choices');
      if (c.kaynaklar.reduce((n, k) => n + k.alintilar.length, 0) < 2) {
        bekle(['kaynaklar'], 'hangisi_once needs one quotation per choice');
      }
    }
    if (c.oyun === 'olay_karti' && c.secenekler.length < 3)
      bekle(['secenekler'], 'olay_karti needs 3 to 5 choices');
    if (c.hmgsAlani !== null && !hmgsAlanSlugleri.includes(c.hmgsAlani))
      bekle(['hmgsAlani'], 'unknown HMGS area');
    const beklenen = [...new Set(c.kaynaklar.map(kaynakKaydi))].sort();
    if (c.kaynakKayitIdleri.join('|') !== beklenen.join('|')) {
      bekle(['kaynakKayitIdleri'], `kaynakKayitIdleri must be ${JSON.stringify(beklenen)}`);
    }
    const adlar = c.editorler.map((e) => e.ad.toLocaleLowerCase('tr-TR'));
    if (new Set(adlar).size !== adlar.length)
      bekle(['editorler'], 'an editor can approve a version only once');
    if (adlar.includes(c.hazirlayan.toLocaleLowerCase('tr-TR'))) {
      bekle(['editorler'], 'the author of a card cannot approve it');
    }
    for (const [i, e] of c.editorler.entries()) {
      if (e.surum > c.surum)
        bekle(['editorler', i, 'surum'], 'approval is for a version that does not exist');
    }
  });
export type Kart = z.infer<typeof kartSchema>;

export const desteSchema = z
  .object({
    sema: z.literal(1),
    slug,
    baslik: metin(3, 120),
    aciklama: metin(20, 400),
    /** HMGS decks (one per subject area) need two editors per card. */
    hmgsAlani: z.string().nullable(),
    kartlar: z.array(kartSchema),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.hmgsAlani !== null && !hmgsAlanSlugleri.includes(d.hmgsAlani)) {
      ctx.addIssue({ code: 'custom', path: ['hmgsAlani'], message: 'unknown HMGS area' });
    }
    const idler = new Set<string>();
    for (const [i, k] of d.kartlar.entries()) {
      if (!k.id.startsWith(`${d.slug}.`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['kartlar', i, 'id'],
          message: `card id must start with ${d.slug}.`,
        });
      }
      if (idler.has(k.id))
        ctx.addIssue({ code: 'custom', path: ['kartlar', i, 'id'], message: 'duplicate card id' });
      idler.add(k.id);
      if (d.hmgsAlani !== null && k.hmgsAlani !== d.hmgsAlani) {
        ctx.addIssue({
          code: 'custom',
          path: ['kartlar', i, 'hmgsAlani'],
          message: 'card area differs from deck area',
        });
      }
    }
  });
export type Deste = z.infer<typeof desteSchema>;

/** The corpus key of a source (records.source_key of the mevzuat connector, services/worker-py/connectors/mevzuat.py). */
export function kaynakKaydi(k: Pick<Kaynak, 'kanunNo' | 'madde' | 'bolum'>): string {
  const norm =
    ['2709', '4721', '6216'].includes(k.kanunNo) || k.bolum === 'madde' ? 'mevzuat' : 'onceki-anayasa';
  return k.bolum === 'kunye' ? `${norm}:${k.kanunNo}` : `mevzuat:${k.kanunNo}:m${k.madde}`;
}

/** Approvals needed to publish: two different editors for HMGS cards, one for others. */
export const gerekenOnay = (hmgs: boolean) => (hmgs ? 2 : 1);

export const kaynakDogrulandiMi = (k: Kart) => k.kaynaklar.every((x) => x.dogrulamaTarihi !== null);

/** Approvals that count: given for the current version of the card. */
export const gecerliOnaylar = (k: Kart) => k.editorler.filter((e) => e.surum === k.surum);

export function kartDurumu(k: Kart, hmgs: boolean = k.hmgsAlani !== null): KartDurumu {
  if (!kaynakDogrulandiMi(k)) return 'taslak';
  return gecerliOnaylar(k).length >= gerekenOnay(hmgs) ? 'yayinda' : 'onay_bekliyor';
}

/** Deterministic UUID (version 5 style) of a content card id, so API clients and the database share one key. */
const AD_ALANI = Buffer.from('7f0a6a3e-5f1b-5c1e-9a55-6b0c0b5a1d11'.replace(/-/g, ''), 'hex');
export function kartUuid(id: string): string {
  const h = createHash('sha1').update(AD_ALANI).update(id, 'utf8').digest();
  h[6] = ((h[6] as number) & 0x0f) | 0x50;
  h[8] = ((h[8] as number) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** What the client sees (SRS card model): no editor names, no fingerprints, quotations as law[] and links[]. */
export interface KartGorunumu {
  id: string;
  uuid: string;
  deste: string;
  oyun: Oyun;
  soru: string;
  secenekler: string[];
  dogruIndex: number;
  aciklama: string;
  hmgsAlani: string | null;
  zorluk: number;
  surum: number;
  kanun: { ref: string; metin: string }[];
  baglantilar: { etiket: string; url: string }[];
  kaynakKayitIdleri: string[];
  /** Oldest date of the word for word source checks of this card. */
  kaynakDogrulama: string | null;
  gorsel?: { src: string; alt: string };
}

export function kartGorunumu(k: Kart, desteSlug: string): KartGorunumu {
  const kanun = k.kaynaklar.flatMap((s) =>
    s.alintilar.map((a) => ({
      ref: s.bolum === 'madde' ? `${s.kanunAdi} m.${s.madde}` : `${s.kanunAdi} (künye)`,
      metin: a,
    })),
  );
  const baglantilar = [
    ...new Map(k.kaynaklar.map((s) => [s.url, { etiket: s.kanunAdi, url: s.url }])).values(),
  ];
  return {
    id: k.id,
    uuid: kartUuid(k.id),
    deste: desteSlug,
    oyun: k.oyun,
    soru: k.soru,
    secenekler: k.secenekler,
    dogruIndex: k.dogruIndex,
    aciklama: k.aciklama,
    hmgsAlani: k.hmgsAlani,
    zorluk: k.zorluk,
    surum: k.surum,
    kanun,
    baglantilar,
    kaynakKayitIdleri: k.kaynakKayitIdleri,
    kaynakDogrulama:
      k.kaynaklar
        .map((s) => s.dogrulamaTarihi)
        .filter((t): t is string => t !== null)
        .sort()[0] ?? null,
    ...(k.gorsel ? { gorsel: k.gorsel } : {}),
  };
}
