# İstek: üç kimlik ucundan `x-kazuist-uygulama: planlandi` ekinin kaldırılması

- İsteyen: kimlik. Dal: `kimlik/v1-5-atif-bildirim-iade`. Tarih: 14 Kasım 2026.
- Kime: mimar (ek kaldırma; ADR-0035 "ek kaldırma sözleşme değişikliği değildir, aynı PR'da mimar onayıyla
  yapılabilir"). Kimlik `packages/contracts`'a dokunmadı.

## Gerekçe

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` kimlik madde 3 gereği üç uç bu dalda yazıldı:

| Yol | Rota dosyası | Yöntemler |
|---|---|---|
| `/v1/notifications/preferences` | `apps/web/src/app/api/v1/notifications/preferences/route.ts` | GET, PUT |
| `/v1/push/web-subscriptions` | `apps/web/src/app/api/v1/push/web-subscriptions/route.ts` | POST |
| `/v1/push/apns-tokens` | `apps/web/src/app/api/v1/push/apns-tokens/route.ts` | POST |

`packages/contracts/test/rotalar.test.ts` "a marked path has no handler" bu üç yolu buluyor ve ek kaldırılana
kadar kırmızıdır (bu dalda beklenen tek kırmızı test).

## Önerilen değişiklik

`packages/contracts/openapi.yaml` içinde (dal tabanı `8e43a4a` satır numaralarıyla) şu üç satır silinir:

- 1787: `/v1/notifications/preferences:` altındaki `x-kazuist-uygulama: planlandi`
- 1816: `/v1/push/web-subscriptions:` altındaki `x-kazuist-uygulama: planlandi`
- 1842: `/v1/push/apns-tokens:` altındaki `x-kazuist-uygulama: planlandi`

ADR-0035 "OpenAPI uygulama durumu" bölümündeki `planlandi` listesinden ve "planlandi uçların girdileri"
(`NotificationPreferencesInput`, `WebPushSubscriptionInput`, `ApnsTokenInput`) cümlesinden bu üçü düşer; üç
işleyici sözleşme şemalarını doğrudan içe aktarır (yerel şema yok).

## Sözleşmeye ek olarak bildirilmesi önerilen davranış (şema değişmeden, açıklama satırı)

- `PUT /v1/notifications/preferences`: gövdedeki kanal haritası o kanalı bütünüyle değiştirir, gövdede olmayan
  kanal saklı kalır. Zorunlu e-posta türleri (`odeme`, `fesih_teyidi`) e-posta haritasından düşürülür; GET onları
  hiç göstermez.
- `POST /v1/push/web-subscriptions`: yalnız tarayıcı push servislerinin https uç noktaları
  (`fcm.googleapis.com`, `android.googleapis.com`, `updates.push.services.mozilla.com`,
  `push.services.mozilla.com`, `web.push.apple.com`, `*.notify.windows.com`, `*.push.apple.com`) ve RFC 8291
  anahtarları (`p256dh` 65 bayt, `auth` 16 bayt, base64url) kabul edilir; diğerleri 400. İşçi saklanan uç noktaya
  POST attığı için serbest URL iç ağa istek açardı (SSRF).
- İki push ucu: aynı uç nokta ya da jeton başka bir hesapta kayıtlıysa çağıran hesaba taşınır; kanal başına en
  çok 10 cihaz tutulur, en eskisi silinir. Yanıt 201 `{id}`; kullanıcı başına saatte 20 kayıt (429).

## Geriye uyumluluk

Kırıcı değil: yalnız belgeleme eki kalkar. İstemci üretimi (`apps/ios` yok) etkilenmez.

## Aciliyet

Bu dal birleşmeden önce: ek kalkmadan CI'daki `pnpm test` (contracts) kırmızı kalır.
