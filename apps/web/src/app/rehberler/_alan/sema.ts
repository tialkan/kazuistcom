/**
 * Content model of the Rehberler module (plan 10.4, SRS FR-32..37). The JSON files in content/rehberler are imported
 * at build time (the standalone image has no content directory, same pattern as content/desteler) and validated
 * here: an invalid file stops the build. Text rules are checked by scripts/check-text.mjs and rehberler.test.ts.
 */
import { z } from 'zod';

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date as YYYY-MM-DD');
/** Display text: not empty, no em dash and no en dash (CLAUDE.md metin kurallari, yazim kurali 6.13). */
const metin = z
  .string()
  .trim()
  .min(2)
  .refine((s) => !s.includes(EM_DASH) && !s.includes(EN_DASH), 'no long or middle dash');
const url = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://'), 'https only');

/** An internal link; only these hrefs are allowed so no content file can link to an unknown route. */
export const ichBaglantilar = [
  '/yazma',
  '/tespit',
  '/rehberler',
  '/rehberler/makale',
  '/rehberler/tez',
  '/rehberler/zotero-endnote',
  '/rehberler/kontrol-listesi',
  '/rehberler/etik',
] as const;
const baglanti = z.object({ href: z.enum(ichBaglantilar), etiket: metin });

/** Which source kind a step's "search" button is meant for. null: the step has no search button. */
export const kaynakTurleri = ['mevzuat', 'karar', 'makale'] as const;

export const adimSchema = z.object({
  id: z.string().regex(/^[a-z]\d{2}$/),
  baslik: metin,
  aciklama: metin,
  ipucu: metin.optional(),
  baglanti: baglanti.optional(),
  kaynakTuru: z.enum(kaynakTurleri).nullable().optional(),
  dayanak: z.string().optional(),
  dayanakNotu: metin.optional(),
});
export type Adim = z.infer<typeof adimSchema>;

const benzersizIdler = (adimlar: { id: string }[]) =>
  new Set(adimlar.map((a) => a.id)).size === adimlar.length;

export const makaleSchema = z.object({
  slug: z.literal('makale'),
  guncelleme: tarih,
  baslik: metin,
  ozet: metin,
  adimlar: z.array(adimSchema).length(12).refine(benzersizIdler, 'unique step ids'),
});

export const dogrulamaDuzeyleri = ['birincil', 'ikincil'] as const;
export const tezKaynagiSchema = z.object({
  id: z.string(),
  kisa: metin,
  kunye: metin,
  url,
  dogrulama: z.enum(dogrulamaDuzeyleri),
  dogrulamaNotu: metin,
});

export const tezSchema = z
  .object({
    slug: z.literal('tez'),
    guncelleme: tarih,
    baslik: metin,
    ozet: metin,
    modelUyari: metin,
    model: z.array(z.object({ baslik: metin, aciklama: metin })).min(5),
    adimlar: z.array(adimSchema).length(12).refine(benzersizIdler, 'unique step ids'),
    kaynaklar: z.array(tezKaynagiSchema).min(1),
  })
  .superRefine((t, ctx) => {
    const idler = new Set(t.kaynaklar.map((k) => k.id));
    t.adimlar.forEach((a, i) => {
      if (!a.dayanak)
        ctx.addIssue({ code: 'custom', path: ['adimlar', i], message: 'thesis steps need a dayanak' });
      else if (!idler.has(a.dayanak))
        ctx.addIssue({
          code: 'custom',
          path: ['adimlar', i, 'dayanak'],
          message: `unknown source ${a.dayanak}`,
        });
      if (!a.dayanakNotu)
        ctx.addIssue({
          code: 'custom',
          path: ['adimlar', i, 'dayanakNotu'],
          message: 'dayanakNotu required',
        });
    });
  });

const kaynakKaydi = z.object({ ad: metin, url, okuma: tarih });

export const zoteroEndnoteSchema = z.object({
  slug: z.literal('zotero-endnote'),
  guncelleme: tarih,
  baslik: metin,
  ozet: metin,
  arayuzNotu: metin,
  karsilastirmaBaslik: metin,
  karsilastirma: z.array(z.object({ ozellik: metin, zotero: metin, endnote: metin })).min(5),
  zotero: z.object({ baslik: metin, adimlar: z.array(adimSchema).length(8) }),
  endnote: z.object({ baslik: metin, adimlar: z.array(adimSchema).length(6) }),
  oneriler: z.array(z.object({ baslik: metin, metin })).min(2),
  kaynaklar: z.array(kaynakKaydi).min(1),
});

export const kontrolEtiketleri = ['makale-ve-tez', 'yalniz-tez'] as const;
export const kontrolSchema = z.object({
  slug: z.literal('kontrol-listesi'),
  guncelleme: tarih,
  baslik: metin,
  ozet: metin,
  maddeler: z
    .array(
      z.object({
        id: z.string().regex(/^k\d{2}$/),
        etiket: z.enum(kontrolEtiketleri),
        metin,
        kural: z
          .string()
          .regex(/^\d+\.\d+$/)
          .optional(),
        baglanti: baglanti.optional(),
      }),
    )
    .length(14)
    .refine(benzersizIdler, 'unique item ids'),
});

export const etikIhlalleri = [
  'intihal',
  'sahtecilik',
  'carpitma',
  'tekrar-yayim',
  'dilimleme',
  'haksiz-yazarlik',
] as const;
export const etikSchema = z.object({
  slug: z.literal('etik'),
  guncelleme: tarih,
  baslik: metin,
  ozet: metin,
  kaynak: kaynakKaydi.extend({ okuma: tarih }),
  ornekNotu: metin,
  ihlaller: z
    .array(
      z.object({
        id: z.enum(etikIhlalleri),
        ad: metin,
        fikra: z.string().regex(/^m\. 4\/1 \([a-zç]\)$/),
        tanim: metin,
        ornek: metin,
        korunma: metin,
      }),
    )
    .length(6)
    .refine((l) => new Set(l.map((i) => i.id)).size === 6, 'six distinct violations'),
  ekNot: metin,
  yaptirimNotu: metin,
});

export type Makale = z.infer<typeof makaleSchema>;
export type Tez = z.infer<typeof tezSchema>;
export type ZoteroEndnote = z.infer<typeof zoteroEndnoteSchema>;
export type Kontrol = z.infer<typeof kontrolSchema>;
export type Etik = z.infer<typeof etikSchema>;
