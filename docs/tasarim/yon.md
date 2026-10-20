# Tasarım yönü: kâğıt ve mürekkep

Kaynak: plan.md bölüm 12, ADR-0015, webtasarim.md. Tek yön budur; alternatif yön yoktur.

## Fikir

Kazuist hukuk metnini kaynağıyla birlikte okutur. Klasik şerh geleneğinde metin ortada durur, açıklama ve
dayanak kenara yazılır; kenar notları çoğu zaman kırmızı mürekkeple (lâl) işaretlenir. Görsel kimlik bu
sayfadan türer: açık kâğıt zemin, koyu mürekkep metin, tek vurgu olarak lâl kırmızısı.

## İmza öğesi: kenar şerhi

- Masaüstünde (kapsayıcı 48rem ve üstü) özet cümlesi okuma sütununda, kaynak çipleri aynı hizada sağ kenarda
  durur; kenar ince bir çizgiyle ayrılır, her çipin solunda lâl çizgi vardır.
- Mobilde kaynaklar cümlenin altına satır içi çip olarak iner. DOM sırası cümle, sonra kaynak; ekran okuyucu da
  aynı sırayla okur. Kenar `aside` ve erişilebilir adla işaretlenir.
- Bileşenler: `SerhliMetin`, `SerhSatiri`, `KaynakCipi` (packages/ui). Ziyaretçi ürünü bu düzenden tanır.

## Renk

| Belirteç | Değer | Kullanım |
|---|---|---|
| --kz-color-bg | #fbf8f1 | Kâğıt zemin |
| --kz-color-text | #1c1b19 | Mürekkep metin, birincil düğme |
| --kz-color-text-muted | #57524a | İkincil metin (7:1 üstü) |
| --kz-color-accent | #a1351f | Tek vurgu: lâl. Şerh çizgisi, etkin sekme, üst etiket |
| --kz-color-kampus | #0d6e6c | Yalnız Turkuaz Kampüs (bant, sekme, Kampüs bileşenleri) |

Başarı, uyarı ve hata renkleri vardır ama hiçbir zaman tek başına bilgi taşımaz. Tüm metin renkleri kâğıt ve
yüzey üzerinde 4.5:1'i geçer; packages/ui/test/tokens.test.ts bunu ölçer. Karanlık tema 1.0'da yoktur (K-15).

## Tipografi

- Başlık ve okuma: Source Serif 4 (değişken, opsz ve wght).
- Arayüz: IBM Plex Sans; künye, esas ve karar numarası: IBM Plex Mono. Plex dosyaları OFL'deki ayrılmış ad
  ("Plex") nedeniyle alt kümelemeden sonra KzSans ve KzMono adını taşır.
- Yerel woff2, Latin, Latin-1 ve Türkçe harfler (Ğğ İı Şş), `font-display: swap`; yalnız ilk ekran yüzleri
  ön yüklenir. Lisanslar ve değişiklik notu: apps/web/public/fonts/NOTICE.txt.
- Ölçek cesurdur: ana başlık clamp(2.25rem, 3.75rem), etiket 0.8125rem.

## Biçim ve derinlik

Kâğıt kenarı köşelidir (2 px); yalnız avatar yuvarlaktır. Gölge yalnız iletişim kutusunda vardır. Kartlar yerine
çizgiler kullanılır: tablo üstünde kalın mürekkep çizgisi, satırlarda ince ayraç. "İkon, başlık, iki satır" üçlü
kart kalıbı, gradyan, cam efekti, emoji, açılır pencere yoktur.

## Etiketler

Her etiket renk, şekil ve metin taşır (plan 7.3). Şekiller: Yeni dolu daire, Yerleşik dolu kare, Eski boş kare,
Öncü üçgen, Anonimleştirildi çizgili daire, İlgililik çubuk, Güncellik uyarısı ünlemli üçgen, Canlı kaynak
halkalı nokta, Veri günü takvim; otorite: bağlayıcı dolu baklava, yüksek emsal boş baklava, emsal boş daire,
diğer çizgili daire. Kayıt etiketlerinin ve otorite sınıflarının şekilleri kendi içinde benzersizdir (test).

## Durumlar ve erişilebilirlik

Boş, hata (role=alert), yükleniyor (role=status, hareket azaltılınca durur), 404 ve bakım ekranları tasarlıdır.
Form hatası her zaman var olan aria-live bölgesinde duyurulur, etiket görünür. Dokunma hedefi 44 px, odak halkası
3 px mürekkep. "İçeriğe atla" kabuğun ilk öğesidir.

## Görseller

YZ ile üretilmiş görsel yoktur. Casuist sayfalarındaki başlık görseli ve program logoları yalın yer tutucuyla
(alt metin görünür) gösterilir; çizer işi gelene kadar meslek avatarı kesik çizgili boş dairedir.

## Doğrulama

docs/tasarim/ekran altında 13 sayfanın 375, 768 ve 1440 px tam sayfa ekran görüntüleri ve axe-sonuc.json
(375 ve 1440 px'te WCAG 2.1 A/AA etiketleri) vardır. Yeniden üretmek için ekran-goruntusu.mjs başındaki komut.
