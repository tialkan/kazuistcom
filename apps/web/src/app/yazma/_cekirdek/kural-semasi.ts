import { z } from 'zod';

/**
 * Rule schema of SRS 6.2, shared by guide extraction, the control screen, the DOCX builder and the
 * checker. The defaults are only examples: they are never offered as the rule of any institute (SRS 6.2).
 */

export const kuralAnahtarlari = [
  'institution',
  'paper',
  'mTop',
  'mBottom',
  'mLeft',
  'mRight',
  'font',
  'size',
  'footSize',
  'line',
  'indent',
  'spAfter',
  'h1Size',
  'h1Upper',
  'h2Size',
  'h3Size',
  'pageNum',
  'frontRoman',
  'citation',
  'sections',
  'notes',
  'wordLimit',
  'absLimit',
] as const;
export type KuralAnahtari = (typeof kuralAnahtarlari)[number];

export const tezTurleri = ['tez', 'makale'] as const;
export type SablonTuru = (typeof tezTurleri)[number];

export const sayfaNoKonumlari = ['alt-orta', 'alt-sag', 'ust-sag'] as const;
export type SayfaNoKonumu = (typeof sayfaNoKonumlari)[number];

export const kagitBoyutlari = ['A4', 'A5', 'B5', 'Letter'] as const;

const Aralik = z
  .strictObject({
    min: z.number().int().min(0).max(1_000_000).nullable(),
    max: z.number().int().min(1).max(1_000_000).nullable(),
  })
  .refine((a) => a.min !== null || a.max !== null, { message: 'empty range' })
  .refine((a) => a.min === null || a.max === null || a.min <= a.max, { message: 'min above max' });
export type SozcukAraligi = z.infer<typeof Aralik>;

const cm = z.number().min(0.5).max(6);
const punto = z.number().min(6).max(36);

/** One schema per field; the same schemas validate model output, user edits and stored rules. */
export const alanSemalari = {
  institution: z.string().trim().min(2).max(200),
  paper: z.enum(kagitBoyutlari),
  mTop: cm,
  mBottom: cm,
  mLeft: cm,
  mRight: cm,
  font: z.string().trim().min(2).max(60),
  size: z.number().min(8).max(20),
  footSize: z.number().min(6).max(18),
  line: z.number().min(0.8).max(3),
  indent: z.number().min(0).max(4),
  spAfter: z.number().min(0).max(48),
  h1Size: punto,
  h1Upper: z.boolean(),
  h2Size: punto,
  h3Size: punto,
  pageNum: z.enum(sayfaNoKonumlari),
  frontRoman: z.boolean(),
  citation: z.string().trim().min(2).max(200),
  sections: z.array(z.string().trim().min(1).max(120)).min(1).max(40),
  notes: z.array(z.string().trim().min(1).max(400)).max(5),
  wordLimit: Aralik,
  absLimit: Aralik,
} as const satisfies Record<KuralAnahtari, z.ZodType>;

export type KuralDegerleri = { [K in KuralAnahtari]: z.infer<(typeof alanSemalari)[K]> };

/** Fields of the thesis template, of the article template, and the core fields of plan 15.3/3. */
export const tezAlanlari: readonly KuralAnahtari[] = kuralAnahtarlari.filter(
  (k) => k !== 'wordLimit' && k !== 'absLimit',
);
export const makaleAlanlari: readonly KuralAnahtari[] = kuralAnahtarlari.filter(
  (k) => k !== 'frontRoman' && k !== 'h1Upper' && k !== 'sections',
);
export const cekirdekAlanlar: readonly KuralAnahtari[] = [
  'mTop',
  'mBottom',
  'mLeft',
  'mRight',
  'font',
  'size',
  'line',
  'pageNum',
  'citation',
];

export const alanlarOf = (tur: SablonTuru): readonly KuralAnahtari[] =>
  tur === 'tez' ? tezAlanlari : makaleAlanlari;

/** The 17 default sections of SRS 6.2; sections before "Giriş" form the front matter. */
export const varsayilanBolumler = [
  'Dış Kapak',
  'İç Kapak',
  'Kabul ve Onay',
  'Etik Beyan',
  'Özet',
  'Abstract',
  'Önsöz',
  'İçindekiler',
  'Kısaltmalar',
  'Tablolar Listesi',
  'Şekiller Listesi',
  'Giriş',
  'Birinci Bölüm',
  'İkinci Bölüm',
  'Sonuç',
  'Kaynakça',
  'Özgeçmiş',
] as const;

export const varsayilanDegerler: KuralDegerleri = {
  institution: '[Üniversite] [Enstitü]',
  paper: 'A4',
  mTop: 3,
  mBottom: 2.5,
  mLeft: 3.5,
  mRight: 2.5,
  font: 'Times New Roman',
  size: 12,
  footSize: 10,
  line: 1.5,
  indent: 1.25,
  spAfter: 6,
  h1Size: 14,
  h1Upper: true,
  h2Size: 12,
  h3Size: 12,
  pageNum: 'alt-orta',
  frontRoman: true,
  citation: 'İSNAD 2. Edisyon (dipnotlu)',
  sections: [...varsayilanBolumler],
  notes: [],
  wordLimit: { min: null, max: 15000 },
  absLimit: { min: null, max: 250 },
};

export const kaynaklar = ['kilavuz', 'ornek', 'duzenlendi'] as const;
export type Kaynak = (typeof kaynaklar)[number];

/** Evidence of a field taken from the guide (FR-92): page and an excerpt that exists verbatim in the guide. */
export interface Kanit {
  sayfa: number | null;
  alinti: string;
}

/** A rule set as the control screen holds it: values, where each came from, and the evidence. */
export interface KuralKaydi {
  tur: SablonTuru;
  degerler: KuralDegerleri;
  kaynaklar: Record<KuralAnahtari, Kaynak>;
  kanitlar: Partial<Record<KuralAnahtari, Kanit>>;
}

export function ornekKayit(tur: SablonTuru): KuralKaydi {
  const degerler = structuredClone(varsayilanDegerler);
  if (tur === 'makale') {
    degerler.line = 1.15;
    degerler.indent = 0;
    degerler.sections = ['Öz', 'Anahtar Kelimeler', 'Abstract', 'Keywords', 'Giriş', 'Sonuç', 'Kaynakça'];
  }
  return {
    tur,
    degerler,
    kaynaklar: Object.fromEntries(kuralAnahtarlari.map((k) => [k, 'ornek'])) as Record<KuralAnahtari, Kaynak>,
    kanitlar: {},
  };
}

/** Replace one value by the user's edit. A guide value that changes is no longer "Kılavuzdan". */
export function alanDegistir<K extends KuralAnahtari>(
  kayit: KuralKaydi,
  anahtar: K,
  deger: KuralDegerleri[K],
): KuralKaydi {
  const esit = JSON.stringify(kayit.degerler[anahtar]) === JSON.stringify(deger);
  if (esit) return kayit;
  return {
    ...kayit,
    degerler: { ...kayit.degerler, [anahtar]: deger },
    kaynaklar: { ...kayit.kaynaklar, [anahtar]: 'duzenlendi' },
  };
}

export type DogrulamaSonucu =
  | { ok: true; degerler: KuralDegerleri }
  | { ok: false; hatalar: Partial<Record<KuralAnahtari, string>> };

/** Validate a whole value set; used before building a template and when loading stored rules. */
export function degerleriDogrula(girdi: unknown): DogrulamaSonucu {
  const hatalar: Partial<Record<KuralAnahtari, string>> = {};
  const kaynak = (typeof girdi === 'object' && girdi !== null ? girdi : {}) as Record<string, unknown>;
  const sonuc: Record<string, unknown> = {};
  for (const k of kuralAnahtarlari) {
    const r = alanSemalari[k].safeParse(kaynak[k]);
    if (r.success) sonuc[k] = r.data;
    else hatalar[k] = r.error.issues[0]?.message ?? 'invalid';
  }
  if (Object.keys(hatalar).length) return { ok: false, hatalar };
  return { ok: true, degerler: sonuc as unknown as KuralDegerleri };
}

/** Clone with defaults for fields that are missing; invalid fields fall back to the example value. */
export function eksikleriDoldur(girdi: unknown, tur: SablonTuru): KuralKaydi {
  const kayit = ornekKayit(tur);
  const kaynak = (typeof girdi === 'object' && girdi !== null ? girdi : {}) as Record<string, unknown>;
  const degerler = kayit.degerler as unknown as Record<string, unknown>;
  for (const k of kuralAnahtarlari) {
    const r = alanSemalari[k].safeParse(kaynak[k]);
    if (r.success) degerler[k] = r.data;
  }
  return kayit;
}

/** Contract RuleSet.rules items (openapi RuleSet): key, value and the verbatim excerpt. */
export function kuralListesi(kayit: KuralKaydi): { key: string; value: unknown; evidence: string | null }[] {
  return alanlarOf(kayit.tur).map((k) => ({
    key: k,
    value: kayit.degerler[k],
    evidence: kayit.kaynaklar[k] === 'kilavuz' ? (kayit.kanitlar[k]?.alinti ?? null) : null,
  }));
}
