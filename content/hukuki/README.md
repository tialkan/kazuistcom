# content/hukuki

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19. Sahibi: hukuk-uyum ajanı (docs/sahiplik.md).

Hiçbir metin Tarık onaylamadan yayımlanmaz (plan 11). Metinler uyum garantisi vermez.

## Biçim

Her dosya Markdown ve YAML ön bilgisiyle başlar. on-yuz kabuğu ön bilgiyi okur, gövdeyi render eder.

```yaml
title: Sayfa başlığı
slug: aydinlatma            # rota parçası
route: /hukuki/aydinlatma   # yayın yolu
lang: tr                    # yalnız tr (ADR-0032)
binding: true               # metinler bağlayıcıdır
version: 2026-10-23.1       # sürüm; consents.version alanına yazılan değer
date: 2026-10-19            # sürüm tarihi
status: taslak              # taslak veya yayinda; taslak durumundaki sayfa yayımlanmaz
consent_kind: aydinlatma    # varsa packages/db consent_kind değeri
```

Gövdede `{{...}}` biçimindeki yer tutucular (unvan dışı künye bilgileri, iletişim adresi, fiyat) yayından
önce doldurulur; dolmamış yer tutucu içeren sayfa yayımlanmamalıdır (istek: docs/istekler/hukuk-uyum-yayin-kapisi.md).
`[DOĞRULANACAK: ...]` işaretleri onaydan önce kapatılır.

## PDF'e dönüşen metinler (odeme, O6)

Üç metin (tr/on-bilgilendirme, tr/mesafeli-satis, tr/abonelik) sipariş anında doldurulup
PDF'e çevrilir ve kalıcı veri saklayıcısı olarak e-postayla gönderilir (Mesafeli Sözleşmeler Yön. m.6; Abonelik
Sözleşmeleri Yön. m.5). Yapı kuralları:

- Gövde yalnız başlık, paragraf, numaralı liste ve tablodan oluşur; görsel, bileşen ve gömülü HTML yoktur.
- Siparişe özgü alanlar aşağıdadır; sunucu her birini doldurur, eksik alan varsa PDF üretilmez. Ön bilgiye
  `pdf` ve `pdf_fields` alanları eklenmesi istendi (docs/istekler/hukuk-uyum-pdf-on-bilgi.md):
  - tr/on-bilgilendirme.md: AYLIK_KREDI, INDIRIM, IOS_SURUM, KREDI, ODEME_DONEMI, TUTAR_TL, URUN_ACIKLAMASI, URUN_ADI, URUN_TURU
  - tr/mesafeli-satis.md: ALICI_AD, ALICI_EPOSTA, SIPARIS_TARIHI, TUTAR_TL, URUN_ADI
  - tr/abonelik.md: ALICI_AD, ALICI_EPOSTA, AYLIK_INDIRIM_TL, AYLIK_KREDI, AYLIK_LISTE_FIYATI_TL, DONEM_BASLANGIC, DONEM_BITIS, ODEME_DONEMI, PLAN_ADI, SOZLESME_TARIHI, TUTAR_TL, YILLIK_TUTAR_TL
  Şirket alanlarından henüz bilinmeyenler ({{KEP}}) yayın kapısında kapanır.
- Bağlantılar tam adresle (https://kazuist.com/...) yazılır; PDF'te tıklanmadan okunabilir.
- Ön bilgiden sonraki ilk alıntı bloğu (TASLAK notu) ve on-bilgilendirme'deki "Gösterim kuralları" paragrafı
  PDF'e girmez; PDF'in başına metin sürümü (version) ve sipariş kimliği yazılır, consents kaydıyla eşleşir.
- Gövde en az 12 punto eşdeğeriyle basılır.

## Dosyalar

- tr/: bağlayıcı Türkçe metinler (plan 11 tablosu)

Kazuist yalnız Türkçedir (ADR-0032). İngilizce bilgilendirme sürümleri ve /legal/* adresleri kaldırıldı; yükleyici
`lang: tr` dışındaki metni reddeder, `alternate` (hreflang eşi) alanı kullanılmaz.
