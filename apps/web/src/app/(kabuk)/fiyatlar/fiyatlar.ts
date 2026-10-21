/**
 * Price table, single source (wt.5). Copied from plan.md 4.2, 4.3 and 4.4; approved by Tarik on 2026-10-20
 * (docs/kararlar.md).
 * All prices include VAT (plan 4.1/7). The odeme module will replace this with the versioned
 * price table from packages/ledger; until then this file is the only place prices live.
 * Plan and operation names are content, not UI strings, so they are kept here with the numbers.
 */
export const fiyatTablosuSurumu = '2026-10-20';

export type Plan = { ad: string; kime: string; fiyat: string; kredi: string; ozellik: string };
export const planlar: Plan[] = [
  {
    ad: 'Ücretsiz',
    kime: 'Hesabı olan herkes',
    fiyat: '0 TL',
    kredi: 'Yok. Günlük hak: 2 kaynaklı özet, edu.tr doğrulanmışsa 5. Açılışta 50 promosyon kredisi.',
    ozellik:
      'Arama, filtre, etiket, atıf ağı görüntüleme, rehberler, ayda 1 kılavuzdan şablon, onaylı dergi şablonları, 4 oyun (haftada 3 deste), 100 kayıtlık Kaydettiklerim, Kampüs okuma, takip ve paylaşım',
  },
  {
    ad: 'BYOK',
    kime: 'Kendi anahtarı olan',
    fiyat: '0 TL',
    kredi: 'Yok',
    ozellik: 'Ücretsiz plan ve tüm YZ işlemleri kendi anahtarıyla, adil kullanım sınırıyla',
  },
  {
    ad: 'Öğrenci Plus',
    kime: 'Öğrenci, HMGS adayı',
    fiyat: '99 TL/ay veya 799 TL/yıl',
    kredi: '1.000',
    ozellik: 'Tüm desteler, HMGS denemeleri, sınırsız kayıt, dışa aktarma, Kalemcik’in tamamı',
  },
  {
    ad: 'Akademisyen',
    kime: 'Öğretim elemanı, araştırma görevlisi, doktora öğrencisi',
    fiyat: '249 TL/ay veya 1.990 TL/yıl',
    kredi: '3.000',
    ozellik:
      'Plus ve gelişmiş arama, atıf ağı tam görünüm, özel deste oluşturma (derse atama 1.1), uyarılar (1.1)',
  },
  {
    ad: 'Kurumsal',
    kime: 'Fakülte, enstitü, kütüphane',
    fiyat: 'Teklif',
    kredi: 'Havuz',
    ozellik: '2.0: IP aralığı veya SSO, toplu fatura',
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
  { ad: 'Kampüs YZ özeti', kredi: '3' },
  { ad: 'Poster taslağı', kredi: '4' },
  { ad: 'Kısaltmalar cetveli', kredi: '2' },
  { ad: 'Kart taslağı (akademisyen)', kredi: '1' },
  { ad: 'Arama, atıf ağı, onaylı dergi şablonu', kredi: '0' },
];
