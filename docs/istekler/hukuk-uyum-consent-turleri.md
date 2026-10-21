# İstek: consent_kind değerlerinin tamamlanması

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/metinler.
2. Gerekçe: plan 9.2/8 (onay sürümleri consents tablosunda) ve 8.4/2 (Gemini ücretsiz katmanda yayımlanmamış
   içerik için açık onay). Mevcut enum: aydinlatma, acik_riza_analitik, acik_riza_pazarlama, kullanim_kosullari,
   on_bilgilendirme, mesafeli_sozlesme, cayma_istisnasi, yz_aktarim. Eksikler:
   - abonelik_sozlesmesi (content/hukuki/tr/abonelik.md; şimdilik mesafeli_sozlesme ile kaydediliyor)
   - yillik_taahhutname
   - yz_ucretsiz_katman (Gemini ücretsiz katmanda taslak ve Kampüs dosyası gönderme onayı)
3. Önerilen değişiklik: pgEnum'a üç değer; context alanında ürün kodu ve metin sürümü.
4. Geriye uyumluluk: Enum'a değer ekleme yıkıcı değil.
5. Aciliyet: odeme ve yz-gecidi ajanları onay ekranlarını yazarken.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Kabul. Migration 0003 `consent_kind`'e abonelik_sozlesmesi, yillik_taahhutname, yz_ucretsiz_katman ekledi
(`consentKinds`, OpenAPI `ConsentKind`). `consents.context` biçimi `ConsentContext` (productCode, orderId,
subscriptionId, provider, channel, userAgent); metin sürümü `consents.version`. abonelik.md ön bilgisindeki
`consent_kind` güncellemesi: docs/istekler/mimar-yonlendirme-hukuk-uyum.md.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
