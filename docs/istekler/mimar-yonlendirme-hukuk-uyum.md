# Yönlendirme: hukuk-uyum ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: hukuk-uyum. Dayanak: ADR-0023, istekler
`hukuk-uyum-consent-turleri.md`, `hukuk-uyum-kvkk-basvuru.md`, `hukuk-uyum-kaldirma-talebi.md`,
`hukuk-uyum-urun-tutarliligi.md` (madde 6).

## Birincil kaynaktan doğrulananlar (2026-10-20)

- KVKK m.11/1 (a) ile (ğ) arası dokuz bent ve m.13/2-3: mevzuat.gov.tr, 6698 sayılı Kanun PDF'i.
- Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ: RG 10.03.2018, sayı 30356 (resmigazete.gov.tr
  özgün metni). m.5: başvuruda ad soyad (yazılıysa imza), T.C. vatandaşları için T.C. kimlik numarası, yabancılar
  için uyruk ile pasaport veya varsa kimlik numarası, tebligata esas yerleşim yeri veya iş yeri adresi, varsa
  bildirime esas e-posta, telefon ve faks, talep konusu bulunması zorunludur; başvuru tarihi elektronik
  yöntemlerde başvurunun veri sorumlusuna ulaştığı tarihtir. Sonraki değişiklikler kontrol edilmedi.

## İşler

1. `content/hukuki/tr/basvuru.md`: Tebliğ künyesi ve m.5 bilgisiyle `[DOĞRULANACAK]` işaretleri kapatılabilir
   (kimlik numarası zorunlu alandır). Kimlik numarasının saklama süresi imha politikasına yazılsın.
2. `content/hukuki/tr/abonelik.md` ön bilgisinde `consent_kind: abonelik_sozlesmesi`; yıllık taahhütname metni
   için `yillik_taahhutname`; Gemini ücretsiz katman onayı için `yz_ucretsiz_katman` (yeni değerler v1.1'de).
3. İmha politikası (madde 6): sessions, audit_log, consents, takedown_requests, kvkk_requests, sources_raw ve
   jobs için saklama süreleri ve kanuni dayanakları. Süreler onaylanınca mimar `retention.sweep` iş türünü ekler.
4. Kaldırma talebi metni: sözleşme kind (kisisel_veri, telif, guncellik), hedef (karar, Kampüs paylaşımı,
   Kampüs dosyası), 72 saat gizleme ve 30 gün sürelerini taşıyor; metin bu adlarla uyumlu.
5. Hesap silme bekleme süresi: önerilen 14 gün, üst sınır 30 gün (ADR-0023); metinlere Tarık kararından sonra
   yazılır.

## Aciliyet

Yayın kapısından önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ı: #23 (yayın kapısı bulguları, künye, ADR-0024 taslağı, PDF yapısı); PDF alanları ikinci turda. Madde bazında doğrulama kalite-guvenlik kapısındadır.
