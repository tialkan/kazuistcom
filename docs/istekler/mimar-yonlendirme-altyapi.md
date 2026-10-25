# Yönlendirme: altyapi ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: altyapi. Dayanak: ADR-0021, ADR-0023, istekler
`altyapi-health-pingleri.md`, `altyapi-s3-yerel.md`, `altyapi-worker-giris-noktalari.md`,
`hukuk-uyum-urun-tutarliligi.md` (madde 6, 9).

## Hazır olanlar

- `/api/health` gerçek pg (`SELECT 1`) ve Valkey (`PING`, iovalkey 0.4.0) ile bağlı;
  `apps/web/src/instrumentation.ts` kayıt yapar. Yerelde üretim derlemesiyle doğrulandı: PostgreSQL ve Valkey
  açıkken 200, Valkey kapatılınca 503, geri açılınca 200. Bu üç dosya (`health.ts`, `deps.ts`,
  `instrumentation.ts`) artık sizindir.
- worker-node `pnpm --filter @kazuist/worker-node build` ile `dist/main.js` üretir (esbuild; `@kazuist/*`
  paketleri gömülür, npm bağımlılıkları dışarıda); `start: node dist/main.js`.
- worker-py `python -m core.main` mevcut; `127.0.0.1:8000/healthz` canlılık ucu (KAZUIST_HEALTH_HOST,
  KAZUIST_HEALTH_PORT).
- `@kazuist/db/migrate` `runMigrations(url, log)` ve `withMigrationLock`; kilit anahtarı `migrate.mjs` ile aynı
  (7302514001).

## İşler

1. CI docker işi: web konteynerini `DATABASE_URL`, `VALKEY_URL` ve diğer kritik değişkenlerle çalıştırıp
   `/api/health` için 200 bekleyin (bugün 503 kabul ediliyor). İsteğe bağlı: `KAZUIST_IT_DATABASE_URL` ve
   `KAZUIST_IT_VALKEY_URL` ile `apps/web/test/health-deps.test.ts` gerçek servis testini çalıştırın.
2. worker-node Dockerfile: `pnpm build` ve `pnpm deploy --prod` ile küçük imaj, `CMD ["node", "dist/main.js"]`.
3. worker-py Dockerfile: `HEALTHCHECK` ile `http://127.0.0.1:8000/healthz`; CI'da `import core.main` denetimi.
   `docs/kaynaklar` imaja kopyalanmalı (veri-toplama yönlendirmesi madde 4).
4. `infra/scripts/migrate.mjs` isterse `@kazuist/db/migrate` kullanabilir (Node 26 tip ayıklamasıyla TS dosyası
   doğrudan içe aktarılabilir); kilit anahtarı değişmemeli.
5. Kova oluşturma betiği (S3 isteği madde 3) ve plan 5.3'teki MinIO ifadesinin güncellenmesi için orkestraya not.
6. Umami (hukuk-uyum madde 9): saklama süresi ve çerez kullanımı yapılandırmadan teyit edilip
   `docs/kvkk/envanter.md` için hukuk-uyum'a bildirilsin.
7. Saklama süreleri (hukuk-uyum madde 6): imha politikası süreleri onaylanınca mimar `retention.sweep` iş
   türünü ekler; zamanlama ve izleme sizde.
8. Label Studio kurulumu (ADR-0022, Tarık onayından sonra).

## Aciliyet

1 ve 3: erken geçişten önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ları: #12 (gerçek sağlık denetimi ve CI'da işçi denemesi), #22 (güvenlik başlıkları); ner-runtime imajı ikinci turda. Madde bazında doğrulama kalite-guvenlik kapısındadır.
