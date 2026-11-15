# İstek: `.env.example` açıklamalarının tek sunucu düzenine göre güncellenmesi

Kimden: altyapi (dal `altyapi/tek-sunucu-uretim`, PR #104). Kime: mimar (`.env.example` sahibi). Dayanak: ADR-0033,
review.md P2 madde 4.

## Bulgu ve uygulanan

- `apps/web/src/server/env.ts` artık `S3_ENDPOINT` ve `S3_BUCKET` istemiyor: `apps/web`, `apps/worker-node` ve
  `packages` içinde bu adları okuyan kod yok; worker-py ham arşivi `KAZUIST_RAW_DIR` altına yazıyor
  (`services/worker-py/core/runtime.py`, `LocalObjectStore`). `/api/health` S3 değişkenleri olmadan 200 döner (test:
  `apps/web/test/routes.test.ts`; CI app.env'inden S3 satırları çıkarıldı).
- worker-py imajında `KAZUIST_RAW_DIR` öntanımı `/data/raw-store` oldu; üretimde sunucudaki `/srv/kazuist/raw-store`
  klasörü bağlanır ve sunucu dışına yedeklenir (`infra/docker-compose.prod.yml`, `infra/backup/`).
- Üretim değişkenleri `infra/docker-compose.prod.yml` ile Coolify'a verilir; `DATABASE_URL`, `VALKEY_URL`,
  `BETTER_AUTH_URL`, `TRUSTED_PROXY_COUNT`, `WORKER_PY_URL` dosyada `POSTGRES_PASSWORD`, `VALKEY_PASSWORD` ve
  `APP_URL`'den türetilir. Yeni adlar yalnız dağıtım içindir: `KAZUIST_IMAGE_TAG`, `KAZUIST_IMAGE_PREFIX`,
  `KAZUIST_PULL_POLICY`, `VALKEY_PASSWORD`. Yedek değişkenleri `infra/backup/backup.env.example` dosyasındadır.

## İstenen

1. `.env.example` "Object storage" bölümü: "critical for /api/health" ve "only checked for presence by /api/health
   today" ifadeleri kalksın; dört S3 değişkeni `[gelecek faz]` olarak işaretlensin.
2. `KAZUIST_RAW_DIR` açıklaması: "default ./.raw-store; the worker-py image sets /data/raw-store, a persistent volume in
   production (infra/docker-compose.prod.yml)".
3. `POSTGRES_PASSWORD` açıklaması: yalnız yerel değil, üretim compose dosyasının da kullandığı ve onaltılık olması
   gerektiği (URL'ye kaçışsız girer).
4. İsteğe bağlı: `VALKEY_PASSWORD` satırı (yalnız üretim compose dosyası okur) ve dağıtım değişkenlerinin
   `docs/runbook/ilk-kurulum.md` "Ortam değişkenleri" tablosuna atıf.
