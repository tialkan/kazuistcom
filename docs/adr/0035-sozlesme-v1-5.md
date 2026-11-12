# ADR-0035: Sözleşme v1.5: iş kuyruğu sağlamlığı, iş yükü doğrulaması, OpenAPI uygulama durumu, atıf ağı şeması ve bildirim teslim kaydı

- Tarih: 2026-11-12
- Karar kodu: yok (plan 17.3/4; review.md P1 madde 4, 5, 6 ve 8; plan `docs/istekler/mimar-p1-sozlesme-temizligi.md` adım A)
- İstekler: `docs/istekler/atif-agi-sema.md`, `docs/istekler/kimlik-p7-bildirim-idempotency.md`,
  `docs/istekler/casuist-p9-arama-dizini.md` (madde 2 ve 3)
- Durum: Önerildi, Tarık onayı bekliyor
- İlgili kararlar: ADR-0023 (iş kuyruğu sözleşmesi, masked_text), ADR-0026 (embed.chunks), ADR-0031, ADR-0032,
  ADR-0033; sonraki kaldırıcı adım ADR-0036 (yazılmadı)

## Bağlam

Yayın öncesi denetim (review.md P1) sözleşme ve şemada dört grup sorun buldu; hepsi koddan doğrulandı
(`docs/istekler/mimar-p1-sozlesme-temizligi.md`):

1. İş kuyruğu (`packages/db/src/jobs.ts`, `services/worker-py/core/jobs.py`): `completeJobSql` ve `failJobSql` işi
   yalnız `id` ve `status = 'running'` ile buluyordu; kilidi düşüp başka işçiye geçen bir işi eski işçi bitirebilir
   ya da yeniden kuyruğa atabilirdi. `releaseStaleJobsSql` deneme sınırına bakmıyordu (çöken iş sonsuza dek kuyruğa
   dönerdi). Kalp atışı yoktu (15 dakikayı aşan iş ikinci işçide yeniden başlardı). Biten işleri silen kod yoktu.
   Günlük işler "bugün kuyruğa koydum" bilgisini süreç belleğinde tuttuğu için her dağıtımda aynı günün işini
   yeniden kuyruğa koyabiliyordu; kısmi tekil dizin `jobs_dedupe_active_uq` yalnız `queued` ve `running`
   satırlarını kapsar.
2. `jobPayloadSchemas` hiçbir üretici ya da tüketici tarafından kullanılmıyordu; beş türün şeması yalnız sahibinin
   yerel kodundaydı.
3. OpenAPI ile Route Handler'lar ayrışmıştı: rotası olmayan 22 yol (11'i Kampüs), sözleşmede olmayan 4 rota.
4. Atıf ağı doktrin kenarları için tablo yoktu (`works.work_key`, `work_citations`), editör reddi
   `confirmed = true, confidence = 0` olarak saklanıyordu, karar numarası araması ve `sources_raw.record_id` için
   dizin yoktu.

Ayrıca kimlik, `notify.send` yeniden denendiğinde kanal bazında hangi teslimin yapıldığını bilmek için bir teslim
tablosu istedi; casuist, worker-py gömme değişkenlerinin `.env.example`'a eklenmesini istedi.

Bu ADR yalnız ekler ve davranış düzeltir. Tür değeri, uç, tablo ya da sütun kaldırmaz; kaldırma adımı (Kampüs
artıkları, kullanılmayan iş türleri, ADR-0032 artıkları) ADR-0036'dır ve Tarık'ın açık onayını ister.

## Karar

### Sürüm

`packages/contracts` ve `packages/db` 1.5.0 (`openapi.yaml` `info.version`, `CONTRACT_VERSION`, iki
`package.json`). Migration `0007_v1_5_jobs_citations_deliveries.sql` yalnız ekler: iki tablo, iki sütun, yedi
dizin, bir tekil kısıt ve bir veri işaretlemesi. Önceki migration'lar değişmedi. Migration 0007, v1.4 verisi olan
bir veri tabanında sınanır (`packages/db/test/migration-0007.test.ts`).

### İş kuyruğu (review.md P1 madde 4)

- 4.1 Kilit sahipliği: `completeJobSql`, `failJobSql` ve yeni `buryJobSql` ile `heartbeatJobSql` işçi kimliğini de
  eşler (`AND locked_by = $3`, Python'da `%(worker)s`) ve `RETURNING id` döndürür. Satır dönmezse kilit
  kaybedilmiştir: işçi "lock lost" diye (iş kimliği, tür ve adım; yük ya da metin değil) loglar, işi ne bitirir ne
  yeniden dener; iş yeni sahibindedir. İmza değişti: `completeJobSql` `$1 id, $2 result, $3 worker`,
  `failJobSql` `$1 id, $2 error, $3 worker`.
- 4.2 Bayat kilit: `releaseStaleJobsSql` denemesi biten işi `dead`, diğerini `queued` yapar; `error = 'stale
  lock'` (kişisel veri yok) ve `RETURNING id, status`. Sınır `JOB_STALE_SECONDS = 900`.
- 4.3 Kalp atışı: `heartbeatJobSql` (`locked_at = now()`), işleyici çalışırken her `JOB_HEARTBEAT_SECONDS = 300`
  saniyede bir (bayat sınırının üçte biri). worker-node `queue.ts` bir zamanlayıcıyla, worker-py `core/jobs.py`
  işleyici süresince çalışan bir iş parçacığıyla yapar; iş parçacığı işçinin imlecini, imleç boştayken kullanır ve
  işleyici bitince durdurulur.
- 4.4 Temizlik: `pruneJobsSql`, `done` satırlarını 14 günden, `failed` ve `dead` satırlarını 90 günden sonra siler
  (`JOB_RETENTION_DAYS`), çağrı başına en çok 5000 satır (`JOB_PRUNE_BATCH`). worker-node döngüsü günde bir
  çalıştırır (`runner.ts`, `pruneEveryMs`, öntanım bir gün). `failed`, web sürecinin kendi bitirdiği
  `rules.extract` satırlarının son durumudur ve `dead` ile aynı süreye bağlandı. Dizin `jobs_finished_idx (status,
  updated_at) WHERE status IN ('done','failed','dead')`. Süreler her tekilleştirme penceresinden (bir gün) uzundur.
  Yük yalnız kimlik taşıdığı için silme KVKK açısından riski azaltır.
- 4.5 Bir kez kuyruğa alma: `enqueueOnceSql` aynı `(type, dedupe_key)` herhangi bir durumda varsa eklemez
  (`INSERT ... SELECT ... WHERE NOT EXISTS`); yeni anahtarda iki üreticinin yarışını mevcut
  `jobs_dedupe_active_uq` ve `ON CONFLICT DO NOTHING` çözer; anahtar boşsa hiçbir şey eklenmez. Dizin
  `jobs_dedupe_idx (type, dedupe_key) WHERE dedupe_key IS NOT NULL` (tekil değil). Düz ekleme için `enqueueJobSql`
  (yalnız etkin satırları tekilleştirir). Anahtar biçimleri değişmez.
- Doğrulayan üretici yardımcısı: `@kazuist/db/jobs` `enqueueJob(db, type, payload, { dedupeKey, once, runAfter })`
  yükü sözleşmeyle denetler, geçersizse hiçbir şey yazmadan `InvalidJobPayload` atar (mesajda yalnız tür ve neden).

### İş yükleri (review.md P1 madde 5, doğrulama kısmı)

- `@kazuist/contracts` içinde `parseJobPayload(type, payload)`: `{success: true, data}` ya da
  `{success: false, reason: 'invalid_payload' | 'no_schema'}`; hiçbir zaman atmaz ve yükü geri yansıtmaz.
- Sahiplerin yerel şemaları sözleşmeye taşındı: `ingest.fetch` (bağlayıcı başına bir biçim; bugün yalnız
  `mevzuat.rg_daily` üretir), `citations.extract` (tek kayıt, kayıt listesi ya da Batch takip işi; en çok 500
  kayıt), `rules.extract` (`{userId, kind}`), `kalemcik.daily` (`{}`), `mevzuat.rg_daily` (`{date?}`). Şemalar
  bugünkü üreticilerin yazdığı biçimlerden türetildi.
- Şeması olmayan türler `jobPayloadExempt` listesindedir: `ingest.parse`, `docx.validate`, `kampus.summarize`,
  `kampus.poster`, `live.fetch`. Hiçbirinin üreticisi ya da tüketicisi yoktur; tüketici yazılmadan önce şema
  eklenir. Sözleşme testi her türün ya şeması olduğunu ya da bu listede durduğunu, ikisinin birden olmadığını sınar.
- Tüketiciler (worker-node `queue.ts`, worker-py `core/jobs.py`) işi aldıktan sonra yükü denetler; geçersiz ya da
  şemasız yükte işleyici çalışmaz, iş hemen `dead` olur, hata metni `invalid payload`; yük loglanmaz.
- worker-py yeni bağımlılık eklemeden aynı biçimleri elle denetler. İki taraf aynı fikstür dosyasıyla sınanır:
  `packages/contracts/test/fixtures/job-payloads.json` (zod ve Python aynı geçerli ve geçersiz örnekleri aynı
  sonuçla değerlendirir). Python'daki SQL metinleri TypeScript'teki metinlerle test içinde karşılaştırılır.

### OpenAPI uygulama durumu (review.md P1 madde 6, ekleme kısmı)

- Her yol ya `apps/web/src/app/api` altında bir `route.ts` dosyasıyla aynı HTTP yöntemlerini taşır ya da
  `x-kazuist-uygulama` eki taşır: `planlandi` (1.0 özelliği, işleyicisi yazılmadı) ya da `kaldirilacak`
  (ADR-0036 ile kalkar). `packages/contracts/test/rotalar.test.ts` bunu, ekli bir yolun işleyicisi gelince ekin
  kaldırılmasını ve her işleyicinin sözleşmede olmasını sınar.
- `planlandi`: `/v1/guides/{id}/progress` (icerik); `/v1/hmgs/exams`, `/v1/hmgs/exams/{id}/attempts`,
  `/v1/hmgs/report`, `/v1/reviews` (pratik); `/v1/notifications/preferences`, `/v1/push/apns-tokens`,
  `/v1/push/web-subscriptions` (kimlik); `/v1/records/{id}/versions` (casuist); `/v1/templates/docx` (yazma);
  `/v1/webhooks/appstore` (odeme ve ios).
- `kaldirilacak`: 11 `/v1/kampus/*` yolu (ADR-0031).
- Sözleşmeye eklenen dört uç (şekilleri bugünkü rota dosyalarından okundu): `POST /v1/templates/check`
  (`checkTemplateDocx`, çok parçalı `file` ve JSON metni `rules`, 200 `DocxCheckResult`, denetleyici yoksa 503),
  `GET` ve `DELETE /v1/templates/rules/{id}` (`TemplateRuleRecord`), `GET` ve `PUT /v1/writing-projects/ayarlar`
  (`WritingSettings {hitap}`), `POST /auth/step-up/confirm` (`StepUpConfirmInput {code}`, 204). `ayarlar` yol
  parçası bugünkü adla eklendi; `settings` adına geçiş ADR-0036'da konuşulur.
- `extractTemplateRules` çok parçalı gövdesine rotanın zaten okuduğu `kind` (`tez` ya da `makale`, öntanım `tez`)
  eklendi.
- `servers` listesindeki `staging.kazuist.com` kaldı: ADR-0033 henüz onaylanmadı. Onaylanınca kaldırılır
  (istemciler için kırıcı değil).
- Sözleşmede tanımlı olup `packages/contracts` dışında kullanılmayan istek şemaları (12 Kasım 2026 taraması):
  Kampüs girdileri (`KampusProfileInput`, `KampusPostInput`, `KampusFollowInput`, `KampusFileJobInput`,
  `KampusFulltextRequestInput`, `KampusReportInput`; ADR-0036 ile kalkar); `planlandi` uçların girdileri
  (`GuideProgressInput`, `TemplateDocxInput`, `ReviewInput`, `HmgsAttemptInput`, `NotificationPreferencesInput`,
  `WebPushSubscriptionInput`, `ApnsTokenInput`; işleyici yazılınca kullanılır); işleyicisi yerel şema kullanan
  uçların girdileri (`LibraryItemInput`, `TemplateRulesUpload`, `WritingProjectInput`, `WritingProgressInput`,
  `DocxCountUpload`, `AbbreviationsInput` ve bu sürümde eklenen `TemplateCheckUpload`, `WritingSettings`,
  `StepUpConfirmInput`). Son grup sahiplerine sözleşme şemasına geçiş olarak yönlendirildi; yerel şema sözleşmeden
  ayrışırsa test bunu yakalamaz.

### Atıf ağı şeması ve dizinler (review.md P1 madde 8)

- `works.work_key text` tekil (`works_work_key_unique`), boş olabilir; çıkarıcının `ON CONFLICT (work_key)` yazımı
  bununla çalışır.
- `work_citations`: `id`, `from_record_id` (records, silmede cascade), `work_id` (works), `pages jsonb not null
  default '[]'` (sayfa metinleri dizisi), `confidence real`, `confirmed` ve `rejected boolean default false`,
  `extractor`, `created_at`; tekil `(from_record_id, work_id)` (çıkarıcının `ON CONFLICT` hedefi), dizin `work_id`.
- `citation_edges.rejected boolean not null default false`. Veri işaretlemesi: `confirmed AND confidence = 0`
  satırları `rejected = true` olur; `confirmed` ve `confidence` değişmez, onaylanmamış sıfır güvenli satırlar
  ret sayılmaz. Okuma sorguları sahiplerince `NOT rejected` koşuluna geçer.
- İfade dizinleri `records_esas_key_idx` ve `records_karar_key_idx` (`replace(esas_no, ' ', '')`,
  `replace(karar_no, ' ', '')`); istekteki ayrı `esas_key` sütunu gerekmedi, çünkü `citations/store.py` aynı
  ifadeyle arar. `sources_raw_record_idx (record_id)`.
- İlk dağıtımda tablolar boş olduğu için dizinler işlem içinde kurulur. Dolu bir tabloda yeni dizin gerekirse
  `CREATE INDEX CONCURRENTLY` ayrı bir adım olur.

### Bildirim teslim kaydı (kimlik isteği, değiştirerek kabul)

- `notification_deliveries (job_id, channel, target_hash, delivered_at)`, birincil anahtar
  `(job_id, channel, target_hash)`. `channel` sözleşmedeki `notificationChannels` değerleriyle CHECK'li.
  `target_hash` e-postada `'email'`, push kanallarında uç noktanın ya da cihaz jetonunun anahtarlı özetidir
  (HMAC-SHA256, küçük harf onaltılık 64 karakter); CHECK ham değeri reddeder.
- Değişiklik: `job_id`, `jobs(id)`'ye `ON DELETE CASCADE` ile bağlandı. İstekteki ayrı 30 günlük saklama yerine
  teslim kaydı işiyle birlikte silinir (4.4: `done` 14 gün); kayıt yalnız aynı işin yeniden denemesinde anlamlıdır.
- SQL: `deliveredTargetsSql` (işin teslim edilmiş hedefleri), `recordDeliverySql` (teslimden hemen sonra,
  `ON CONFLICT DO NOTHING`). `jobPayloadSchemas['notify.send']` değişmedi.

### Ortam değişkenleri

`.env.example`'a worker-py gömme değişkenleri (`KAZUIST_EMBED_BACKEND`, `KAZUIST_EMBED_DIR`,
`KAZUIST_EMBED_THREADS`, `KAZUIST_EMBED_QUANTIZED`) ve isteğe bağlı test değişkeni `KAZUIST_TEST_DATABASE_URL`
eklendi; değer yok.

## Geri uyumluluk

- Veri: migration 0007 yalnız ekler; `ADD COLUMN ... DEFAULT false` PostgreSQL 11'den beri tabloyu yeniden yazmaz.
  Tek veri değişikliği `citation_edges.rejected` işaretlemesidir; eski alanlar korunur.
- İş kuyruğu: SQL imzaları değişti, kuyruktaki satırlar değişmez. Eski imzayla çağıran bir işçi PostgreSQL'den
  "bind message supplies 2 parameters" hatası alır; bu yüzden worker-node `queue.ts` ve worker-py `core/jobs.py` aynı
  PR'da güncellendi. Kuyruktaki mevcut yükler bugünkü üreticilerin biçimindedir ve şemalar onlardan türetildi.
- API: bütün eklemeler geriye uyumludur; yeni uçlar zaten çalışan rotaların belgelenmesidir. iOS istemcisi
  henüz üretilmedi (`apps/ios` yok); `openapi-generator-config.yaml` değişmedi.

## Uygulama (bu PR) ve sahip işleri

- Mimar yolları: `packages/contracts/**`, `packages/db/**`, `services/worker-py/core/jobs.py`,
  `services/worker-py/tests/test_jobs.py` ve `test_main.py`, `.env.example`, bu ADR, istek sonuçları.
- Orkestra yolları, plan adım A gereği aynı PR'da (imza değişikliği eski çağrıyı derlemede değil çalışma anında
  kırdığı için): `apps/worker-node/src/queue.ts` (yük doğrulama, kalp atışı, işçi kimliği, kilit kaybı logu),
  `runner.ts` (bayat kilit sonucu logu, günlük temizlik), `handlers.ts` (`dailyBillingTick` `enqueueJob` ile bir
  kez), `apps/worker-node/test/{queue,runner,billing}.test.ts`.
- anonimlestirme yolunda tek dokunuş: `services/worker-py/anonymizer/tests/test_anonymizer.py` tüketici testindeki
  `"r1"` kayıt kimliği UUID yapıldı (tüketici artık yükü denetliyor).
- Sahiplere yönlendirilenler (`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md`): yazma `kalemcikTick`'i ve
  odeme günlük ve bildirim üreticilerini `enqueueJob(..., { once: true })`'ya geçirir; kimlik `dispatch.ts`'te
  teslim kaydını kullanır; atif-agi ve casuist `rejected` sütununa ve doktrin tablolarına geçer; sahipler yerel
  istek şemaları yerine sözleşme şemalarını içe aktarır.

## Doğrulama

`packages/db` migration testleri PGlite (PostgreSQL 18 wasm) üzerinde: iki işçili kilit kaybı, kalp atışı, deneme
sınırında bayat kilidin gömülmesi, temizlik ve batch sınırı, aynı günün ikinci kez kuyruğa alınmaması, doğrulayan
üretici, teslim kaydı CHECK'leri ve cascade, v1.4 verisinde ret işaretlemesi. Ayrıntı ve komutlar PR açıklamasında
ve DEVIR.md'dedir.

## Sonuçlar

- Bir işi aynı anda yalnız kilidin sahibi bitirebilir; çöken iş deneme sınırında durur; uzun iş ikinci kez başlamaz.
- `jobs` tablosu sınırlı büyür; teslim kaydı ve iş yükleri onunla birlikte silinir.
- Günlük işler yeniden başlatmada ikinci kez çalışmaz (sahipler `once` geçişini yapınca hepsi için).
- Sözleşme dışı bir yük işleyiciye ulaşmaz; şema eklenmeden yeni bir iş türü tüketilemez.
- OpenAPI ile rotalar arasındaki fark testle görünür; yeni uç sözleşmesiz eklenemez.
- Açık: ADR-0036 (kaldırıcı adım), Tarık onayı ve `live.fetch` kapsam kararı.
