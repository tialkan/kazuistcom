# docs/kalite

Dalga kapı raporları (`dalga-<n>.md`, plan 15.2) ve kalite-guvenlik testlerinin çalıştırma notları.
Sahibi kalite-guvenlik ajanı. Testler `tests/e2e`, `tests/security`, `tests/load` altındadır.

## Yerel üretim derlemesine karşı çalıştırma (Docker yok)

1. Veri tabanı: PostgreSQL 18 ve pgvector (Homebrew: `brew install postgresql@18 pgvector`). Geçici bir küme
   açın (`initdb`, `pg_ctl start`, port örneği 55433), `kazuist` veri tabanını oluşturun ve migration'ları
   uygulayın: `DATABASE_URL=postgres://kazuist@127.0.0.1:55433/kazuist node infra/scripts/migrate.mjs`.
2. Valkey veya Redis: `redis://127.0.0.1:6379/<boş db>`.
3. Derleme: `pnpm build`. Standalone sunucu için `apps/web/.next/static` ve `apps/web/public` dizinlerini
   `apps/web/.next/standalone/apps/web/` altına kopyalayın ve `node apps/web/server.js`'i
   `apps/web/.next/standalone` içinden başlatın. Ortam: `NODE_ENV=production PORT=3300`, `DATABASE_URL`,
   `VALKEY_URL`, `BETTER_AUTH_URL=http://localhost:3300`, `BETTER_AUTH_SECRET` ve `BYOK_SIGNING_SECRET` için
   her seferinde `openssl rand -hex 32`, `S3_ENDPOINT`, `S3_BUCKET`, `TRUSTED_PROXY_COUNT=0`. Ödeme uçlarının
   503 yerine çalışması için ağ çağrısı yapılmayan testlerde sahte `IYZICO_API_KEY` ve `IYZICO_SECRET_KEY`
   verilebilir; gerçek anahtar kullanılmaz.
4. Testler (her paket workspace dışıdır, kök kilit dosyasını değiştirmez):

```sh
pnpm --dir tests/e2e install --ignore-workspace
pnpm --dir tests/e2e exec playwright install chromium
cd tests/e2e && pnpm exec playwright test            # KAZUIST_E2E_BASE_URL, KAZUIST_E2E_BASIC_AUTH

pnpm --dir tests/security install --ignore-workspace
cd tests/security && KAZUIST_SEC_DATABASE_URL=postgres://kazuist@127.0.0.1:55433/kazuist pnpm exec playwright test

pnpm exec vitest run --config tests/security/enjeksiyon/vitest.config.ts   # depo kökünden, sunucu gerekmez
sh tests/security/tarama/tarama.sh <çıktı dizini>                           # gitleaks, audit, lisans
```

Staging için: `KAZUIST_E2E_BASE_URL=https://staging.kazuist.com`, `KAZUIST_SEC_EXPECT_HTTPS=1` ve Basic Auth
değeri yalnız ortam değişkeni olarak (`KAZUIST_E2E_BASIC_AUTH`, `KAZUIST_SEC_BASIC_AUTH`). Değer dosyaya,
loga ve rapora yazılmaz. `KAZUIST_SEC_DATABASE_URL` staging veya üretim veri tabanına verilmez.

## Kurallar

- Veri alınamayan ölçüm "geçmedi: veri yok" yazılır.
- Testler gerçek kişi verisi üretmez: adresler `example.invalid`, IP'ler belgeleme aralığı (RFC 5737).
- Bir test kırmızıysa bulgu rapora yazılır; test, bulgu kapanana kadar gevşetilmez.
