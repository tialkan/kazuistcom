# İstek: kırık iç bağlantılar, landmark ve ana sayfa performansı

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: on-yuz. Kaynak: docs/kalite/dalga-1.md
O-05 (orta), D-01, D-02, Lighthouse satırı. Aciliyet: erken geçiş (1E) öncesi; WebLINKrobot "kırık bağlantı 0".

## Gözlenen

1. Aynı kökenli bağlantılardan 9'u 404 (`tests/e2e/specs/sayfalar.spec.ts` "internal links"): kabuk sekmeleri
   ve Hedefim `/ara`, `/atif-agi`, `/rehberler`, `/yazma`, `/pratik`, `/kampus`, `/kaydettiklerim`,
   `/hesap/hedef`; arşivde `/demo` (`apps/web/src/app/(casuist)/_icerik/eski.json`, /eski sayfası). Next.js
   Link ön getirmesi her sayfada bu 404'leri istiyor.
2. axe (moderate): ana sayfada şerh satırlarındaki `aside`'lar ayırt edici etiket taşımıyor
   (landmark-unique, `.kz-serh-satiri > aside`, packages/ui). axe (minor): /eski karşılaştırma tablosunda boş
   `th` (empty-table-header).
3. Lighthouse 13.5.0, mobil, simüle kısıtlama, yerel tek ölçüm: `/` performans 89 (eşik 90), LCP 3,8 sn;
   diğer sayfalar 92-94, LCP 3,2-3,3 sn. CLS 0. Staging ve tekrar ölçüm yok; eğilim göstergesi.

## İstenen

1. Erken geçişte açık olmayan modüller için kabukta bağlantı yerine "yakında" durumu veya yalnız açık
   modüllerin gösterilmesi (karar on-yuz ve seo); `/demo` bağlantısının arşivde kaldırılması veya hedefin
   belirlenmesi (Casuist metni değişmez kuralı: yalnız bağlantı).
2. Şerh `aside`'larına `aria-label` (ör. "Kaynak 1"), /eski tablo başlığı.
3. Ana sayfa LCP: ilk ekran yazı tipi ve görsel önceliği gözden geçirilmeli; Lighthouse CI bütçesi
   (altyapi) eklenince eşik orada izlenir.

## Doğrulama

`tests/e2e/specs/sayfalar.spec.ts` ve `erisilebilirlik.spec.ts` (moderate ihlaller sonuç ekinde listelenir).

## Sonuç

on-yuz, dal `dalga-1/on-yuz/kapi`, 2026-10-22:

1. Kabukta (sekmeler, alt bilgi, ana sayfa modül listesi, Kampüs bandı, 404) kapalı modüller bağlantı yerine
   "yakında" notlu metin. Açık modüller `apps/web/src/app/(kabuk)/_kabuk/rotalar.ts` içindeki `acikModuller`
   kümesindedir; modül ajanı rotasını yayımladığı PR'da href'ini oraya ekler. Hedefim `/hesap`'a gider. Örnek
   sorular /ara açılana kadar arama kutusunu doldurur (`#q`). Arşivde `/demo` bağlantısı kaldırıldı, metin
   aynen kaldı (donustur.py `DEAD_LINKS`).
2. Ana sayfa şerh `aside`'ları "Bu cümlenin kaynakları 1/2" ile ayırt ediliyor; /eski tablosundaki boş `th`
   `td` olarak çiziliyor. Ek: sekmeler artık kaydırma yerine satır kırıyor (axe scrollable-region-focusable).
3. Yazı tipleri değişken eksenleri kullanılan aralığa indirildi (Source Serif 4 opsz 20, wght 400-700;
   Plex Sans wdth 100, wght 400-700): 128 KB'tan 35 KB'a ve 59 KB'tan 29 KB'a. Lighthouse 13.5.0 mobil,
   yerel, 3 ölçüm: / 97 (LCP 2,6-2,7 sn), /fiyatlar 97-98, /en 96-97; erişilebilirlik 100.

Kalan: sayfalar.spec.ts "each page has exactly one main landmark" /giris'te düşüyor, çünkü (hesap) ve (odeme)
sayfaları kabuğun `main`'i içinde kendi `<main>`'ini açıyor (kimlik, odeme): docs/istekler/on-yuz-tekil-main.md.
