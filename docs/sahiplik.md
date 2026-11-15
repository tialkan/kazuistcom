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
- `plan.md`, kökteki `review.md` (yayın öncesi denetim ve iş devri)

Bir ajanın yeni bağımlılığı varsa paketin kendi `package.json` dosyasına ekler; kök ve kilit dosyasını orkestra birleştirir.

## Ajanlar

| Ajan | Sahip olduğu yollar |
|---|---|
| mimar | `packages/contracts/**`, `packages/db/**`, `packages/log/**`, `docs/adr/**`, `docs/sahiplik.md`, `docs/istekler/README.md`, `CLAUDE.md`, `.claude/agents/**`, `scripts/check-text.mjs`, `.env.example` |
| altyapi | `infra/**`, `.github/workflows/**`, `**/Dockerfile`, `**/.dockerignore`, `docs/runbook/**` |
| kimlik | `apps/web/src/server/auth/**`, `apps/web/src/app/(hesap)/**`, `apps/web/src/app/api/auth/**`, `packages/i18n/tr/hesap.json`, `apps/web/src/app/api/v1/{me,kvkk-requests,professions,notifications,push,takedown-requests,admin}/**`, `apps/worker-node/src/notify/**`, `apps/worker-node/src/account/**` |
| yz-gecidi | `packages/ai-gateway/**`, `packages/i18n/tr/byok.json` |
| casuist | `packages/casuist/**`, `apps/web/src/app/ara/**`, `apps/web/src/app/kaydettiklerim/**`, `apps/web/src/app/api/v1/{search,answers,norms,library}/**`, `apps/web/src/app/api/v1/records/[id]/route.ts`, `services/worker-py/nlp/**`, `eval/rag/**`, `eval/embed/**`, `packages/i18n/tr/ara.json`, `packages/i18n/tr/ozet.json`, `packages/i18n/tr/kaydettiklerim.json` |
| veri-toplama | `services/worker-py/connectors/**`, `services/worker-py/core/**` (jobs.py hariç), `services/worker-py/tests/{conftest,helpers,test_connectors,test_core,test_fetcher,test_discovery,test_judicial,test_scheduler}.py`, `services/worker-py/tests/fixtures/**`, `docs/kaynaklar/**` |
| anonimlestirme | `services/worker-py/anonymizer/**`, `eval/anon/**` |
| atif-agi | `services/worker-py/citations/**`, `apps/web/src/app/atif-agi/**`, `apps/web/src/app/api/v1/citation-network/**`, `apps/web/src/app/api/v1/records/[id]/network/**`, `eval/citations/**`, `packages/i18n/tr/atif-agi.json` |
| yazma | `apps/web/src/app/yazma/**`, `apps/web/src/app/kalemcik/**`, `apps/web/src/app/tespit/**`, `apps/web/src/app/api/v1/{templates,journals,writing-projects,abbreviations,jobs}/**`, `apps/worker-node/src/kalemcik/**`, `services/worker-py/docxcheck/**`, `eval/rules/**`, `docs/tespit/**`, `packages/i18n/tr/yazma.json`, `packages/i18n/tr/kalemcik.json`, `packages/i18n/tr/tespit.json` |
| pratik | `apps/web/src/app/pratik/**`, `apps/web/src/app/api/v1/decks/**`, `content/desteler/**`, `packages/i18n/tr/pratik.json` |
| kampus | Pasif (ADR-0031): ajan çağrılmaz, yol verilmez. Eski yollar (`apps/web/src/app/kampus/**`, `apps/web/src/server/kampus/**`, `packages/i18n/tr/kampus.json`) oluşturulmaz. |
| odeme | `packages/ledger/**`, `apps/web/src/server/billing/**`, `apps/web/src/app/(odeme)/**`, `apps/web/src/app/api/v1/{wallet,prices,checkout,subscriptions,refund-requests,invoices,webhooks,coupons}/**`, `apps/worker-node/src/billing/**`, `packages/i18n/tr/odeme.json` |
| on-yuz | `packages/ui/**`, `packages/i18n/src/**`, `packages/i18n/test/**`, `packages/i18n/tr/ortak.json`, `apps/web/src/app/(kabuk)/**`, `apps/web/src/app/(casuist)/**`, `apps/web/src/app/page.tsx`, `apps/web/public/fonts/**`, `apps/web/public/casuist/**` |
| icerik | `content/**` (`content/desteler/**` ve `content/hukuki/**` hariç), `apps/web/src/app/rehberler/**`, `packages/i18n/tr/rehberler.json` |
| seo | `apps/web/src/app/(seo)/**`, `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`, `apps/web/public/llms.txt` |
| hukuk-uyum | `content/hukuki/**`, `docs/kvkk/**`, `docs/protokol/**`, `docs/ip/**` |
| ios | `apps/ios/**`, `docs/appstore/**` |
| kalite-guvenlik | `tests/e2e/**`, `tests/security/**`, `tests/load/**`, `docs/kalite/**` |
| bagimsiz-denetci | yok (salt okunur); bulgular `docs/denetim/**` altına orkestra tarafından yazılır |

## Notlar

1. `services/worker-py/core/jobs.py` iş kuyruğu sözleşmesinin Python tarafıdır ve mimarındır; `core/` altındaki diğer dosyalar veri-toplama ajanınındır.
2. `apps/web/src/app/api/health/**`, `apps/web/src/app/api/version/**` ve `apps/web/src/server/env.ts` Dalga 0'da mimar tarafından yazıldı; Dalga 1'den itibaren altyapi ajanınındır. Sağlık bağlantısı dosyaları `apps/web/src/server/health.ts`, `apps/web/src/server/deps.ts` ve `apps/web/src/instrumentation.ts` Dalga 1 istekleriyle mimar tarafından yazıldı (ADR-0023) ve altyapi ajanınındır; `deps.ts` içindeki paylaşılan pg.Pool ve Valkey istemcisini diğer modüller kullanabilir, değişikliği altyapi yapar.
3. `/api/v1/**` Route Handler dosyaları ilgili modül ajanının satırında açıkça yazılıdır (ör. pratik için `api/v1/decks/**`, yazma için `api/v1/templates/**`); uç şekli sözleşmeden gelir. Tabloda olmayan yeni bir `api/v1` yolunu orkestra atar. `api/v1/takedown-requests/**` ve `api/v1/admin/**` kimlik ajanınındır (2026-10-21 kaydı).
4. `docs/ip/arka-plan-kaydi.md` Dalga 0'da mimar tarafından başlatıldı; sonraki güncellemeler hukuk-uyum ajanınındır, ADR listesi mimar tarafından eklenir.
5. seo için robots kuralları yalnız `apps/web/src/app/robots.ts` ile üretilir; `public/robots.txt` kullanılmaz (iki kaynak çelişir). Plan 17.1'deki `public/robots.txt` bu yüzden listeden çıkarıldı.
6. Plan 17.1'den bilinçli sapmalar: (a) i18n dosyaları modül ajanlarına dağıtıldı (`packages/i18n/tr/<modul>.json`; ADR-0032 ile yalnız Türkçe), çünkü plan 17.3/9 dosya sahibini modül ajanı yapıyor; on-yuz `packages/i18n` kodunu ve `ortak.json`'u tutar. (b) `services/worker-py/core/jobs.py` veri-toplama yerine mimarda, çünkü iş kuyruğu sözleşmesinin (Ek C.3) Python tarafıdır ve sözleşme yalnız mimar ile değişir.
7. İş kuyruğu giriş noktaları (ADR-0023): `apps/worker-node/src/{main,runner,handlers,queue}.ts` ve `apps/worker-node/scripts/**` listede olmadığı için orkestranındır; modül ajanları kendi işleyici fabrikalarını kendi yollarında yazar, kaydı orkestra yapar. `services/worker-py/core/main.py` `core/` altında olduğu için veri-toplama ajanınındır; yeni iş türü kaydı için sahibine istek yazılır. `services/worker-py/tests/test_jobs.py` ve `test_main.py` iş kuyruğu sözleşmesini sınar; değişikliği mimar yapar.

- 2026-10-21, orkestra: `api/v1/takedown-requests/**` ve `api/v1/admin/**` kimlik ajanına verildi (yetki ve denetim kaydı orada); modül kuyruk işleyicileri modül ajanlarında kalır.
- 2026-11-12, mimar (codex/p1-mimar-kararlar, review.md P1 madde 2): kampus satırı pasif (ADR-0031); `{tr,en}` desenleri `tr` (ADR-0032); sahibi yazılı olmayan yollar git geçmişindeki ilk ekleyene verildi: `hesap.json` kimlik (7552557), `kaydettiklerim/**`, `kaydettiklerim.json` ve `api/v1/{search,answers,norms,library}` ile `records/[id]` casuist (#62), `tespit/**`, `docs/tespit/**`, `tespit.json` yazma (#57, ADR-0031 madde 5) ve yazma API yolları (#63), `citation-network` ve `records/[id]/network` atif-agi (#67), `decks` pratik (#61); kök `review.md` orkestranın.
- 2026-11-15, mimar (ADR-0038, istek `yz-gecidi-byok.md` madde 2 ve PR #105): yeni yollar. `packages/i18n/tr/byok.json`
  yz-gecidi'ye verildi (BYOK arayüz metinleri; `/ara`, `/fiyatlar`, `/odeme` ve `/hesap/yz-anahtari` okur).
  `services/worker-py/tests` altındaki bağlayıcı, çekirdek, keşif ve zamanlayıcı testleri, `conftest.py`, `helpers.py` ve
  `fixtures/**` veri-toplama'ya verildi (ilk ekleyen #7 ve #105); `test_jobs.py` ve `test_main.py` not 7 gereği mimarda,
  `test_v11.py` ve `test_api_docxcheck_mount.py` listede olmadığı için orkestrada kalır. Var olan satırların kapsadığı
  yeni yollar teyit edildi: `apps/web/src/app/(hesap)/hesap/yz-anahtari/**` ve `(hesap)/_bilesen/ByokAyarlari.tsx`
  kimlik (`(hesap)/**`; sayfa oturum istemez, anahtar yalnız tarayıcıda), `packages/ai-gateway/src/byok/**` yz-gecidi,
  `apps/web/src/app/ara/_bilesen/byok.ts` casuist, `apps/web/src/server/billing/acik.ts` odeme,
  `tests/e2e/specs/byok.spec.ts` kalite-guvenlik, `services/worker-py/connectors/{aym,yargitay,danistay,judicial}.py`
  ve `services/worker-py/core/{scheduler,discovery,challenge,cli}.py` veri-toplama, `apps/web/src/app/(kabuk)/_kabuk/yayin.ts`
  on-yuz, `apps/web/src/app/{pratik,kalemcik,atif-agi}/layout.tsx` modül ajanları (pratik, yazma, atif-agi).
  `apps/web/src/server/security-headers.ts` listede olmadığı için orkestranındır (`connect-src` artık
  `https://openrouter.ai` içerir).
- 2026-11-15, mimar (ADR-0039, PR #115 ardılı): yeni yol `packages/log/**` (`@kazuist/log`, sunucu log yazıcısı ve
  hata temizleyicisi) mimara verildi; `packages/contracts` ve `packages/db` gibi ADR ile değişir. Orkestranın
  görevlendirmesiyle bu PR ortak dosyalara da dokundu: `eslint.config.mjs` (sunucu kodunda `console` yasağı),
  `apps/web/package.json`, `apps/worker-node/package.json`, `pnpm-lock.yaml` (paket bağlantısı),
  `apps/worker-node/src/{main,runner,queue}.ts` ve `.github/workflows/ci.yml` (edu_claims gerçek PostgreSQL adımı).
  Modül dosyalarındaki değişiklik yalnız log satırlarıdır.
