/**
 * Public pricing display from plan.md 4.2-4.4. Free/BYOK model approved on 2026-10-27 (ADR-0029).
 * Package prices include VAT. Runtime financial catalog remains versioned in packages/ledger.
 * Plan and operation names are content, kept here alongside the numbers.
 */
export const fiyatTablosuSurumu = '2026-10-27';

export type Plan = { ad: string; kime: string; fiyat: string; kredi: string; ozellik: string };
export const planlar: Plan[] = [
  {
    ad: 'Ücretsiz',
    kime: 'Hesabı olan herkes',
    fiyat: '0 TL',
    kredi: 'Günlük hak: 2 kaynaklı özet, edu.tr doğrulanmışsa 5. Açılışta 50 promosyon kredisi.',
    ozellik: 'Tüm özellikler; platform YZ işlemleri günlük ücretsiz hakla',
  },
  {
    ad: 'BYOK',
    kime: 'Kendi sağlayıcı anahtarını kullanan herkes',
    fiyat: '0 TL',
    kredi: 'Platform kredisi gerekmez; sağlayıcı kullanım bedeli kullanıcıya aittir.',
    ozellik: 'Tüm özellikler; YZ işlemleri kendi anahtarıyla, adil kullanım sınırıyla',
  },
  {
    ad: 'Platform kredisi',
    kime: 'Kendi anahtarını kullanmadan platform YZ hizmetini seçen herkes',
    fiyat: 'Paket ücreti',
    kredi: 'İsteğe bağlı 300, 1.000 veya 3.000 kredi',
    ozellik: 'Tüm özellikler; platform YZ işlemlerinde kullandıkça kredi düşülür',
  },
];

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
