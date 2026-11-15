import byok from '@kazuist/i18n/tr/byok.json' with { type: 'json' };

/**
 * Public pricing display from plan.md 4.2-4.4. Free/BYOK model approved on 2026-10-27 (ADR-0029).
 * Package prices include VAT. Runtime financial catalog remains versioned in packages/ledger.
 * Plan and operation names are content, kept here alongside the numbers.
 */
export const fiyatTablosuSurumu = '2026-10-27';

export type Plan = {
  kod: 'ucretsiz' | 'byok' | 'kredi';
  ad: string;
  kime: string;
  fiyat: string;
  kredi: string;
  ozellik: string;
};

/** The free plan's allowance cell (plan 4.2) in its two sentences; the promo one is shown only when it holds. */
const gunlukHak = 'Günlük hak: 2 kaynaklı özet, edu.tr doğrulanmışsa 5.';
const promosyon = 'Açılışta 50 promosyon kredisi.';

export const planlar: Plan[] = [
  {
    kod: 'ucretsiz',
    ad: 'Ücretsiz',
    kime: 'Hesabı olan herkes',
    fiyat: '0 TL',
    kredi: `${gunlukHak} ${promosyon}`,
    ozellik: 'Tüm özellikler; platform YZ işlemleri günlük ücretsiz hakla',
  },
  {
    kod: 'byok',
    ad: 'BYOK',
    kime: 'Kendi sağlayıcı anahtarını kullanan herkes',
    fiyat: '0 TL',
    kredi: 'Platform kredisi gerekmez; sağlayıcı kullanım bedeli kullanıcıya aittir.',
    ozellik: 'Tüm özellikler; YZ işlemleri kendi anahtarıyla, adil kullanım sınırıyla',
  },
  {
    kod: 'kredi',
    ad: 'Platform kredisi',
    kime: 'Kendi anahtarını kullanmadan platform YZ hizmetini seçen herkes',
    fiyat: 'Paket ücreti',
    kredi: 'İsteğe bağlı 300, 1.000 veya 3.000 kredi',
    ozellik: 'Tüm özellikler; platform YZ işlemlerinde kullandıkça kredi düşülür',
  },
];

/** Server configuration that decides which offer the page may make; read per request, never sent to the client. */
export interface Teklif {
  /** platformAiAvailable(): a platform key and AI_DAILY_BUDGET_TRY are set, so the daily free allowance runs. */
  platformYz: boolean;
  /** odemeAcik(): the iyzico credentials are set, so credits can be bought. */
  satisAcik: boolean;
}

/** Promo credits are spent on platform AI calls and come with the credit system, so both have to be on. */
export const promosyonVar = (t: Teklif): boolean => t.platformYz && t.satisAcik;

/**
 * Plan rows as offered right now. With the platform AI on and sales open this is plan 4.2 verbatim. Without the
 * platform AI the free plan cannot promise a daily allowance: it says that summaries run with the user's own key.
 * While sales are off the promo credit sentence is dropped.
 */
export function gorunenPlanlar(t: Teklif): Plan[] {
  return planlar.map((p) => {
    if (p.kod !== 'ucretsiz') return p;
    if (!t.platformYz)
      return { ...p, kredi: byok.teklif.ucretsizKrediByok, ozellik: byok.teklif.ucretsizOzellikByok };
    return promosyonVar(t) ? p : { ...p, kredi: gunlukHak };
  });
}

export type Paket = { ad: string; kredi: string; fiyat: string; krediBasi: string };
export const paketler: Paket[] = [
  { ad: 'Başlangıç', kredi: '300', fiyat: '39 TL', krediBasi: '0,130 TL' },
  { ad: 'Standart', kredi: '1.000', fiyat: '109 TL', krediBasi: '0,109 TL' },
  { ad: 'Yoğun', kredi: '3.000', fiyat: '299 TL', krediBasi: '0,100 TL' },
];

export type Islem = { ad: string; kredi: string };
export const islemler: Islem[] = [
  { ad: 'Kaynaklı özet (standart)', kredi: '2' },
  { ad: 'Derin özet (20 kaynak, otorite ayrımı)', kredi: '60' },
  { ad: 'Kılavuzdan şablon (kural çıkarma)', kredi: '30' },
  { ad: 'Kısaltmalar cetveli', kredi: '2' },
  { ad: 'Kart taslağı (akademisyen)', kredi: '1' },
  { ad: 'Arama, atıf ağı, onaylı dergi şablonu', kredi: '0' },
];
