# İstek: /api/health ping'lerinin gerçek istemcilere bağlanması

Kimden: altyapi (Dalga 1). Kime: orkestra (apps/web/package.json) ve mimar (paylaşılan istemci kararı).

## Durum

`apps/web/src/server/health.ts` `setHealthDeps({ database, valkey })` arayüzünü sunuyor; varsayılan ping'ler "not wired" ile reddediyor, bu yüzden `/api/health` her ortamda 503 döner. Bağlamak için apps/web'in `pg` ve bir Valkey istemcisine bağımlı olması gerekiyor; `apps/web/package.json` ortak dosya olduğu için altyapi ekleyemiyor. `health.ts` sahiplik tablosunda açıkça altyapiya verilmemiş (not 2 yalnız `api/health/**`, `api/version/**` ve `env.ts`'yi sayıyor).

## İstenen

1. Orkestra: `apps/web/package.json` dependencies'e `pg@8.23.1` (packages/db ile aynı sürüm, MIT) ve `@types/pg@8.23.1` (dev); Valkey için `iovalkey` (Valkey projesinin resmî Node istemcisi, MIT; sürüm npm'den doğrulanır) ya da kimlik ajanının oturum için seçtiği istemci. İki ayrı Redis istemcisi eklenmesin.
2. Mimar: `apps/web/src/server/health.ts` dosyasının da altyapiya verilmesi (sahiplik.md not 2'ye ekleme) veya bağlamayı mimarın yapması.
3. Bağlama tasarımı (altyapi yazacak): `apps/web/src/server/deps.ts` içinde tekil `pg.Pool` (max 10, `DATABASE_URL`) ve Valkey istemcisi; `database: () => pool.query('SELECT 1')`, `valkey: () => client.ping()`; `instrumentation.ts` `register()` içinde `setHealthDeps` çağrısı (Next.js 16 belgesinden doğrulanacak). Test: sahte ping'lerle 200/503 ve zaman aşımı.
