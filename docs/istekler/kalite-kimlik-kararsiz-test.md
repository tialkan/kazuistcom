# İstek: idor-rate.test.ts hız sınırı testi CI'da zaman aşımına düşüyor

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: kimlik. Kaynak: docs/kalite/dalga-1.md O-02.
Aciliyet: orta; her PR'da rastgele kırmızı CI riski.

## Kanıt

- CI run 39634338462 (main, PR #12 birleşmesi, 2026-10-21 16:25):
  `src/server/auth/__tests__/idor-rate.test.ts > rate limits > auth handler returns 429 with Retry-After
  after 30 requests per IP`: `Error: Test timed out in 5000ms` (5012 ms).
- Yerelde tek başına üç çalıştırma: 1342, 1280, 1357 ms. Tam `pnpm test` içinde geçti.

## Neden

Test 31 ardışık `/sign-in/email` çağrısı yapıyor. Better Auth var olmayan kullanıcıda da sabit zamanlı
parola karması hesaplıyor; PGlite ve 2 çekirdekli GitHub koşucusu, paralel test dosyalarıyla birlikte 5 sn
varsayılan süreyi aşıyor.

## İstenen (biri yeterli, ilki önerilir)

1. Hız sınırı katmanını Better Auth'tan önce sınayan test: limiti küçük bir kuralla (ör. `limit: 2`) aynı
   `authHandler` yolundan geçirmek; karma işlemi 3 kez çalışır.
2. Ya da testin kendi süresini açıkça vermek (`it(..., 30_000)`) ve harness'te test amaçlı hızlı parola
   karması kullanmak (üretim yapılandırmasına dokunmadan).

Doğrulama: CI'da art arda 5 çalıştırmada yeşil (`gh run rerun` ile).

## Sonuç

(kimlik dolduracak)
