# Devir kaydı

En üstteki bölüm günceldir. Her ajan işini bitirince kendi bölümünü en üste ekler.

## Dalga 0, mimar, 2026-10-19

### Durum

Sözleşmeler v1 main dalında commit'li; push ve etiket yok. Kapı: bağımsız denetçi incelemesi ve Tarık'ın ADR toplu onayı.

### Yapılanlar

- pnpm workspaces monorepo (plan 5.2): apps/web (Next.js 16.4.2, /api/health ve /api/version), apps/worker-node (jobs tüketicisi), services/worker-py (uv pyproject, connectors, anonymizer, nlp, citations, docxcheck, core; core/jobs.py), packages/contracts, db, casuist, ai-gateway, ledger, ui, i18n; content/, infra/, eval/, docs/.
- TypeScript 6.0.3 sıkı mod (noUncheckedIndexedAccess dahil), ESLint 10 ve typescript-eslint 8.72 strict, Prettier 3.9.
- packages/contracts: openapi.yaml (OpenAPI 3.1, Ek C.1 uçlarının tamamı, 74 yol, 93 işlem), Redocly recommended-strict lint, zod şemaları (hata gövdesi, SSE olayları, BYOK prepare ve verify, model JSON Lines satırı, iş türleri), openapi-typescript çıktısı (src/generated/api.ts), Swift için openapi-generator-config.yaml.
- packages/db: Ek C.2 tablolarının tamamı (69 tablo, 8'i kampus şemasında), plan 6.3 alanları records'ta, chunks.embedding halfvec(1024) HNSW, tsvector 'turkish' üretilmiş sütun, değiştirilemez ve dengeli defter tetikleyicileri, webhook_events ve idempotency_keys tekil anahtarları, jobs kuyruğu (enum'lar, SKIP LOCKED sorguları, NOTIFY jobs_<tür> tetikleyicisi). Migration'lar: 0000 uzantılar, 0001 şema (drizzle-kit), 0002 defter ve kuyruk tetikleyicileri. Örnek veri: src/seed.ts ve scripts/seed.ts (yalnız sahte veri).
- packages/ui tokens.css belirteç adları; packages/i18n tr ve en (ortak, ozet) ve eşitlik testi.
- infra/docker-compose.dev.yml, .env.example, .github/workflows/ci.yml, scripts/check-text.mjs (pnpm check:text).
- docs/adr/0001..0020 ve README, docs/sahiplik.md, docs/ilerleme.md, docs/ip/arka-plan-kaydi.md, docs/istekler/README.md.

### Doğrulama

pnpm install, pnpm typecheck, pnpm test (34 test; PGlite migration testi dahil), pnpm --filter @kazuist/contracts lint, pnpm check:text, pnpm lint, pnpm build ve services/worker-py içinde python3 -m pytest (5 test, yerel Python 3.9 ile) geçti.

Migration, PGlite 0.5.10 (PostgreSQL 18.6 wasm) ve @electric-sql/pglite-pgvector ile uygulandı. PGlite 'turkish' yapılandırmasını içeriyor; test bunu ve Türkçe kök bulmayla eşleşmeyi doğruluyor.

Doğrulanamayanlar: docker compose up (makinede docker yok; YAML ayrıştırıcıyla doğrulandı); uv sync ve uv run pytest (makinede uv yok); gerçek PostgreSQL 18 ve pgvector 0.8.7 üzerinde migration.

### Bilinmesi gerekenler

- TypeScript 7.0.2 npm'de güncel, ancak typescript-eslint 8.72 en fazla 6.0'ı destekliyor; 6.0.3 seçildi. openapi-typescript 7.13 TypeScript 5 eş bağımlılığı uyarısı veriyor; üretim çalışıyor.
- MinIO Docker Hub deposu artık yok; compose'taki quay.io/minio/minio etiketi doğrulanamadı. altyapi ajanı etiketi doğrulamalı veya S3 uyumlu başka bir yerel depo için ADR yazmalı.
- pnpm 11 derleme betiklerine izin listesi pnpm-workspace.yaml içindeki allowBuilds alanındadır.
- Kanal adlarında nokta alt çizgiye çevrilir: anon.run için jobs_anon_run.

### Sonraki adım

bagimsiz-denetci Dalga 0'ı denetler; Tarık ADR'leri onaylar; orkestra main'e contracts-v1 etiketini koyar; Dalga 1 ajanları başlar.
