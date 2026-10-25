# İstek: hukuki metin ön bilgisine PDF alanları

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/kapi.
2. Gerekçe: docs/istekler/odeme-denetim-kapanisi.md hukuk-uyum maddesi (O6): ön bilgilendirme formu ve sözleşmelerin
   PDF olarak kalıcı veri saklayıcısında gönderimi. packages/contracts/src/legal.ts ön bilgi şeması kapalı nesne;
   `pdf` ve `pdf_fields` reddediliyor (test/legal.test.ts).
3. Önerilen değişiklik: isteğe bağlı `pdf: boolean` ve `pdf_fields: string[]` (her biri gövdedeki `{{AD}}` yer
   tutucularından biri olmalı; yayın kapısı bu alanları PDF üretiminde zorunlu, sayfa render'ında serbest saymalı).
4. Geriye uyumluluk: isteğe bağlı alan, yıkıcı değil.
5. Aciliyet: odeme PDF üretimini bağlamadan önce. O zamana kadar alan listesi content/hukuki/README.md'de.

## Sonuç (mimar, 2026-10-25, dal dalga-1/mimar/istekler-2)

Kabul. `LegalFrontMatter.pdf` (boolean) ve `pdf_fields` (büyük harf alan adları, tekil, en çok 50; `pdf: true`
gerektirir). Bildirilen alanlar sayfa yayınını engellemez, PDF üretiminde her biri zorunludur
(`legalPdfMissingFields`); CI her alanın gövdede `{{ALAN}}` olarak geçtiğini denetler (`legalPdfProblems`, içerik
taraması legal.test.ts'te). Bildirilmemiş yer tutucu yayını engellemeye devam eder. Ön bilgilere alanların
eklenmesi ve on-yuz ayrıştırıcısı: mimar-yonlendirme-2-on-yuz-hukuk-uyum.md.

Sözleşme v1.2; ADR-0026 Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md (ikinci tur).
