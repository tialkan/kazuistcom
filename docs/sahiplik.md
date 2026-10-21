# Yol sahipliği

Kaynak: plan.md 17.1. Bu tablo kesindir; bir ajan yalnız kendi satırındaki glob yollarını değiştirir.
Listede olmayan yol orkestranındır. Sözleşme yolları (`packages/contracts/**`, `packages/db/**`) yalnız mimar
tarafından ve ADR ile değişir; diğer ajanlar ihtiyacını `docs/istekler/<ajan>-<konu>.md` olarak yazar.

## Ortak dosyalar (yalnız orkestra, birleştirme sırasında)

- `package.json` (kök), `pnpm-lock.yaml`, `pnpm-workspace.yaml`
- `apps/web/src/app/layout.tsx`, `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`
- `apps/worker-node/package.json`, `apps/worker-node/src/main.ts`
- `services/worker-py/pyproject.toml`, `services/worker-py/uv.lock`
- `tsconfig.base.json`, `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.editorconfig`, `.nvmrc`
- `DEVIR.md` (her ajan yalnız en üste kendi bölümünü ekler), `docs/ilerleme.md` (her ajan yalnız kendi satırını günceller)
- `plan.md`

Bir ajanın yeni bağımlılığı varsa paketin kendi `package.json` dosyasına ekler; kök ve kilit dosyasını orkestra birleştirir.

## Ajanlar

| Ajan | Sahip olduğu yollar |
|---|---|
| mimar | `packages/contracts/**`, `packages/db/**`, `docs/adr/**`, `docs/sahiplik.md`, `docs/istekler/README.md`, `CLAUDE.md`, `.claude/agents/**`, `scripts/check-text.mjs`, `.env.example` |
| altyapi | `infra/**`, `.github/workflows/**`, `**/Dockerfile`, `**/.dockerignore`, `docs/runbook/**` |
| kimlik | `apps/web/src/server/auth/**`, `apps/web/src/app/(hesap)/**`, `apps/web/src/app/api/auth/**`, `apps/web/src/app/api/v1/{me,kvkk-requests,professions,notifications,push}/**`, `apps/worker-node/src/notify/**`, `apps/worker-node/src/account/**` |
| yz-gecidi | `packages/ai-gateway/**` |
| casuist | `packages/casuist/**`, `apps/web/src/app/ara/**`, `services/worker-py/nlp/**`, `eval/rag/**`, `eval/embed/**`, `packages/i18n/{tr,en}/ara.json`, `packages/i18n/{tr,en}/ozet.json` |
| veri-toplama | `services/worker-py/connectors/**`, `services/worker-py/core/**` (jobs.py hariç), `docs/kaynaklar/**` |
| anonimlestirme | `services/worker-py/anonymizer/**`, `eval/anon/**` |
| atif-agi | `services/worker-py/citations/**`, `apps/web/src/app/atif-agi/**`, `eval/citations/**`, `packages/i18n/{tr,en}/atif-agi.json` |
| yazma | `apps/web/src/app/yazma/**`, `apps/web/src/app/kalemcik/**`, `apps/worker-node/src/kalemcik/**`, `services/worker-py/docxcheck/**`, `eval/rules/**`, `packages/i18n/{tr,en}/yazma.json`, `packages/i18n/{tr,en}/kalemcik.json` |
| pratik | `apps/web/src/app/pratik/**`, `content/desteler/**`, `packages/i18n/{tr,en}/pratik.json` |
| kampus | `apps/web/src/app/kampus/**`, `apps/web/src/server/kampus/**`, `packages/i18n/{tr,en}/kampus.json` |
| odeme | `packages/ledger/**`, `apps/web/src/server/billing/**`, `apps/web/src/app/(odeme)/**`, `apps/web/src/app/api/v1/{wallet,prices,checkout,subscriptions,refund-requests,invoices,webhooks}/**`, `apps/worker-node/src/billing/**`, `packages/i18n/{tr,en}/odeme.json` |
| on-yuz | `packages/ui/**`, `packages/i18n/src/**`, `packages/i18n/test/**`, `packages/i18n/{tr,en}/ortak.json`, `apps/web/src/app/(kabuk)/**`, `apps/web/src/app/(casuist)/**`, `apps/web/src/app/page.tsx`, `apps/web/public/fonts/**`, `apps/web/public/casuist/**` |
| icerik | `content/**` (`content/desteler/**` ve `content/hukuki/**` hariç), `apps/web/src/app/rehberler/**`, `packages/i18n/{tr,en}/rehberler.json` |
| seo | `apps/web/src/app/(seo)/**`, `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`, `apps/web/public/llms.txt` |
| hukuk-uyum | `content/hukuki/**`, `docs/kvkk/**`, `docs/protokol/**`, `docs/ip/**` |
| ios | `apps/ios/**`, `docs/appstore/**` |
| kalite-guvenlik | `tests/e2e/**`, `tests/security/**`, `tests/load/**`, `docs/kalite/**` |
| bagimsiz-denetci | yok (salt okunur); bulgular `docs/denetim/**` altına orkestra tarafından yazılır |

## Notlar

1. `services/worker-py/core/jobs.py` iş kuyruğu sözleşmesinin Python tarafıdır ve mimarındır; `core/` altındaki diğer dosyalar veri-toplama ajanınındır.
2. `apps/web/src/app/api/health/**`, `apps/web/src/app/api/version/**` ve `apps/web/src/server/env.ts` Dalga 0'da mimar tarafından yazıldı; Dalga 1'den itibaren altyapi ajanınındır. Sağlık bağlantısı dosyaları `apps/web/src/server/health.ts`, `apps/web/src/server/deps.ts` ve `apps/web/src/instrumentation.ts` Dalga 1 istekleriyle mimar tarafından yazıldı (ADR-0023) ve altyapi ajanınındır; `deps.ts` içindeki paylaşılan pg.Pool ve Valkey istemcisini diğer modüller kullanabilir, değişikliği altyapi yapar.
3. `/api/v1/**` Route Handler dosyaları ilgili modül ajanının `apps/web/src/app/api/v1/<modul>/**` yolundadır (ör. kampus için `api/v1/kampus/**`); uç şekli sözleşmeden gelir. Kimlik ve ödeme yolları tabloda açıkça yazılıdır. `api/v1/takedown-requests/**` ve `api/v1/admin/**` henüz atanmadı; orkestra atar.
4. `docs/ip/arka-plan-kaydi.md` Dalga 0'da mimar tarafından başlatıldı; sonraki güncellemeler hukuk-uyum ajanınındır, ADR listesi mimar tarafından eklenir.
5. seo için robots kuralları yalnız `apps/web/src/app/robots.ts` ile üretilir; `public/robots.txt` kullanılmaz (iki kaynak çelişir). Plan 17.1'deki `public/robots.txt` bu yüzden listeden çıkarıldı.
6. Plan 17.1'den bilinçli sapmalar: (a) i18n dosyaları modül ajanlarına dağıtıldı (`packages/i18n/{tr,en}/<modul>.json`), çünkü plan 17.3/9 dosya sahibini modül ajanı yapıyor; on-yuz `packages/i18n` kodunu ve `ortak.json`'u tutar. (b) `services/worker-py/core/jobs.py` veri-toplama yerine mimarda, çünkü iş kuyruğu sözleşmesinin (Ek C.3) Python tarafıdır ve sözleşme yalnız mimar ile değişir.
7. İş kuyruğu giriş noktaları (ADR-0023): `apps/worker-node/src/{main,runner,handlers,queue}.ts` ve `apps/worker-node/scripts/**` listede olmadığı için orkestranındır; modül ajanları kendi işleyici fabrikalarını kendi yollarında yazar, kaydı orkestra yapar. `services/worker-py/core/main.py` `core/` altında olduğu için veri-toplama ajanınındır; yeni iş türü kaydı için sahibine istek yazılır. `services/worker-py/tests/test_jobs.py` ve `test_main.py` iş kuyruğu sözleşmesini sınar; değişikliği mimar yapar.
