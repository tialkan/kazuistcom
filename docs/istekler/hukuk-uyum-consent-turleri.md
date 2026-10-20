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
