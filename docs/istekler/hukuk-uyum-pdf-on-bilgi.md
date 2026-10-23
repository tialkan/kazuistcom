# İstek: hukuki metin ön bilgisine PDF alanları

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/kapi.
2. Gerekçe: docs/istekler/odeme-denetim-kapanisi.md hukuk-uyum maddesi (O6): ön bilgilendirme formu ve sözleşmelerin
   PDF olarak kalıcı veri saklayıcısında gönderimi. packages/contracts/src/legal.ts ön bilgi şeması kapalı nesne;
   `pdf` ve `pdf_fields` reddediliyor (test/legal.test.ts).
3. Önerilen değişiklik: isteğe bağlı `pdf: boolean` ve `pdf_fields: string[]` (her biri gövdedeki `{{AD}}` yer
   tutucularından biri olmalı; yayın kapısı bu alanları PDF üretiminde zorunlu, sayfa render'ında serbest saymalı).
4. Geriye uyumluluk: isteğe bağlı alan, yıkıcı değil.
5. Aciliyet: odeme PDF üretimini bağlamadan önce. O zamana kadar alan listesi content/hukuki/README.md'de.
