# ADR-0008: BYOK: anahtar istemcide, sunucu görmez

- Tarih: 2026-10-19
- Karar kodu: K-08 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Kullanıcılar kendi anahtarlarıyla ücretsiz YZ kullanmak istiyor. Anahtarın sunucuya gelmesi güvenlik ve KVKK yükü doğurur.

## Karar

Protokol: POST /v1/answers/prepare imzalı istem paketi döner (nonce, 10 dakika, HMAC imza); istemci sağlayıcıyı kendi anahtarıyla çağırır; satırlar tarayıcıda casuist doğrulayıcısıyla denetlenir; kaydedilen özet POST /v1/answers/verify ile sunucuda yeniden doğrulanır. Tarayıcı çağrısına izin vermeyen sağlayıcı BYOK aktarma moduyla çalışır; anahtar yalnız istek belleğindedir.

## Gerekçe

En güçlü güvenlik ve KVKK konumu; sunucuda anahtar saklama yoktur.

## Sonuçlar

- PrepareRequest, PrepareResponse, VerifyRequest, VerifyResponse şemaları packages/contracts'tadır; BYOK_NONCE_TTL_SECONDS 600'dür.
- CSP'de üçüncü taraf betik yasaktır; anahtar XSS'e karşı böyle korunur.
- Gemini ücretsiz katman uyarısı ve OpenRouter data_collection deny varsayılanı uygulanır (plan 8.4).

## Not: nonce deposu (2026-10-19, denetim bulgusu D6)

Nonce tek kullanımlıktır. prepare, nonce'u Valkey'de `byok:nonce:<nonce>` anahtarıyla `SET ... NX EX 600` komutuyla yazar; verify anahtarı `GETDEL` ile atomik olarak tüketir. Anahtar yoksa süre dolmuş veya nonce yeniden kullanılmıştır ve uç 410 döner. Bu karar packages/contracts'ta (PrepareResponse.nonce açıklaması, byokNonceKey) sabittir.

## Durum

Önerildi, Tarık onayı bekliyor.
