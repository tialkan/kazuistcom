# İstek: /api/health ping'lerinin gerçek istemcilere bağlanması

Kimden: altyapi (Dalga 1). Kime: orkestra (apps/web/package.json) ve mimar (paylaşılan istemci kararı).

## Durum

`apps/web/src/server/health.ts` `setHealthDeps({ database, valkey })` arayüzünü sunuyor; varsayılan ping'ler "not wired" ile reddediyor, bu yüzden `/api/health` her ortamda 503 döner. Bağlamak için apps/web'in `pg` ve bir Valkey istemcisine bağımlı olması gerekiyor; `apps/web/package.json` ortak dosya olduğu için altyapi ekleyemiyor. `health.ts` sahiplik tablosunda açıkça altyapiya verilmemiş (not 2 yalnız `api/health/**`, `api/version/**` ve `env.ts`'yi sayıyor).

## İstenen

1. Orkestra: `apps/web/package.json` dependencies'e `pg@8.23.1` (packages/db ile aynı sürüm, MIT) ve `@types/pg@8.23.1` (dev); Valkey için `iovalkey` (Valkey projesinin resmî Node istemcisi, MIT; sürüm npm'den doğrulanır) ya da kimlik ajanının oturum için seçtiği istemci. İki ayrı Redis istemcisi eklenmesin.
2. Mimar: `apps/web/src/server/health.ts` dosyasının da altyapiya verilmesi (sahiplik.md not 2'ye ekleme) veya bağlamayı mimarın yapması.
3. Bağlama tasarımı (altyapi yazacak): `apps/web/src/server/deps.ts` içinde tekil `pg.Pool` (max 10, `DATABASE_URL`) ve Valkey istemcisi; `database: () => pool.query('SELECT 1')`, `valkey: () => client.ping()`; `instrumentation.ts` `register()` içinde `setHealthDeps` çağrısı (Next.js 16 belgesinden doğrulanacak). Test: sahte ping'lerle 200/503 ve zaman aşımı.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Kabul. apps/web bağımlılıkları: `pg@8.23.1` (vardı), `iovalkey@0.4.0` (MIT, npm ve GitHub'dan doğrulandı;
tek Valkey istemcisi). `apps/web/src/server/deps.ts` paylaşılan `pg.Pool` (en çok 10) ve Valkey istemcisini
tembel kurar; `apps/web/src/instrumentation.ts` `register()` yalnız Node.js çalışma ortamında
`setHealthDeps(createHealthDeps(process.env))` çağırır (Next 16 belgesi:
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`). Yoklama
değeri, instrumentation ile route ayrı modül grafiklerinde olsa da görülsün diye `globalThis` üzerindedir.
Testler: `apps/web/test/health-deps.test.ts` (sahte istemcilerle 200/503, zaman aşımı, eksik URL,
instrumentation kaydı; `KAZUIST_IT_*` verilirse gerçek servis). Yerelde üretim derlemesiyle gerçek
PostgreSQL 16 ve Redis 8 karşısında 200, Valkey kapatılınca 503, geri açılınca 200 görüldü.
`health.ts`, `deps.ts`, `instrumentation.ts` sahiplik notu 2 ile altyapıya verildi. Sonraki iş:
docs/istekler/mimar-yonlendirme-altyapi.md.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
