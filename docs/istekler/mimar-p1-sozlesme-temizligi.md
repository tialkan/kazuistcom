# Plan: sözleşme ve şema temizliği (review.md P1 madde 4-9)

Tarih: 12 Kasım 2026. Yazan: mimar (dal `codex/p1-mimar-kararlar`). Durum: plan; bu dalda `packages/contracts` ve
`packages/db` içinde kod değişikliği yoktur. Uygulama aşağıdaki iki adımda, ayrı PR'larla yapılır.

## 0. Çerçeve

- Bugünkü sürüm: sözleşme 1.4.0 (`packages/contracts/openapi.yaml` `info.version`), son migration
  `0006_deletion_refund_review.sql`.
- Adım A, ekleyici: ADR-0035 "Sözleşme v1.5", migration `0007`. Yalnız ekleme ve davranış düzeltmesi; geri uyumlu,
  yıkıcı değil. Kapsam: madde 4, madde 5'in doğrulama kısmı, madde 6'nın ekleme kısmı, madde 8.
- Adım B, kaldırıcı: ADR-0036 "Sözleşme v2.0: ADR-0031/0032 artıkları ve kullanılmayan iş türleri", migration `0008`.
  Tür değeri, uç ve tablo kaldırır; yıkıcıdır ve Tarık'ın açık onayını ister. Kapsam: madde 5'in kaldırma kısmı,
  madde 6'nın kaldırma kısmı, madde 7, madde 9'da "kaldır" denen tablolar. Sözleşme sürümünün 2.0.0 olması kaldırılan
  uçların dürüst işaretidir; ürünün "2.0" sürümüyle ilgisi yoktur. Kaldırılan uçların hiçbir uygulaması ve yayımlanmış
  istemcisi olmadığı için 1.6.0 da savunulabilir; seçim ADR-0036'da gerekçesiyle yazılır.
- ADR ve migration numaraları öneridir; araya başka bir ADR girerse kayar.
- Zamanlama: ADR-0033 (önerildi) staging'i kaldırıyor; üretim veri tabanı ilk dağıtımda migration'larla kurulacak.
  Adım B ilk üretim dağıtımından önce birleşirse üretimde veri varken hiçbir yıkıcı migration çalışmaz. Bu, Tarık'ın
  açık onayı gereğini kaldırmaz (CLAUDE.md, geri dönüşü zor işlemler).
- Her iki adımda: Drizzle snapshot'ı, `packages/db/test` migration testleri, `packages/contracts/test`, Redocly lint,
  TypeScript ve Swift istemcilerinin yeniden üretimi, `services/worker-py/core/jobs.py` ve `tests/test_jobs.py` eşlemesi.

## Madde 4: iş kuyruğu (`packages/db/src/jobs.ts`, `services/worker-py/core/jobs.py`)

Adım A. Migration yalnız dizin ekler; SQL metinleri ve imzalar değişir.

| # | Sorun (koddan doğrulandı) | Değişiklik | Migration | Geri uyumluluk |
|---|---|---|---|---|
| 4.1 | `completeJobSql` ve `failJobSql` yalnız `id` ve `status = 'running'` bakıyor; kilidi düşüp başka işçiye geçen bir işi eski işçi bitirebilir ya da düşürebilir. | İkisine `AND locked_by = $3` (Python'da `%(worker)s`). Etkilenen satır 0 ise işçi "kilit kaybedildi" diye loglar, yeniden denemez. | Yok | İmza değişir: `apps/worker-node/src/queue.ts` (orkestra) ve `core/jobs.py` (mimar) aynı PR'da güncellenir; TypeScript derlemesi eski çağrıyı yakalar. |
| 4.2 | `releaseStaleJobsSql` deneme sınırına bakmıyor; çöken bir iş sonsuza kadar kuyruğa döner. | `attempts >= max_attempts` ise `dead`, değilse `queued`; `error = 'stale lock'` (kişisel veri yok). | Yok | Davranış değişikliği; mevcut satırlar etkilenmez. |
| 4.3 | Kalp atışı yok; 15 dakikayı (worker-py `stale_seconds=900`) aşan iş ikinci işçide yeniden başlar. | Yeni `heartbeatJobSql`: `UPDATE jobs SET locked_at = now(), updated_at = now() WHERE id = $1 AND locked_by = $2 AND status = 'running'`. İşleyici çalışırken her `stale/3` saniyede bir çağrılır (worker-node `queue.ts`, worker-py `core/jobs.py`). | Yok (`locked_at` var) | Ekleme. |
| 4.4 | Biten işleri silen kod yok; `jobs` sınırsız büyür. | Yeni `pruneJobsSql`: `done` 14 günden, `dead` 90 günden eski satırları siler. worker-node bakım turunda günde bir çalışır (`runner.ts`, orkestra). Süreler ADR-0035'te yazılır. | `0007`: `jobs_finished_idx ON jobs (status, updated_at) WHERE status IN ('done','dead')` | Ekleme. Payload yalnız kimlik taşıdığı için KVKK açısından risk azaltır. |
| 4.5 | Günlük işler her dağıtımda yeniden kuyruğa giriyor: `kalemcikTick` ve `dailyBillingTick` "bugün kuyruğa koydum" bilgisini süreç belleğinde tutuyor; kısmi tekil dizin (`jobs_dedupe_active_uq`) yalnız `queued` ve `running` satırları kapsadığı için aynı günün işi `done` olduktan sonra yeniden başlatılan süreç onu tekrar ekliyor. `notify.send` tekilleştirmesi de aynı nedenle `done` sonrası korumuyor. | Yeni `enqueueOnceSql`: aynı `(type, dedupe_key)` ile herhangi bir durumda satır varsa eklemez (`INSERT ... SELECT ... WHERE NOT EXISTS`), yarışı mevcut kısmi tekil dizin ve `ON CONFLICT DO NOTHING` çözer. Günlük ve takvimli üreticiler buna geçer: `apps/worker-node/src/kalemcik/gunluk.ts` (yazma), `src/billing/jobs.ts` `enqueueDailyBillingSql` (odeme) ve onu çağıran `src/handlers.ts` `dailyBillingTick` (orkestra). Silme süresi (4.4) tekilleştirme penceresinden (1 gün) uzun kalır. | `0007`: `jobs_dedupe_idx ON jobs (type, dedupe_key) WHERE dedupe_key IS NOT NULL` (tekil değil) | Ekleme; anahtar biçimleri değişmez. |

ADR: ADR-0035. Testler: `packages/db/test` içinde gerçek PostgreSQL'de iki işçili kilit kaybı, kalp atışı, stale
`dead` geçişi, silme ve aynı gün ikinci ekleme senaryoları; `services/worker-py/tests/test_jobs.py` eşleri.

## Madde 5: işleyicisi olmayan iş türleri ve `jobPayloadSchemas`

`jobTypes` 16 tür sayar (`packages/contracts/src/schemas.ts:83-100`). İşleyicisi olmayanlar:

| Tür | Bugün | Öneri | Adım |
|---|---|---|---|
| `embed.chunks` | Üretici var (`anonymizer/store.py`, `records` tetikleyicisi), tüketici yok. | Kalır. Tüketici casuist (`services/worker-py/nlp`) tarafından yazılır; arama için yayın ön koşulu (review.md P9 madde 1). | yok |
| `ingest.parse` | Ne üretici ne tüketici. | veri-toplama'ya sorulur: ayrıştırma `ingest.fetch` içinde kalacaksa tür kaldırılır, ayrı adım olacaksa işleyici yazılır. | B ya da yok |
| `docx.validate` | Denetim eşzamanlı iç HTTP ile yapılıyor (`apps/web/src/app/yazma/_sunucu/denetim.ts` → `WORKER_PY_URL`). | Kaldırılır (yazma teyidiyle). | B |
| `kampus.summarize`, `kampus.poster` | ADR-0031 ile kapsam dışı. | Kaldırılır. | B |
| `live.fetch` | K-12 canlı federasyon; ne üretici ne tüketici. | 1.0 kapsamında kalacaksa veri-toplama işleyiciyi `live_cache` ile yazar; kalmayacaksa tür ve `live_cache` kaldırılır. Karar orkestra ve Tarık'ın. | B ya da yok |

PostgreSQL enum değerini doğrudan silemez. Adım B'de: yeni `job_type` türü oluşturulur, kaldırılan değeri taşıyan satır
varsa migration `RAISE EXCEPTION` ile durur, `ALTER TABLE jobs ALTER COLUMN type TYPE ... USING type::text::...`, eski tür
silinir ve yeniden adlandırılır. `jobs_notify()` tetikleyicisi `NEW.type::text` kullandığı için etkilenmez. Python
`JobType` (`core/jobs.py:16-29`) aynı PR'da daralır.

`jobPayloadSchemas` (`packages/contracts/src/jobs.ts:85-92`) hiçbir üretici ya da tüketici tarafından kullanılmıyor.
Adım A'da:

- `@kazuist/contracts` içine `parseJobPayload(type, payload)`; `packages/db` içine doğrulayan `enqueueJob` yardımcısı.
- worker-node `queue.ts` (orkestra) işi aldıktan sonra payload'ı doğrular; geçersizse iş `dead` olur, hata metni
  `invalid payload` (içerik loglanmaz).
- Yerel şemalar sözleşmeye taşınır: `kalemcik.daily` (`{}`), `citations.extract`, `rules.extract`, `ingest.fetch`,
  `mevzuat.rg_daily`. Bir sözleşme testi her türün ya şeması olduğunu ya da açık bir istisna listesinde durduğunu sınar.
- worker-py yeni bağımlılık eklemeden aynı biçimleri elle denetler (`core/jobs.py`).

Geri uyumluluk: kuyruktaki mevcut payload'lar bugünkü üreticilerin yazdığı biçimdedir; şemalar bu biçimlerden türetilir.
ADR: A için ADR-0035, B için ADR-0036.

## Madde 6: OpenAPI sapması

Tarama (`openapi.yaml` 90 yol, `apps/web/src/app/api` altında 72 `route.ts`, 12 Kasım 2026):

- Rotası olmayan 11 `/v1/kampus/*` yolu (`openapi.yaml:1078-1326`): adım B'de kaldırılır (madde 7 ile).
- Rotası olmayan diğer 11 yol, 1.0 özelliğidir ve sözleşmede kalır:

  | Yol | Sahip |
  |---|---|
  | `/v1/guides/{id}/progress` | icerik |
  | `/v1/hmgs/exams`, `/v1/hmgs/exams/{id}/attempts`, `/v1/hmgs/report`, `/v1/reviews` | pratik |
  | `/v1/notifications/preferences`, `/v1/push/apns-tokens`, `/v1/push/web-subscriptions` | kimlik |
  | `/v1/records/{id}/versions` | casuist |
  | `/v1/templates/docx` | yazma |
  | `/v1/webhooks/appstore` | odeme (ios ile) |

  Adım A'da bu yollara `x-kazuist-uygulama: planlandi` eki konur ve yeni bir sözleşme testi
  (`packages/contracts/test/rotalar.test.ts`) her yolun ya bir `route.ts` dosyası olduğunu ya da bu eki taşıdığını,
  eki taşıyan yolun rotası varsa da ekin kaldırılmasını ister.
- OpenAPI'de olmayan 4 rota adım A'da sözleşmeye eklenir: `/v1/templates/check`, `/v1/templates/rules/{id}`,
  `/v1/writing-projects/ayarlar`, `/auth/step-up/confirm`. Şekilleri bugünkü rota dosyalarından okunur. `ayarlar`
  yol parçası diğer İngilizce yollarla tutarsızdır; yazma ile `settings` adına geçiş adım B'de konuşulur, varsayılan
  bugünkü adla eklemektir.
- Sözleşmede olup kullanılmayan 13 zod şeması: listesi uygulama PR'ında `requests.ts` ve `schemas.ts` dışa aktarımlarının
  `apps/` ve `services/` içinde kullanımı taranarak çıkarılır. Altı Kampüs giriş şeması (`KampusProfileInput`,
  `KampusPostInput`, `KampusFollowInput`, `KampusFileJobInput`, `KampusFulltextRequestInput`, `KampusReportInput`) ve
  `requests.ts:255-261` eşlemeleri bunun parçasıdır ve adım B'de kalkar; kalanı rotası olmayan 1.0 uçlarına aitse kalır.
- `servers` listesindeki `https://staging.kazuist.com/api` ADR-0033 onaylanırsa adım A'da kalkar (istemciler için
  kırıcı değil).

Geri uyumluluk: ekleme kısmı geriye uyumludur. Kaldırma kısmının uygulaması ve istemcisi yoktur; iOS istemcisi
yeniden üretilir.

## Madde 7: ADR-0031 ve ADR-0032 artıkları (adım B)

| Yer | Değişiklik | Önce yapılması gereken (sahip) |
|---|---|---|
| `packages/db/src/schema/kampus.ts` (8 tablo), `schema/index.ts:7` | Dosya ve dışa aktarım kalkar; migration `DROP SCHEMA kampus CASCADE`, önce tabloların boş olduğunu denetler, değilse durur. Geri dönüş için 0001'deki tanımlardan üretilmiş geri alma SQL'i ADR-0036'ya eklenir. | kimlik `takedown.ts` Kampüs dallarını kaldırır (review.md P7 madde 8). |
| `takedown_target_type` enum, `contracts/src/account.ts:111` | `kampus_post`, `kampus_file` kalkar; enum madde 5'teki yöntemle yeniden kurulur; bu değerleri taşıyan satır varsa migration durur. | kimlik, aynı önkoşul. |
| `contracts/src/account.ts:150` `kampus-reports` kuyruk adı | Kalkar. | Yok. |
| Bildirim türleri (`contracts/src/jobs.ts:12-22`) | `tam_metin_istegi`, `tam_metin_cevabi` kalkar; `takip` Kampüs dışı bir anlam taşımıyorsa o da kalkar (plan 10.8, kimlik ve orkestra teyidi). `notification_prefs` sütunlarındaki bu anahtarlar migration ile silinir (`email - 'tam_metin_istegi'` ve eşleri), çünkü `NotificationPrefsColumn` bilinmeyen anahtarı reddeder. | kimlik `packages/i18n/tr/hesap.json` içindeki iki metni kaldırır. |
| `contracts/src/legal.ts:19,28,30,37` | `routePath` yalnız `/hukuki/<slug>`; `lang` `z.literal('tr')` (ya da alan kalkar); `alternate` kalkar; `binding` açıklamasındaki İngilizce notu kalkar. İstek: `docs/istekler/on-yuz-yalniz-turkce-sozlesme.md`. | hukuk-uyum `content/hukuki/tr` ön bilgilerinde `alternate` kalmadığını doğrular. |
| `packages/db/src/seed.ts:64,74` | `kampus` özellik bayrağı ve `kampus_ozet` fiyat tohumu kalkar. | Yok. |
| OpenAPI `/v1/kampus/*`, `requests.ts` Kampüs şemaları | Madde 6. | Yok. |
| `packages/ai-gateway` Kampüs görev adları, `packages/ledger/src/prices.ts:97-98` | Sahiplerinin yolunda; mimar yalnız sözleşme tarafını kaldırır. | yz-gecidi, odeme (`docs/istekler/on-yuz-kampus-temizligi.md`). |

Geri uyumluluk: tablolarda ve kuyrukta Kampüs verisi yok (ADR-0031 madde 4); migration bunu varsaymaz, denetler.
ADR: ADR-0036 (ADR-0031 madde 4 ve ADR-0032 uygulaması).

## Madde 8: atıf ağı şeması ve eksik dizinler (adım A)

İstek: `docs/istekler/atif-agi-sema.md`. Hepsi ekleme, migration `0007`:

- `works.work_key text` tekil, boş olabilir.
- `work_citations` tablosu: `id`, `from_record_id` (records, silmede cascade), `work_id` (works), `pages jsonb default
  '[]'`, `confidence real`, `confirmed boolean default false`, `rejected boolean default false`, `extractor text`,
  `created_at`; tekil `(from_record_id, work_id)`, dizin `work_id`.
- `citation_edges.rejected boolean not null default false`. Veri göçü: bugün ret `confirmed = true, confidence = 0`
  olarak saklanıyor (`citations/store.py`); migration bu satırları `rejected = true` yapar. Okuma sorgusu
  (`apps/web/src/app/atif-agi/_sunucu/sql.ts`) ve `store.py` atif-agi tarafından `NOT rejected` koşuluna geçirilir.
- Karar numarası eşleşmesi için ifade dizinleri: `records ((replace(esas_no, ' ', '')))` ve
  `records ((replace(karar_no, ' ', '')))`; `store.py` aynı ifadeyle aradığı için ek sütun gerekmez.
- `sources_raw (record_id)` dizini.

Geri uyumluluk: tamamen ekleyici; atif-agi'nin `42P01` (tablo yok) yedek yolu migration'dan sonra devre dışı kalır.
İlk dağıtımda tablolar boş olduğundan dizinler işlem içinde kurulabilir; büyük tabloda `CONCURRENTLY` gerekir ve ayrı
adım ister. ADR: ADR-0035.

## Madde 9: hiç başvurulmayan tablolar

Kod tarafından okunmayan dokuz tablo. Körlemesine silinmez; her biri bir 1.0 özelliğine ve sahibine bağlanır.

| Tablo | Amaç | 1.0 özelliği ve sahip | Öneri |
|---|---|---|---|
| `exam_attempts` | HMGS deneme sonuçları | `/v1/hmgs/exams/{id}/attempts`, pratik | Kalır |
| `guide_progress` | Rehber ilerlemesinin sunucuda saklanması (FR-34) | `/v1/guides/{id}/progress`, icerik | Kalır |
| `iap_transactions` | StoreKit 2 işlemleri | iOS ödeme, odeme ve ios | Kalır |
| `norm_mappings` | KVKK-GDPR madde eşleniği (K-17) | casuist ve icerik | Kalır |
| `provider_costs` | YZ maliyet görünürlüğü (plan 8.9) | yz-gecidi | Kalır |
| `live_cache` | Canlı federasyon önbelleği (K-12) | madde 5 `live.fetch` kararına bağlı | Karara göre |
| `card_versions` | Kart sürümleri ve onaylayan | Pratik kartları bugün `content/desteler` dosyalarından okunuyor; pratik veri tabanına geçecekse kalır (`docs/istekler/pratik-sozlesme.md`) | pratik'e sorulur |
| `institution_profiles` | Kurum profilleri; `template_rules.institution_id` buna dış anahtar verir | yazma | yazma'ya sorulur; kalkarsa dış anahtar sütunu da kalkar |
| `eval_runs` | Ölçüm sonuçları | `eval/` raporları dosyaya yazıyor, hiçbir CI işi tabloya yazmıyor | Kaldır adayı |

"Kaldır" kararı verilen tablolar adım B migration'ına girer (boşluk denetimiyle). ADR: ADR-0036.

## Sıra ve onaylar

1. Adım A (ADR-0035, sözleşme 1.5.0, migration 0007): mimar PR'ı; aynı anda orkestra `queue.ts`, `runner.ts` ve `handlers.ts`,
   yazma `gunluk.ts`, odeme `billing/jobs.ts` çağrılarını yeni imzalara geçirir (aynı PR ya da arka arkaya iki PR).
2. Sahip PR'ları: kimlik (`takedown.ts`, `hesap.json`), yz-gecidi (Kampüs görev adları), odeme (Kampüs fiyatları),
   atif-agi (`rejected` sütununa geçiş), hukuk-uyum (`alternate` denetimi).
3. Adım B (ADR-0036, sözleşme 2.0.0 ya da 1.6.0, migration 0008): Tarık'ın açık onayıyla, ilk üretim dağıtımından önce.

## Tarık'tan gerekenler

- ADR-0035 ve ADR-0036 metinlerinin onayı (yazıldıklarında).
- Adım B'deki yıkıcı migration için açık onay.
- `live.fetch` (canlı federasyon) 1.0 kapsamında mı.
