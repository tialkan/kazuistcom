/**
 * HMGS subject areas and their weights (plan Ek G, FR-93). Source of the 120 question, five choice, 155 minute
 * format and the 70 pass mark: OSYM 2026 application guide as recorded in plan.md Ek G, legal basis the Hukuk
 * Mesleklerine Giris Sinavi ve Idari Yargi On Sinavi Yonetmeligi. The 2027 session dates are not stated here: they
 * come from the OSYM calendar when it is published (plan 10.6/3).
 */

export interface HmgsAlani {
  slug: string;
  ad: string;
  /** Share of the exam in per mille (5 percent is 50, 2.5 percent is 25), so no float arithmetic is needed. */
  oranBinde: number;
  /** Questions in a full 120 question exam. */
  denemeSorusu: number;
  /** Approved question target for 1.0 (plan Ek G). */
  hedefSoru: number;
}

export const hmgsAlanlari: readonly HmgsAlani[] = [
  { slug: 'anayasa-hukuku', ad: 'Anayasa Hukuku', oranBinde: 50, denemeSorusu: 6, hedefSoru: 30 },
  { slug: 'anayasa-yargisi', ad: 'Anayasa Yargısı', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  { slug: 'idare-hukuku', ad: 'İdare Hukuku', oranBinde: 50, denemeSorusu: 6, hedefSoru: 30 },
  {
    slug: 'idari-yargilama-usulu',
    ad: 'İdari Yargılama Usulü',
    oranBinde: 25,
    denemeSorusu: 3,
    hedefSoru: 15,
  },
  { slug: 'medeni-hukuk', ad: 'Medeni Hukuk', oranBinde: 125, denemeSorusu: 15, hedefSoru: 75 },
  { slug: 'borclar-hukuku', ad: 'Borçlar Hukuku', oranBinde: 100, denemeSorusu: 12, hedefSoru: 60 },
  { slug: 'ticaret-hukuku', ad: 'Ticaret Hukuku', oranBinde: 100, denemeSorusu: 12, hedefSoru: 60 },
  {
    slug: 'hukuk-yargilama-usulu',
    ad: 'Hukuk Yargılama Usulü',
    oranBinde: 100,
    denemeSorusu: 12,
    hedefSoru: 60,
  },
  { slug: 'icra-ve-iflas-hukuku', ad: 'İcra ve İflas Hukuku', oranBinde: 50, denemeSorusu: 6, hedefSoru: 30 },
  { slug: 'ceza-hukuku', ad: 'Ceza Hukuku', oranBinde: 75, denemeSorusu: 9, hedefSoru: 45 },
  { slug: 'ceza-yargilama-usulu', ad: 'Ceza Yargılama Usulü', oranBinde: 50, denemeSorusu: 6, hedefSoru: 30 },
  {
    slug: 'is-ve-sosyal-guvenlik-hukuku',
    ad: 'İş ve Sosyal Güvenlik Hukuku',
    oranBinde: 50,
    denemeSorusu: 6,
    hedefSoru: 30,
  },
  { slug: 'vergi-hukuku', ad: 'Vergi Hukuku', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  { slug: 'vergi-usul-hukuku', ad: 'Vergi Usul Hukuku', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  { slug: 'avukatlik-hukuku', ad: 'Avukatlık Hukuku', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  {
    slug: 'hukuk-felsefesi-ve-sosyolojisi',
    ad: 'Hukuk Felsefesi ve Sosyolojisi',
    oranBinde: 25,
    denemeSorusu: 3,
    hedefSoru: 15,
  },
  { slug: 'turk-hukuk-tarihi', ad: 'Türk Hukuk Tarihi', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  { slug: 'milletlerarasi-hukuk', ad: 'Milletlerarası Hukuk', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
  {
    slug: 'milletlerarasi-ozel-hukuk',
    ad: 'Milletlerarası Özel Hukuk',
    oranBinde: 25,
    denemeSorusu: 3,
    hedefSoru: 15,
  },
  { slug: 'genel-kamu-hukuku', ad: 'Genel Kamu Hukuku', oranBinde: 25, denemeSorusu: 3, hedefSoru: 15 },
];

export const hmgsAlanSlugleri: readonly string[] = hmgsAlanlari.map((a) => a.slug);
export const hmgsAlaniBul = (slug: string) => hmgsAlanlari.find((a) => a.slug === slug);

/** Format of the real exam (plan Ek G). */
export const hmgsSinavi = Object.freeze({
  soruSayisi: 120,
  secenekSayisi: 5,
  sureDakika: 155,
  tamPuan: 100,
  baraj: 70,
});
