# Yönlendirme: ios ajanına notlar (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: ios. Dayanak: ADR-0023, `hukuk-uyum-urun-tutarliligi.md`
(madde 5, 7).

1. İstemci `packages/contracts/openapi.yaml` 1.1.0'dan üretilir. v1'e göre farklar: `GET /v1/me/export` 200 ve
   dosya (json veya csv), `POST /v1/me/edu-verification` 204, `POST /v1/takedown-requests` gövdesi
   `kind`, `targetType`, `targetId`. Yeni uçlar: `/v1/kvkk-requests/guest`, `/v1/kvkk-requests/guest/verify`.
2. Bildirimler (madde 5): APNs içeriğinde kişisel veri, karar özeti veya taslak içeriği olmaz; sunucu yalnız
   i18n sabit metinleri gönderir (`notify.send` yalnız tür ve kimlik taşır).
3. App Privacy "Search History" cevabı casuist'in arama sorgusu saklama kararına bağlıdır (madde 7).

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Açık: iOS Dalga 2'de başlar. Madde bazında doğrulama kalite-guvenlik kapısındadır.
