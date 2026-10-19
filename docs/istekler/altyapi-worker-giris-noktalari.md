# İstek: worker-py giriş modülü, worker-node derlemesi ve uv.lock

Kimden: altyapi (Dalga 1). Kime: mimar ve orkestra.

1. worker-py giriş modülü yok. `infra/docker/worker-py/Dockerfile` `python -m core.main` çalıştırır. `core/` altında `jobs.py` dışı dosyalar veri-toplama ajanınındır; `core/main.py` (jobs tüketicisi, SIGTERM ile düzgün kapanış, 8000'de iç sağlık ucu) için sahip ve yazım istenir. O zamana kadar CI yalnız imajın derlendiğini ve `import core.jobs, psycopg` yapılabildiğini doğrular.
2. `services/worker-py/uv.lock` depoda yok. Dockerfile kilit varsa `uv sync --frozen`, yoksa çözümleme yapar; tekrarlanabilir imaj için orkestranın `uv lock` çıktısını commit etmesi istenir.
3. worker-node çalışma anında tsx ile TypeScript çalıştırıyor (devDependency). İmaj bu yüzden tüm bağımlılıkları taşır. Öneri: `apps/worker-node/package.json`'a `build` betiği (ör. tsc veya esbuild ile `dist/`) ve `start: node dist/main.js`; sonra Dockerfile `pnpm deploy --prod` ile küçülür (orkestra dosyası).
4. Migration betiği `infra/scripts/migrate.mjs`, `drizzle-orm` ve `pg` modüllerini `packages/db` üzerinden çözer. `@kazuist/db` paketinin `./migrate` dışa aktarımıyla bir `runMigrations(url)` sunması daha temiz olur (mimar).
