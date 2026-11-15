## 15 Kasım 2026, yz-gecidi: BYOK arayüzü, ödeme kapalı yayın, geçit zaman aşımı ve uzlaşma (yz-gecidi/byok-arayuz-odeme-kapali)

Orkestra görevi: review.md P8 madde 4 ve 5, plan K-08, K-09, FR-84, 8. bölüm. `packages/contracts` ve `packages/db`
değişmedi; yeni bağımlılık yok. Sözleşme ve sahiplik isteği: `docs/istekler/yz-gecidi-byok.md`.
- BYOK arayüzü `/hesap/yz-anahtari` (oturum istemez): OpenRouter, önerilen üç model ya da elle model kimliği,
  anahtar yalnız tarayıcıda (varsayılan sessionStorage, açık seçimle localStorage ve uyarı), gizlilik öncelikli
  (`provider.zdr`), anahtarı sil, "Anahtarı dene" (`GET openrouter.ai/api/v1/key`; ücretsiz katman ve sınırsız
  anahtar uyarısı), `:free` modelde ücretsiz model uyarısı. Kayıtlı anahtar forma geri yazılmaz, maskeli gösterilir.
- `/ara` kaynaklı özet: tarayıcıda anahtar varsa BYOK istemci protokolü (prepare, tarayıcıdan doğrudan OpenRouter,
  casuist tarayıcı doğrulayıcısı, verify); yoksa günlük ücretsiz hak. Hak bitince (402) BYOK bağlantısı.
  Maskeleme sunucuda `scrubParts` ile, tarayıcı göndermeden önce `assertMasked` ile yeniden denetler.
- CSP `connect-src 'self' https://openrouter.ai` (`BYOK_CONNECT_ORIGINS`); başka köken yok.
- Ödeme kapalı yayın: `apps/web/src/server/billing/acik.ts` `odemeAcik()` üç `IYZICO_*` değişkenine bakar. Yoksa
  `/fiyatlar` "Kredi satışı henüz açılmadı" notu, `/odeme` ödeme adımı yerine ücretsiz hak ve BYOK bağlantıları.
  `/fiyatlar` her durumda BYOK bölümü gösterir.
- Geçit (P8.5): her sağlayıcı çağrısında ilk bayt ve toplam süre sınırı (`adapters/deadline.ts`, rota başına
  `timeoutMs`; zaman aşımı `ProviderTimeoutError` 504, çıktı yokken yedek sağlayıcıya geçer). Akış sonunda
  `consume` ya da `release` hatası artık akışı kırmaz: türsüz hata bir kez yeniden denenir, maliyet olayı
  `creditsCharged` (defterin gerçekten aldığı), `creditsDue` ve `settlement` taşır, `onSettleFailure` uyarısı
  (gecit.ts yalnız kimlik ve tutar loglar), harcama sayacı uzlaşmadan önce yazılır. Soru ve pasajlar `scrubParts`
  ile tek etiket uzayında maskelenir; denetim karakterleri silinir, ayırıcı kayması kapandı.
- Üretimde `VALKEY_URL` (ya da `BETTER_AUTH_SECRET`) yoksa `buildSummaryDeps` `GatewayConfigError` atar ve
  değişken adını loglar; özet uçları 503 döner (önceden sessizce bellek sayacı).
- Tarayıcı derlemesi `@kazuist/ai-gateway/browser` (`browser.ts`); içe aktarma zinciri Node yerleşiği içermez,
  test zorlar.
- Test: ai-gateway 104 (deadline, settlement, browser yeni), web 666 (gerçek prepare/verify ile BYOK uçtan uca,
  üretim yapılandırması, `/fiyatlar` ve `/odeme` satış durumu), enjeksiyon 60/60, e2e 108/108 (yeni
  `byok.spec.ts` 9 test, openrouter.ai tarayıcıda taklit). axe 375/768/1440 ihlal 0. Canlı OpenRouter duman testi
  çalışmadı: anahtar dosyası yok.
- Açık: derin özette Sonnet 5.5 zorunlu akıl yürütme (SAGLAYICILAR.md), `PrepareRequest.filters` (istek),
  Anthropic, OpenAI ve Gemini için tarayıcı BYOK'u (CSP ve CORS denetimiyle birlikte), `USD_TL` sabiti.

## 14 Kasım 2026, yazma: rota şemaları sözleşmeden, Kalemcik sakin yüz, zip bombası testi (yazma/rota-sozlesme-sakin-yuz)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` yazma madde 3 ve `docs/istekler/yazma-kalemcik-notr-ton.md` kararı.
`packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
- `apps/web/src/app/yazma/_sunucu/uclar.ts` ve `projeler.ts`: yerel zod şemaları kalktı. `WritingProjectInput`,
  `WritingProgressInput`, `WritingSettings`, `AbbreviationsInput` JSON gövdelerini, `TemplateRulesUpload`,
  `TemplateCheckUpload`, `DocxCountUpload` çok parçalı gövdeleri doğrular. Sözleşme yalnız biçimi söyler (proje
  alanlarının hepsi isteğe bağlı); sunucu, sözleşme şeması geçtikten sonra eskisi gibi şunları ister: yeni projede
  başlık, tür ve hedef zorunlu; başlık ve not kırpılır, boş başlık olmaz, hedef en çok 2 milyon kelime.
- Davranış değişikliği (testle gösterildi): kılavuz yüklemede `institutionName` 200 karakterden uzunsa artık 400
  (eskiden kırpılıyordu); sözleşme `max 200` diyor. `kind` yoksa `tez`. `rules` parçası metin değilse 400.
- Kalemcik: yükleniyor ve proje yok durumlarında `SakinKoc` (`dusunceli` yüzü, ton etiketi ve mesaj satırı yok;
  yüklenirken ekran okuyucuya "Yükleniyor"). `packages/i18n/tr/kalemcik.json` `kalemcik.yukleniyor` eklendi.
- `cekirdek.test.ts` zip bombası: 70 MB sıkıştırma yerine bildirilen boyutu 70 MB yazılmış küçük arşiv (aynı sınır,
  sınırın altındaki gerçek boyutuyla okunabildiği de sınanır) ve 61 MB gerçek bomba (seviye 1, açık 60 sn zaman aşımı).
- Test: `yazma/api.test.ts` yeni blok, `kalemcik/kalemcik.test.tsx`. Doğrulama: typecheck, lint, tam `pnpm test` iki kez
  (web 637 geçti), build; 375/768/1440 axe 0 (yükleniyor ve proje yok).

## 14 Kasım 2026, atif-agi: sözleşme v1.5 atıf ağı maddeleri (atif-agi/v1-5-rejected)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` atif-agi madde 1 ve 3 (madde 2 zaten açılabilir durumdaydı).
Sözleşme, şema ve migration değişmedi; yeni bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `services/worker-py/citations/store.py`: `UPSERT_EDGE_SQL` ve `UPSERT_WORK_CITATION_SQL` yalnız
  `confirmed = false AND NOT rejected` satırlarını günceller; `PRUNE_EDGES_SQL` ve `PRUNE_WORK_CITATIONS_SQL`
  `rejected` satırları silmez. Başlıktaki "until a rejected column exists" notu kalktı. `SqlCitationStore(doctrine=True)`
  çağıran tarafın seçimidir; `job.py` mağaza fabrikasını dışarıdan aldığı için orada değişiklik gerekmedi.
- `apps/web/src/app/atif-agi/_sunucu/sql.ts`: kenar görünürlüğü `NOT e.rejected AND (e.confirmed OR
  e.confidence >= 0.90)`, eser okuması `NOT wc.rejected AND (wc.confirmed OR wc.confidence >= 0.90)`; eski
  `confidence > 0` ret biçimi kalktı (migration 0007 o satırları `rejected = true` yaptı). `42P01` yedeği
  zararsız olduğu için bırakıldı.
- Test: `services/worker-py/citations/tests/test_llm_job.py` (upsert ve budama koşulları), `sunucu.test.ts` (ağ ve
  kayıt ağı sorgularının `NOT rejected` taşıması).
- Açık: retde `rejected = true` yazacak editör ekranı kimliğin (yönlendirme kimlik madde 4); bu PR yalnız okuma ve
  yazma tarafını hazırlar. `packages/casuist/src/sql.ts` casuist ajanınındır, dokunulmadı.
## 14 Kasım 2026, casuist: reddedilen atıf kenarları sayılmaz (sözleşme v1.5, casuist/v1-5-reddedilen-kenarlar)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` casuist maddesi. Sözleşme, şema ve migration değişmedi; yeni
bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `packages/casuist/src/sql.ts`: `records()` içindeki `cited_by` alt sorgusu tek bir sabitten (`COUNTED_EDGE`)
  gelir: `NOT e.rejected AND ((e.confirmed AND e.confidence > 0) OR e.confidence >= 0.90::real)`. Ret v1.5'te
  `rejected` ile işaretlenir; `confidence > 0` eski ret biçimini (`confirmed = true, confidence = 0`) yazıcılar
  geçene kadar dışarıda tutar. casuist yollarında `citation_edges` ya da `work_citations` okuyan başka sorgu yok.
- Eşik düzeltmesi: `confidence` `real`; çıplak `0.90` float8 olarak karşılaştırıldığı için `0.9::real`
  (0.8999999761...) eşiğin altında kalıyordu ve güveni tam yayın eşiğinde (`citations/scoring.py`
  `PUBLISH_MIN = 0.90`) olan kenar sayılmıyordu. Eşik `0.90::real` ile karşılaştırılır; atif-agi'nin parametreli
  sorgusu (`$2` `real` olarak çıkarsanır, PGlite'ta denendi) zaten böyle davranıyordu; atıf ağı ekranı ile önem
  puanı artık eşikte aynı kenarları sayar.
- Test: `apps/web/src/app/ara/_sunucu/sql.test.ts` (PGlite, migration 0007 dahil) yedi kenarla sayımı sınar
  (0.99 ve 0.90 sayılır, onaylı 0.6 sayılır, onaysız 0.6 sayılmaz, `rejected` yüksek güveni ve onayı ezer, eski
  ret biçimi sayılmaz), sonra sayılan bir kenarı `rejected` yapıp sayının düştüğünü görür. `NOT e.rejected`
  geçici olarak kaldırılınca test 3 yerine 5 bulup kırıldı; `::real` olmadan 3 yerine 2 bulup kırıldı.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (casuist 107, web 645/1 skip,
  worker-node 113, tümü geçti), `pnpm build`.
- Açık: `/v1/records/{id}/versions` `planlandi` (bu PR'da yazılmadı). Doktrin kayıtlarının önem puanı hâlâ
  `openalex_cited_by`'dan gelir; `work_citations` sayımı istenirse ayrı iş.
## 14 Kasım 2026, odeme: sözleşme v1.5 temizliği ve ön bilgilendirme alanları (odeme/v1-5-temizlik)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` odeme maddesi 1 ve `docs/istekler/hukuk-uyum-p5-tutarlilik.md`
madde 4 (ilk alt madde). Sözleşme, şema, migration ve bağımlılık değişmedi.
- `apps/worker-node/src/billing/jobs.ts`: çağrılmayan `enqueueDailyBillingSql` kaldırıldı (testi yoktu, depoda başka
  kullanan yok). Günlük zamanlama `src/handlers.ts` `dailyBillingTick` içinde zaten `enqueueJob(..., { once: true,
  dedupeKey: '<tür>:<UTC gün>' })` ile; `test/runner.test.ts` "does not queue a finished day again after a restart"
  `done` satırından sonra yeniden kuyruğa almadığını sınıyor.
- `packages/ledger/src/billing/contract-doc.ts`: `DOC_FIELDS['on-bilgilendirme']` ve `orderFields` içinden
  `IOS_SURUM` çıktı (metin 2026-11-12.1 sürümünde bu alan yok).
- `packages/ledger/test/billing/contract-doc.test.ts`: üç sipariş metninin ön bilgisi `LegalFrontMatter` ile okunur;
  `DOC_FIELDS[slug]` ön bilgideki `pdf_fields` ile birebir aynı, her alan gövdede yer tutucu ve gövdedeki her sipariş
  yer tutucusu (şirket alanları `KEP`, `TELEFON` dışında) listede. `orderFields` paket ve tarihsel yıllık plan için
  bütün alanları doldurur; ön bilgilendirme formunda açık kalan tek alan `KEP`. Eski liste ile iki test kırılıyor
  (elle denendi).
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (ledger 174, worker-node 113, web 644 ve
  1 atlanan), `pnpm build` geçti.
- Açık: hukuk-uyum isteği madde 4 ikinci alt madde (hesap sayfasında iade talebi bağlantısı, review.md P8 madde 3)
  bu PR'da yapılmadı; hesap sayfası kimliğin yoludur, bağlantı eklenince hukuk-uyum metni günceller.

## 13 Kasım 2026, on-yuz: hukuki ön bilgi listeleri ve topluluk belgesinin kaldırılması (on-yuz/p5-hukuki-on-bilgi)

docs/istekler/hukuk-uyum-p5-tutarlilik.md madde 1 ve 2.
- `apps/web/src/app/(kabuk)/_hukuki/md.ts` `onBilgi` YAML akış dizisini (`pdf_fields: [A, B]`, tırnaklı öğe, boş
  `[]`) ve blok dizisini (`key:` ardından `- A`) okur; iç içe dizi ve köşeli parantezli başlık dize kalır. Test her
  hukuki metnin ön bilgisini `yaml` paketinin sonucuyla karşılaştırır.
- Sahiplik dışı (istek gereği aynı PR, hukuk-uyum): `on-bilgilendirme.md`, `mesafeli-satis.md`, `abonelik.md` ön
  bilgisine istekteki listelerle `pdf: true` ve `pdf_fields`; sürüm değişmedi (gövde değişmedi). on-bilgilendirme
  "Gösterim kuralları" notundaki `{{...}}` yayın kapısında açık yer tutucu sayılıyordu ve metin hiç yayımlanamazdı;
  "Ön bilgideki `pdf_fields` alanları" diye yazıldı. content/hukuki/README.md buna göre güncellendi.
- `_hukuki/test/odeme-gosterimi.test.tsx`: gerçek dosyalar ve ledger `orderFields` ile; taslakken ödeme adımı kapalı,
  yalnız `status: yayinda` ve `{{KEP}}` doldurulunca `buildCheckoutLegalPresentation` iki metni doldurur, `CheckoutStep`
  alıcı ve ürünle gösterir, `createLegalSnapshot` (paket ve yıllık abonelik) geçer. Metinlerle ödeme arasında yalnız
  yayın onayı ve KEP kaldı.
- Topluluk (ADR-0031): `content/hukuki/tr/topluluk.md` silindi; `rotalar.ts` `hukukiBelgeler`, `ortak.json`
  `hukuki.belge.topluluk`, `tests/e2e/adresler.ts` `HUKUKI_TR` (kalite-guvenlik, istek gereği) çıkarıldı.
  `hukuki/[belge]/page.tsx` bilinmeyen ve kaldırılan slug için 404 verir (sayfa dinamik olduğundan
  `dynamicParams = false` tek başına engellemiyordu; `/hukuki/yok` 200 "hazırlanıyor" dönüyordu).
- Doğrulama: typecheck, lint, check:text, `pnpm test` (web 644), build; yerel üretimde `/hukuki/topluluk` 404,
  e2e 99/99; 16 sayfa 375/768/1440 axe 0, taşma 0 (`docs/tasarim/ekran/hukuki-*`, `ana-sayfa-*`, `axe-sonuc.json`).
- Açık: odeme `DOC_FIELDS['on-bilgilendirme']` içinde `IOS_SURUM` (istek madde 4); `apps/web/test/seo.test.ts`
  taslak listesinde `topluluk` zararsız kaldı (orkestra).
## 13 Kasım 2026, kimlik: bildirim teslim kaydı ve step-up sözleşme şeması (sözleşme v1.5)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` kimlik madde 1 ve 2. Sözleşme, şema ve migration değişmedi;
yeni bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `apps/worker-node/src/notify/dispatch.ts`: kuyruk işleyicisi iş kimliğini `dispatch(deps, payload, job)`'a verir.
  Her denemenin başında `deliveredTargetsSql`, her başarılı teslimden hemen sonra `recordDeliverySql`; e-posta
  hedefi `'email'`, push hedefi uç noktanın ya da APNs jetonunun HMAC-SHA256'sı (64 küçük harf onaltılık, ham değer
  yazılmaz). Kayıtlı hedef aynı işin yeniden denemesinde gönderilmez. Bir push hatası artık işi
  `PushDeliveryError` ile düşürür ve yeniden deneme yalnız eksik hedefleri gönderir; son denemede iş
  `push_partial` ile biter. Hiçbir şey gitmediyse iş eskisi gibi hata verir.
- Sessiz saat ertelemesi ham `insert into jobs` yerine `enqueueJob(db, 'notify.send', payload, { once: true,
  dedupeKey: 'notify.send:defer:<iş>', runAfter })`: ertelemenin kendisi yeniden denenirse ikinci iş açılmaz. Bir
  şeyi zaten teslim etmiş bir yeniden deneme ertelenmez (yeni iş yeni teslim kaydı açardı), kalan hedefleri hemen
  gönderir.
- `apps/worker-node/src/notify/target-hash.ts`: anahtar `BETTER_AUTH_SECRET`'tan HKDF-SHA256 (bilgi etiketi
  `notification-target`); `NotifyDeps.targetKey` ile verilebilir, verilmezse ortamdan türetilir (`main.ts`
  değişmedi). Anahtar yoksa push en iyi çabayla gönderilir ve kaydedilmez; e-posta yine kaydedilir.
- `apps/web/src/server/auth/handlers.ts` `stepUpConfirm`: `EduVerificationConfirm` yerine sözleşmedeki
  `StepUpConfirmInput`; rota `apps/web/src/app/api/auth/step-up/confirm/route.ts` zaten sözleşmedeki
  `/auth/step-up/confirm` yolundaydı.
- Test: `apps/worker-node/src/notify/__tests__/idempotency.test.ts` (PGlite, migration 0007 dahil): özet biçimi,
  ham değerin tabloya yazılmaması, aynı işin ikinci çalışmasında sıfır teslim, push hatasında yalnız eksik hedefin
  yeniden gönderimi, son denemede `push_partial`, anahtarsız durum, ertelemenin tek iş açması, teslim etmiş
  denemenin ertelenmemesi ve gerçek tüketiciyle (`createConsumer`) uçtan uca yeniden deneme.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (worker-node 112, web 628, tümü geçti),
  `pnpm build`.
- Açık: yönlendirme madde 3 (`planlandi` uçlar: bildirim tercihleri, Web Push ve APNs kayıt uçları) ve madde 4
  (atıf kuyruğu editör ekranı) bu PR'da yapılmadı.
## 13 Kasım 2026, yazma: sözleşme v1.5 yazma maddeleri (yazma/v1-5-yazma-maddeleri)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` "yazma" bölümünün 1 ve 2. maddeleri; 3. madde (rota dosyalarında
sözleşme şemaları) ve 4. madde bu PR'da yapılmadı.
- `apps/worker-node/src/kalemcik/gunluk.ts` `kalemcikTick`: `enqueueKalemcikDailySql` kalktı;
  `enqueueJob(db, 'kalemcik.daily', {}, { once: true, dedupeKey: 'kalemcik.daily:' + gun, runAfter: gunBasi08(gun) })`
  (`gunBasi08` İstanbul 08.00, `+03:00`). Yeniden başlatılan süreç bitmiş günü yeniden kuyruğa koymaz (`done` satırı
  için test var). `KUYRUK_SQL` (`notify.send`) değişmedi: koşullu UPDATE korur.
- `apps/web/src/app/yazma/_sunucu/kurallar.ts` `isOlustur`: `rules.extract` satırına `maxAttempts: 1`; bayat kilit
  temizliği artık satırı `dead` yapar. `api.test.ts` satırın `max_attempts = 1` olduğunu sınar.
- Kalemcik "nötr ton" sorusu cevaplandı: ayrı yüz gerekmez (`docs/istekler/yazma-kalemcik-notr-ton.md`); plan 12/8
  metninin düzeltilmesi mimar ve orkestraya bırakıldı.
- Doğrulama: `pnpm typecheck`, `lint`, `test` (worker-node 103, web 628), `build` geçti.
## 13 Kasım 2026, seo: küçük işler (codex/seo-kucuk-isler)

Yeni bağımlılık yok; contracts ve db değişmedi. `twitter.card` `summary_large_image` (OG görseli `app/opengraph-image.tsx`'ten gelir;
`docs/istekler/seo-p6-og-gorseli.md` kapandı). `acikModuller` ve `modulAcik` silindi; `(seo)/_seo/adresler.ts`, `rehberler/_bilesen/metin.ts`,
`rehberler/kontrol-listesi/page.tsx`, ilgili testler, `apps/web/test/seo.test.ts` ve `kabuk.test.tsx` `moduller`e geçti
(`docs/istekler/on-yuz-acik-modul-listesi.md` kapandı). Sahiplik dışı dokunuş: `rotalar.ts` ve `kabuk.test.tsx` (on-yuz),
`rehberler/**` (icerik), `apps/web/test/seo.test.ts` (orkestra); görevlendirme orkestradan.

## 12 Kasım 2026, mimar: sözleşme v1.5, P1 adım A (codex/p1-sozlesme-v1-5)

review.md P1 madde 4, 5 (doğrulama), 6 (ekleme) ve 8; plan `docs/istekler/mimar-p1-sozlesme-temizligi.md` adım A.
ADR-0035 "Önerildi, Tarık onayı bekliyor"; sözleşme ve şema 1.5.0; migration
`0007_v1_5_jobs_citations_deliveries.sql` yalnız ekler. Adım B (kaldırıcı, ADR-0036, migration 0008) yapılmadı. Canlı
veri tabanına hiçbir şey uygulanmadı. Yeni bağımlılık yok.
- İş kuyruğu (`packages/db/src/jobs.ts`, `services/worker-py/core/jobs.py`): bitirme, hata, gömme ve kalp atışı
  işçi kimliğini eşler ve `RETURNING` döndürür (kilit kaybı loglanır, iş yeni sahibinde kalır); bayat kilit deneme
  sınırında `dead`; kalp atışı 300 sn; `pruneJobsSql` (done 14, failed/dead 90 gün, 5000'lik batch);
  `enqueueOnceSql` ve doğrulayan `enqueueJob`. Python SQL'i test içinde TypeScript metniyle karşılaştırılır.
- İş yükleri: `parseJobPayload`, beş yerel şema sözleşmede, `jobPayloadExempt`; worker-node ve worker-py tüketicileri
  geçersiz yükü çalıştırmadan `invalid payload` ile gömer, yük loglanmaz. Ortak fikstür
  `packages/contracts/test/fixtures/job-payloads.json` hem zod hem Python testinde.
- OpenAPI: `x-kazuist-uygulama` (`planlandi` 11, `kaldirilacak` 11 Kampüs yolu); dört yeni uç
  (`/v1/templates/check`, `/v1/templates/rules/{id}`, `/v1/writing-projects/ayarlar`, `/auth/step-up/confirm`) ve
  `extractTemplateRules.kind`; `rotalar.test.ts` yol, ek ve HTTP yöntemi eşleşmesini sınar. TS istemcisi yeniden
  üretildi; Swift istemcisi üretilmedi (`apps/ios` yok).
- Şema: `works.work_key`, `work_citations`, `citation_edges.rejected` (eski ret biçimi işaretlendi), ifade
  dizinleri, `sources_raw_record_idx`, `jobs_dedupe_idx`, `jobs_finished_idx`, `notification_deliveries`.
- Sahiplik dışı dokunuşlar (plan adım A gereği): orkestra `apps/worker-node/src/{queue,runner,handlers}.ts` ve
  `test/{queue,runner,billing}.test.ts`; anonimlestirme `anonymizer/tests/test_anonymizer.py` içinde tüketici
  testinin kayıt kimliği UUID oldu. yazma ve odeme dosyalarına dokunulmadı; yönlendirme
  `docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md`.
- `.env.example`: `KAZUIST_EMBED_BACKEND`, `_DIR`, `_THREADS`, `_QUANTIZED`, `KAZUIST_TEST_DATABASE_URL`.
- Doğrulama: `pnpm check:text`, `typecheck`, `lint`, `test` (contracts 148, db 54, worker-node 102, web 598, tüm
  paketler geçti), `build`, Redocly lint temiz, enjeksiyon seti 60/60; `uv run pytest` 308 geçti 10 atlandı.
  Geçici yerel PostgreSQL 18.6 ve pgvector kümesinde (sonra durduruldu): v1.4 verisi üstüne 0007 ve ikinci kez
  boş geçiş, ret işaretlemesi, ifade dizini planı, iki bağlantıda `enqueueOnce` yarışı (10/10 tek satır), iki
  işçide SKIP LOCKED çakışmasızlığı, kilit kaybı, temizlik ve cascade; Python tüketicisinde psycopg ile kalp atışı,
  gömme ve kilit kaybı; `nlp/tests/test_pg.py` 4/4.
- Açık: ADR-0035 onayı; ADR-0036 ve Tarık'ın yıkıcı migration onayı; `live.fetch` kapsam kararı; yönlendirme
  dosyasındaki sahip işleri (yazma `kalemcikTick`, kimlik teslim kaydı, atif-agi ve casuist `rejected`).
## 12 Kasım 2026, hukuk-uyum: P5 metinler, KVKK envanteri, protokoller, Midjourney değerlendirmesi

review.md P5 ve ADR-0034 ek görevi. Yalnız `content/hukuki/**`, `docs/kvkk/**`, `docs/protokol/**`, `docs/ip/**`,
orkestranın verdiği `docs/hukuk/**` ve istek dosyası değişti; kod, sözleşme ve şema değişmedi. Bütün metinler
`status: taslak`; yayım kararı verilmedi.
- Metinler (sürüm 2026-11-12.1): barındırma Hetzner AB'ye göre (uyari, aydinlatma, gizlilik); Kampüs çıktı (aydinlatma,
  kosullar, kaldirma; topluluk "uygulanmaz" notuna indi); ADR-0029 (kosullar 5, iade-ve-kredi 6, on-bilgilendirme,
  mesafeli-satis); koda göre düzeltmeler: kodda olmayan virüs taraması ve koyu tema iddiası çıktı, localStorage
  anahtarları (pratik, rehber) çerez politikasına girdi, kaldırma ve hesapsız KVKK başvurusu e-posta yoluna çekildi,
  18 yaş beyanı koşul onayına bağlandı. on-bilgilendirme'ye 6563 m.3/1 bilgileri eklendi, `IOS_SURUM` çıktı.
  abonelik `consent_kind` v1.1 değerine (abonelik_sozlesmesi) çekildi. Ürünle eşleşme tablosu `content/hukuki/README.md`.
- Birincil kaynaktan okunanlar (12 Kasım): KVKK m.5, 6, 9, 10, 11, 13, 14, 16 (mevzuat.gov.tr); Yurt Dışına Aktarım
  Yönetmeliği RG 10/7/2024, 32598 m.14-16 (resmigazete.gov.tr); Kurul'un dört standart sözleşmesi ve bildirim modülü
  (kvkk.gov.tr); VERBİS istisna eşikleri (kvkk.gov.tr/Icerik/8388); 6563 m.2, 3, 4; FSEK m.1/B, 4, 6, 8, 15, 16, 18,
  21, 31, 48-58, ek m.8; TTK m.82; VUK m.253; Ticari İletiler Yön. RG 30998 değişikliği; Hetzner veri koruma ve sertifika
  sayfaları. Kapanan işaretler: gizlilik saklama süresi, protokol README FSEK ek m.8, denge testi FSEK m.31.
- `docs/kvkk/envanter.md` (29 satır, önerilen saklama süreleriyle), `aktarim.md` (Hetzner Standart Sözleşme 2 ve risk),
  `yukumlulukler.md` (ETBİS, VERBİS, İYS, e-Arşiv ve diğerleri), `app-privacy-taslak.md`, `denge-testi.md` (T4, T5).
- Protokol yazıları: altısı da 2026-11-12; "Türkiye'deki sunucularımızda anonimleştirilir" cümlesi çıktı (T4'e bağlı
  işaret), FSEK m.31 ve ek m.8 çerçevesi, 0,5 istek/sn, onaylı adres ve e-posta.
- `docs/hukuk/midjourney-telif.md`: Midjourney koşulları 403 döndü, aşılmadı, "doğrulanmadı"; FSEK m.1/B, 8, 18, 52, 55,
  56 üzerinden seçenek B riskleri, uygulama kuralları, çizer sözleşmesi madde listesi. `docs/ip/arka-plan-kaydi.md`
  görsel varlık tablosu.
- Önemli bulgu: Hetzner'ın sayfası bireysel sözleşme imzalamadığını söylüyor; KVKK Standart Sözleşme 2 iki tarafın
  imzasını istiyor. İmza alınamazsa ADR-0033 ön koşul 1 karşılanamaz (aktarim.md "Hetzner: durum ve risk").
- Önemli bulgu: ödeme adımı `pdf` ve `pdf_fields` ön bilgisini şart koşuyor, on-yuz ayrıştırıcısı liste okuyamıyor;
  bu yüzden ödeme adımı hiçbir ortamda hukuki metin gösteremiyor. İstek: `docs/istekler/hukuk-uyum-p5-tutarlilik.md`.
- Doğrulanmayan: bu oturumda kabuk aracı yoktu; `pnpm test`, `pnpm check:text`, `pnpm build` çalıştırılmadı, dal
  itilmedi ve PR açılmadı. Ön bilgi alanları ve yer tutucu adları test beklentilerine göre elle denetlendi.
- Kesin sonraki adım: orkestra testleri çalıştırıp dalı iter ve PR açar; ardından on-yuz madde 1, Tarık'ın Hetzner'a
  Standart Sözleşme 2 sorusu.
## 12 Kasım 2026, on-yuz: P4 görsel varlıklar (on-yuz/p4-gorsel-varliklar)

review.md P4, ADR-0034 seçenek B. YZ görseli ürüne girmedi; Midjourney'e erişilmedi. Yeni bağımlılık yok
(sharp ve fontTools yalnız yerel üretim betiklerinde, depo bağımlılığı değil); contracts ve db değişmedi.
- `docs/tasarim/gorsel-istemleri.md`: her varlık için yol, ölçü, biçim, dosya sınırı, kabul ölçütü, son dosyayı kimin
  çizeceği, yalnız taslak için Midjourney istemi (sanatçı adı, tanınmış karakter, marka yok) ve kayıt tablosu.
  Avatar (8 meslek x a, b, n), Kalemcik (4 ifade ve ton eşlemesi) ve 20 HMGS konu piktogramı için çizer brifingi.
- Marka işareti `apps/web/src/app/icon.svg`: kâğıt üzerinde mürekkep K, ince ayraç ve aynı hizada lâl şerh (kenar
  şerhinin en küçük hâli), 32 birimlik ızgarada elle yazılmış koordinatlar. `docs/tasarim/simge-uret.mjs` bundan
  `favicon.ico` (16, 32, 48; RGBA, Turbopack paletli girdiyi çözemiyor), `apple-icon.png` (180, yüzde 88),
  `public/icon-192.png`, `icon-512.png` ve `icon-maskable-512.png` (yüzde 80 güvenli alan) üretir; çıktı
  belirleyicidir. Önizleme: `docs/tasarim/gorsel/simgeler-onizleme.png`.
- `apps/web/src/app/manifest.ts` (ad, amaç, `tr`, standalone, kâğıt rengi) ve `opengraph-image.tsx` (statik, 1200 x
  630, yalnız tipografi). Çizim ve sabitler `apps/web/src/app/(kabuk)/_marka/`; renkler `marka.ts`'te belirteçlere
  bağlı (test). next/og WOFF2 okumadığı için sitenin alt kümeli yazı tiplerinin sabit ağırlıklı TTF kopyaları
  `_marka/yazi/` altında (OFL, NOTICE.txt; yeniden üretim `docs/tasarim/og-yazi.py`). Önizleme:
  `docs/tasarim/gorsel/paylasim-karti.png`.
- i18n: `ortak.paylasim.kartAlt` ve `ortak.paylasim.alanAdi`.
- Doğrulama: `marka.test.ts` 21 test; web 619 geçti 1 atlandı, bütün paket testleri, typecheck, lint, check:text,
  build yeşil. Yerel üretimde simge, apple, manifest bağlantıları ve `og:image` 8 sayfada görüldü. 16 sayfa x 375,
  768, 1440 px ekran görüntüsü ve axe: ihlal 0, yatay taşma 0 (sayfa arayüzü değişmediği için görüntüler depoya
  alınmadı). e2e 97 geçti, 3 hesap akışı yerelde veritabanı olmadığı için düştü (`/api/health` 503 degraded).
- Sahiplik: `app/icon.svg`, `favicon.ico`, `apple-icon.png`, `manifest.ts`, `opengraph-image.tsx`, `public/icon-*`
  on-yuz satırında değil; orkestranın görevlendirmesiyle yazıldı. İstekler (seo `twitter.card`, hukuk-uyum IP kaydı ve
  işaret tescili, `public/avatar` sahibi, Kalemcik nötr yüzü): `docs/istekler/on-yuz-p4-gorsel-varliklar.md`.
## 12 Kasım 2026, on-yuz: kabukta oturum ve "yakında" düzeneğinin kaldırılması (codex/on-yuz-kabuk-oturum)

İstek `docs/istekler/kimlik-p7-kabuk-oturum.md` karşılandı; ADR-0033 ve review.md T2 gereği kapalı modül kalmadı.
Yeni bağımlılık yok; `packages/contracts`, `packages/db` ve kök `layout.tsx` değişmedi.
- Hedefim alanı (`apps/web/src/app/(kabuk)/_kabuk/`): `oturum.ts` (tip ve saf görünüm), `oturumYukle.ts` (sunucu:
  `pageSession`, `getMe`, `findProfession`; çerez yoksa veri tabanına gidilmez, silinmiş hesap misafir, profil
  okunamazsa ad ve hedefsiz oturum ve yalnız hata sınıfı loglanır), `HedefimBagi.tsx`, `Hedefim.tsx` (async).
  Misafir: "Hedefim / Giriş yapın", `/giris`. Oturum: ad (yoksa "Hesabım") ve hedef meslek, `/hesap`; hedef
  seçilmemişse "Meslek seçin", `/hesap/hedef`. Avatar halkası adın ilk harfini Türkçe büyük harfle gösterir;
  çizim avatarlar (ADR-0034) gelince `avatar` alanı kullanılır. Dar ekranda metin görsel olarak gizlenir ama
  bağlantının erişilebilir adında kalır (eskiden `display: none` idi).
- `Kabuk` isteğe bağlı `oturum` alır; verilmezse alan oturumu kendisi okur. Layout istek başına çalıştığı için
  ek önbellek yok.
- "Yakında" düzeneği: `ModulBagi.tsx`, `OrnekSoru.tsx`, `.modul-kapali` stilleri ve `gezinme.yakinda` silindi;
  sekmeler, alt bilgi, ana sayfa modül listesi, örnek sorular ve 404 doğrudan bağlantı verir. `acikModuller` ve
  `modulAcik` artık `moduller`'den türetilir ve `@deprecated`; seo, icerik ve orkestra çağıranları
  `docs/istekler/on-yuz-acik-modul-listesi.md` ile istendi, onlar birleşince silinecek.
- i18n `ortak.json`: `hedefim.girisYapin`, `hedefim.girisAciklama`, `hedefim.hesapAciklama` eklendi.
- Doğrulama: web 47 dosya 608 test (607 geçti, 1 atlandı; yeni `kabuk.test.tsx` 9 test), i18n 22, typecheck,
  lint, check:text, build. Yerel PostgreSQL 18 ve üretim derlemesiyle misafir, hedefli ve hedefsiz oturumda
  375/768/1440: 21 sayfa ve genişlikte axe ihlali 0, yatay taşma 0 (`docs/tasarim/ekran/kabuk-*.png`,
  `kabuk-oturum-axe.json`, betik `docs/tasarim/kabuk-oturum-ekran.mjs`). e2e 100/100 aynı sunucuya karşı.
- Güncellenmedi: `docs/tasarim/ekran/ana-sayfa-*.png` gibi eski ekranlar Hedefim'de hâlâ "Meslek seçin" gösterir
  (T11 kararı beklendiği için 48 PNG yeniden üretilmedi). Lighthouse çalıştırılmadı.

## 12 Kasım 2026, casuist: arama dizini, embed.chunks tüketicisi (codex/p9-arama-dizini)

review.md P9 madde 1 ve 8. Üretimde `chunks` tablosunu yazan bir tüketici yoktu; tam metin ve vektör araması boş
kalıyordu. Yeni bağımlılık yok (ONNX yolu mevcut `ner-runtime` ekstrasını kullanır); `packages/contracts` ve
`packages/db` değişmedi, şema değişikliği gerekmedi. İstekler: `docs/istekler/casuist-p9-arama-dizini.md`.
- `services/worker-py/nlp/`: `job.py` (`embed.chunks` işleyicisi, katı `{recordId}` yükü), `store.py` (ADR-0026
  tüketici kuralı: `masked_text` ve `md5` okunur, gömme işlem dışında yapılır, yazma işleminde kayıt `FOR SHARE`
  kilitlenir, özet aynıysa eski parçalar silinip yenileri yazılır, değiştiyse iş `StaleMaskedText` ile düşer ve
  yeniden deneme yeni metni okur; `masked_text` NULL ya da kayıt yoksa hiçbir şey yazılmaz). Ham `records.text`
  hiçbir sorguda yok. `jobs.result` yalnız sayılar ve model kimliği taşır; loglar yalnız sınıf adı ve neden kodu.
- `chunk.py`: `packages/casuist/src/chunk.ts` birebir aktarımı (UTF-16 kod birimi ofsetleri, ECMAScript boşluk
  kümesi, kısaltma kuralı). Ortak altın dosya `packages/casuist/fixtures/parcalar.json` (75 fikstür kaydı, 202
  parça ve 8 uç örnek) hem TS (`test/chunk-parity.test.ts`) hem Python testinde denetlenir. Ek olarak 6000 rastgele
  metinle TS ve Python çıktısı yerelde karşılaştırıldı: 0 fark.
- `embedder.py`: tek arayüz arkasında plan 5.3'teki üç aday (BGE-M3, multilingual-e5-large, Qwen3-Embedding-0.6B),
  ONNX Runtime ile CPU'da, model `KAZUIST_EMBED_DIR/<anahtar>` altından. eval/embed ölçümü yapılmadığı için
  varsayılan kapalıdır; anahtar yoksa, model, çalışma zamanı ya da 1024 boyut tutmazsa worker durmaz, vektörsüz
  yazar ve nedeni loglar. Model kimliği `<anahtar>@<revizyon7>`, web tarafındaki `KAZUIST_EMBED_MODEL` ile aynı
  olmalı. Dış sağlayıcıya hiçbir çağrı yok.
- `reconcile.py`: `python -m nlp.reconcile` ADR-0026 uzlaştırma işi; parçası olmayan ya da yapılandırılmış modelin
  vektörünü taşımayan servis edilebilir kayıtları, etkin işi yoksa kuyruğa atar. Zamanlayıcı altyapi isteğinde.
- Kayıt: `services/worker-py/core/main.py` `build_handlers` içine yalnız iki satır (orkestra izniyle; dosya
  veri-toplamanın). `tests/test_main.py` (mimar) kayıtlı iş kümesini sabitleyen tek satıra `EMBED_CHUNKS` eklendi,
  aksi halde CI kırılıyordu.
- `seedCorpus` paket kökünden çıktı; yeni giriş `@kazuist/casuist/testing` (yalnız test ve yerel). `./fixture`
  seçilmedi, çünkü üretim kodu (`ara/_sunucu/baglam.ts`) fikstür kipinde onu dinamik yüklüyor. Çağıranlar
  (`ara/_sunucu/sql.test.ts`, `kaydettiklerim/_sunucu/kutuphane.test.ts`) güncellendi; `test/entries.test.ts`
  kökün `seedCorpus` dışa aktarmadığını denetler.
- Doğrulama: worker-py 235 geçti 3 atlandı (CI ile aynı); `uv run pytest nlp/tests` 44 geçti 7 atlandı; numpy ve
  gerçek PostgreSQL 18 ile 51/51. PostgreSQL 18 ve pgvector üzerinde 7 göçle uçtan uca: 75 fikstür kaydı yalnız
  `masked_text` ile eklendi (tetikleyici 75 iş açtı), üretim kaydıyla (`build_handlers`) çalışan worker 75 işi
  bitirdi, 202 parça yazıldı (hepsinde `tsv`, vektör 0), ham metin parçalarda yok, `sqlBackend` araması sonuç ve
  pasaj döndürdü, `degraded: ['vektor']`; Python parçaları 75 kaydın hepsinde `chunkText` ile aynı. casuist 107
  test, tüm Node testleri, typecheck, lint, check:text ve build geçti.
- Ölçülmedi: arama kalitesi gerçek corpus ve gerçek gömme modeliyle (P9 madde 9); hiçbir aday modelle
  çalıştırılmadı, ONNX yolu yalnız küçük yapay bir grafikle yerelde denendi.
- Açık: `pyproject.toml` `testpaths` içine `nlp/tests` (orkestra); sorgu gömmesi HTTP servisi; eval/embed seti ve
  ölçümü; uzlaştırma zamanlayıcısı ve model birimi (altyapi); `.env.example` değişkenleri (mimar).
## 12 Kasım 2026, kimlik: hesap arayüzü ve bildirim düzeltmeleri (codex/p7-hesap-arayuzu)

review.md P7 madde 1, 2, 3 ve 5. Yönetim paneli (madde 4) bu PR'da yok. Yeni bağımlılık yok (passkey için mevcut
`better-auth/client` ve `@better-auth/passkey/client`); `packages/contracts` ve `packages/db` değişmedi.
- Oturum denetimi: `server/auth/page-session.ts` (`requirePageSession`, `safeNext`). `/hesap/**` oturumsuzsa
  `/giris?sonra=<yol>`'a yönlenir; `sonra` yalnız site içi yol kabul eder (açık yönlendirme testli).
- `/hesap`: profil özeti, ad formu (PATCH /v1/me), güncel kullanım koşulları ve aydınlatma metni onaylanmadıysa rıza
  kutusu (`account-view.ts` `pendingConsents`; e-posta kodu, Google, Apple ve iOS ile açılan hesaplar da buradan
  onaylar), alt sayfalara bağlantılar, çıkış düğmesi. Alt sayfalar: `hedef` (PUT target-profession, meslek ve görünüm),
  `ogrenci` (edu.tr kodu, iki adım), `kvkk` (m.11 talep türü, açıklama, cevap kanalı, makbuz), `guvenlik` (yeni:
  passkey ekle ve kaldır, TOTP kurulumu, editör ve yönetici için `/api/auth/step-up/confirm` onayı), `verilerim`.
- `/giris`: parola, tek kullanımlık e-posta kodu, passkey; TOTP açık hesapta parola girişinden sonra ikinci adım.
  `/parola-sifirla` (yeni): e-posta kodu ve yeni parola. `auth.ts` `revokeSessionsOnPasswordReset: true`;
  `/email-otp/request-password-reset` dar kod sınırına eklendi.
- `/kayit`: zorunlu rıza kutusu; kayıttan sonra `POST /api/v1/me/consents` ile `kullanim_kosullari` ve
  `aydinlatma` satırları `content/hukuki` sürümüyle yazılır.
- Bildirim: `render()` Kalemcik referansında `renderKalemcikNotice` kullanır (push yine genel metin); `/kampus` yolları
  `/hesap`; APNs yalnız 410 ya da `BadDeviceToken`/`Unregistered` gerekçesiyle aboneliği siler; web-push ve APNs 10 sn
  zaman aşımı, APNs bağlantısı her yolda kapanır; push hatası artık e-postayı yinelemez (yalnız hiçbir kanal
  teslim edilmediyse iş yeniden denenir). Tam çözüm için istek: `docs/istekler/kimlik-p7-bildirim-idempotency.md`.
- yazma ajanının dosyasına tek dokunuş: `apps/worker-node/src/kalemcik/__tests__/kalemcik.test.ts` içindeki render
  beklentisi Kalemcik metnine göre güncellendi.
- İstekler: `kimlik-p7-kabuk-oturum.md` (on-yuz, Kabuk prop önerisi; Kabuk.tsx'e dokunulmadı),
  `kimlik-p7-e2e-riza.md` (kalite-guvenlik: `/kayit` e2e testi kutuyu işaretlemeli, şu an bu tek test kırmızı).
- Doğrulama: typecheck, lint, test (web 575, worker-node 96), check:text, build temiz. Yerel üretim derlemesinde
  27 sayfa ve genişlik için axe: kritik ve ciddi 0, orta ve düşük 0, yatay taşma 0; kayıt, rıza, hedef, KVKK,
  edu.tr, TOTP kurulumu, çıkış, parola ve TOTP ile giriş Playwright ile uçtan uca geçti. Gerçek passkey töreni
  (donanım doğrulayıcı) ve gerçek SMTP ile kod teslimi denenmedi.
- Kesin sonraki adım: kalite-guvenlik `hesap.spec.ts`'e kutu satırını ekler; on-yuz Kabuk oturum prop'unu bağlar;
  mimar teslim tablosunu karara bağlar; ardından P7 madde 4 (yönetim paneli).
## 12 Kasım 2026, seo: görünürlüğün ortama bağlanması, robots, site haritası, llms.txt (codex/p6-seo)

Yeni bağımlılık yok; `packages/contracts` ve `packages/db` değişmedi. P6 madde 1 ve 2 kapandı; madde 3 ve 4 bu PR'da yok.
- Ortam kararı `apps/web/src/app/(seo)/_seo/ortam.ts`: yalnız `NODE_ENV=production`, `KAZUIST_ENV=production` ve `APP_URL` https `kazuist.com`
  birlikte olduğunda index; eksik, staging, geliştirme, www veya http her durumda `noindex, nofollow`. Varsayılan kapalı.
- `layout.tsx` (orkestra yolu) yalnız iki satır: `temelMetadata()` içe aktarımı ve eski `title` ile `robots` satırlarının yerine
  `...temelMetadata()`. Kaynak `(seo)/_seo/metadata.ts`: metadataBase (APP_URL), `title: { template: '%s | Kazuist', default: 'Kazuist' }`,
  robots, `alternates.canonical: './'` (her sayfa kendi adresine; sorgu dizgisiz), OpenGraph `website`, `tr_TR`, görsel yok. Plan
  dışı iki küçük ek (canonical ve OpenGraph) aynı nesnede olduğu için layout'a ayrı satır eklenmedi. hreflang yok (ADR-0032).
- `robots.ts`: üretim dışında `Disallow: /` ve site haritası satırı yok. Üretimde `*` ve arama botları (OAI-SearchBot, ChatGPT-User,
  PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot, Bingbot) serbest; eğitim botları (GPTBot, ClaudeBot,
  Google-Extended, CCBot) `/mevzuat/`, `/karar/`, `/kurum-karari/`, `/makale/` altında engelli; herkese `/api/`, `/yonetim`, `/odeme`
  kapalı (botun kendi grubu `*` grubunu geçersiz kıldığı için her grupta yinelenir). `force-dynamic`: ortam değişkeni çalışma zamanında okunur.
- `sitemap.ts`: `rotalar.ts` `acikModuller` ile tutarlı (yalnız `/kaydettiklerim` bilerek dışarıda, kişisel ve noindex), açık modüllerin genel
  alt sayfaları, `/`, `/fiyatlar`, `/tespit`, `/hukuki` ve üretimde yayımlanan hukuki metinler (taslak olan listelenmez; Casuist arşiv
  sürümü duran beş belge listelenir), `/tr` ve beş alt sayfa. İngilizce adres, `/eski` ve `/tr/hukuki/*` (301 kaynağı) yok. `lastModified`
  yalnız gerçek tarih biliniyorsa (yayınlanmış hukuki sürüm tarihi) yazılır; uydurma `new Date()` yok. Dinamik kayıt sayfaları ve dergi profilleri
  Dalga 2 parçalı site haritasına kaldı.
- `public/llms.txt`: Türkçe, plan 1 ve 13'ten ürün tanımı, kaynak politikası, bot politikası; rakam ve güncellik iddiası yok; yalnız var olan sayfalara bağlantı.
- Testler `apps/web/test/seo.test.ts` (23): noindex matrisi, robots grupları, sitemap'te kaldırılan 11 İngilizce adresin yokluğu, listedeki her yolun
  uygulamada sayfası olduğu, llms.txt bağlantılarının varlığı.
- Elle görülen (yerel üretim derlemesi, iki ortam): üretimde `index, follow`, canonical `https://kazuist.com/ara`, tam robots ve 28 adreslik site
  haritası; ortam değişkensiz `noindex, nofollow`, `Disallow: /`; `/en` ve `/problem` 404; `/llms.txt` 200.
- Bilinen kusur: sayfaların elle yazdığı "| Kazuist" ekiyle sekme başlığı "Başlık | Kazuist | Kazuist" oluyor (24 dosya, başka ajanların yolu);
  liste ve düzeltme biçimi `docs/istekler/seo-p6-baslik-sablonu.md`. OpenGraph görseli yok: `docs/istekler/seo-p6-og-gorseli.md`.
- Doğrulanmayan: gerçek alan adında robots ve bot `curl -A` denemeleri, WebSEORobot ve WebSCHEMArobot (DNS ve yayın sonrası), staging'de
  `X-Robots-Tag` başlığı (next.config orkestranın; yalnız meta ve robots.txt var).
- Kesin sonraki adım: sayfa sahipleri çift eki kaldırır; ardından P6 madde 3 (kayıt sayfası rotası, citation_*, Article/Legislation JSON-LD, Organization,
  WebSite ve SearchAction, BreadcrumbList) ve Search Console adım listesi.
## 12 Kasım 2026, mimar: P1 kararlarının yazımı ve sözleşme temizliği planı (codex/p1-mimar-kararlar)

review.md P1 madde 1, 2, 3 ve 10 yapıldı; madde 4-9 yalnız plan olarak yazıldı. `packages/contracts` ve `packages/db`
değişmedi; yeni bağımlılık yok.
- ADR-0033 (Önerildi): staging yok, Hetzner'da tek sunucu, Coolify, tek seferde yayın; sunucu boyutu seçilmedi
  (CAX21 Arm64 8 GB ile 16 GB x86 arası, Hetzner sayfasından 12 Kasım'da okundu), imajlar GitHub Actions'ta
  amd64 ve arm64 için derlenip çekilir. ADR-0030 madde 3-4'ü değiştirir; ADR-0030'un KVKK m.9 koşulu değişmez ve
  yayının ön koşulu olarak yazıldı. K-11 ile ilişki açık soru (T4), karar verilmedi.
- ADR-0034 (Önerildi, karar yok): görsellerde YZ serbest, YZ yalnız taslak ve son hali çizer, mevcut kural. Midjourney
  koşulları resmî sayfadan okunamadı (otomatik istemciye HTTP 403); sahiplik, görünürlük ve otomasyon maddeleri
  "doğrulanmadı" diye yazıldı. FSEK m.1/B tanımları mevzuat.gov.tr metninden okundu.
- ADR-0002, 0003, 0014, 0016 Durum satırları ve `docs/adr/README.md` özetleri "ADR-0030/0031/0032 ile değişti";
  README tablosu 0028-0034 satırlarıyla tek tabloya toplandı; ADR-0030 Durum satırına ADR-0033 notu.
- `docs/sahiplik.md`: kampus pasif; `{tr,en}` desenleri `tr`; yazma satırına `/tespit`, `docs/tespit`, `tespit.json`
  ve yazma API yolları; `hesap.json` kimlik, `/kaydettiklerim` ve `kaydettiklerim.json` casuist (git geçmişinden);
  sahipsiz kalan `api/v1` yolları (search, answers, norms, library, records, citation-network, decks) ilk ekleyene
  verildi; kök `review.md` orkestranın; not 3'teki eski "henüz atanmadı" cümlesi düzeltildi.
- Ajan tanımları: seo (hreflang), on-yuz (/en, altı sekme), hukuk-uyum (İngilizce sürüm), ios (Kampüs sekmesi),
  kampus (pasif, çağrılmaz). plan.md'de yalnız Ek A seo kopyasının iki satırı.
- `.env.example`: kodda okunan 14 eksik değişken eklendi; kodda okunmayan 17 yer tutucu `[gelecek faz]` işaretli
  (S3 anahtar çifti uygulamada okunmuyor, yalnız yerel compose ve CI kullanıyor); staging ve "endpoint in Turkey"
  anlatımı ADR-0033'e göre düzeltildi; `ACCOUNT_PURGE_GRACE_DAYS` kimlik bölümüne taşındı (boş değer kodda 14'e düşer).
- `docs/istekler/mimar-p1-sozlesme-temizligi.md`: P1 madde 4-9 için iki adımlı plan (A ekleyici, ADR-0035, migration
  0007; B kaldırıcı, ADR-0036, migration 0008, Tarık onayıyla ve ilk üretim dağıtımından önce).
- `docs/ip/arka-plan-kaydi.md` ADR listesine 0021-0034 durumları eklendi.
- Doğrulanmayan: ADR-0033 ve 0034 Tarık onayı bekliyor; Midjourney koşulları birincil kaynaktan okunmadı.
- Kesin sonraki adım: Tarık'ın T1 (ADR-0033), T3 (ADR-0034) ve T4 kararları; ardından adım A (ADR-0035).

## 12 Kasım 2026, orkestra: yayın öncesi tam denetim ve review.md (codex/yayin-oncesi-denetim)

Üç salt okunur ajan (ön yüz, işçiler ve paketler, altyapı ve belgeler) ve yerel typecheck, lint, test, build ile `main`
(bfefdb6) denetlendi. Sonuç ve ajanlara devredilecek 11 iş paketi kökteki `review.md` dosyasındadır; Tarık'ın vermesi
gereken 11 karar aynı dosyanın 1. bölümündedir. Yeni bağımlılık yok; `packages/contracts` ve `packages/db` değişmedi.
- Düzeltilen hatalar: Kalemcik günlük işi 00.00 yerine İstanbul saatiyle 08.00'e kuruluyor (hatırlatmalar hiç
  gönderilmiyordu); hata veren `tick` kuyruğu durdurmuyor; SSE akışı erken bitince sağlayıcı bağlantısı kapanıyor;
  `cited_by` yalnız yayın eşiğini geçen atıfları sayıyor; OpenAlex DOI küçük harfe çevriliyor; dergi profili sayfası
  sorguyu istek başına bir kez çalıştırıyor.
- Temizlik: `adr0031Kaldirilan`, `hreflang` eşlemesi, yanlış yorumlar; CI'da `uv sync --frozen`; gitleaks dizin çıktısı
  ekleniyor; `engines.node` 26; kök `pnpm e2e` betiği; rastgele kırılan Kalemcik sıralama testi.
- Doğrulanmayan: tarayıcıda görünüm ve axe, arm64 derlemesi, `pnpm e2e` betiğinin çalıştırılması. Denetimin okumadığı
  yerler `review.md` 8. bölümdedir.
- Kesin sonraki adım: T1, T2, T3 kararları ve Hetzner sunucusu; ardından P1 madde 1 (ADR-0033 ve ADR-0034).

## 7 Kasım 2026, atif-agi: atıf çıkarma, atıf ağı uçları ve /atif-agi (codex/dalga2-atif-agi)

Yeni bağımlılık yok (Batch istemcisi standart kütüphane); `packages/contracts` ve `packages/db` değişmedi (istekler
`docs/istekler/atif-agi-sema.md` ve `atif-agi-sozlesme.md`). Menüde `/atif-agi` açıldı (`acikModuller`, yalnız o satır).
- Çıkarma `services/worker-py/citations/`: `decisions.py` E/K/T (harf önce, numara önce, "E.K." birleşik), AYM bireysel
  başvuru ve norm denetimi, ABAD `C-131/12`, AİHM `no. 12345/09`; mahkeme, daire ve tarih yalnız yazılıysa doldurulur,
  alt mahkeme anmaları (dosya geçmişi) kenar sayılmaz. `doctrine.py` sayfa işaretine (`s. 373 vd.`) tutunup geriye doğru
  okuyan kural ayrıştırıcı: tam künye, `Soyad, A.:` biçimi, makale, `age.` ve kısa başlık. `names.py` unvan temizleme ve
  Türkçe karakter, `works.py` baskıların tek düğümde toplanması ve belge içi `age.` çözümü (birden çok aday ya da yazarsız
  uzak `age.` yayın çizgisinin altında kalır).
- Güven ve kuyruk (`scoring.py`, `pipeline.py`): yayın eşiği 0,90, kuyruk 0,50, altı atılır; karar kenarı hedef kayıt
  corpusta tek ve alanları uyumlu ise çizilir, aksi halde `hedef_yok` (saklanır, çizilmez) ya da kuyruk. Kuyruk
  `review_queue.queue='citations'`, bağlam yalnız maskeli metinden.
- Model katmanı (`llm.py`): yalnız `masked_text` ve yalnız doktrin işareti taşıyan paragraflar; doğrulanmış kimlik
  kalıntısı görülürse hiçbir şey gitmez (`UnmaskedText`); model cevabı veridir: katı JSON, birebir alıntı yoksa atılır;
  Batch iş akışı (`job.py`) gönder, 10 dk aralıkla yokla, topla. Gerçek model çağrısı yapılmadı, anahtar kullanılmadı.
- API: `GET /v1/citation-network` ve `GET /v1/records/:id/network` (zod, IP başına hız sınırı, yalnız servis edilebilir
  kayıt). Sözleşmeye ek alanlar (`works`, `workEdges`, `externalCitations`, `summary`, `meta`) geriye uyumlu eklendi.
- Arayüz `apps/web/src/app/atif-agi/`: solda kararlar, sağda eserler; düğümler gerçek düğme (Tab, Enter, Boşluk, Esc),
  çizgiler aria-hidden SVG; seçim kalın kenar ve gizli metinle bildirilir; ayrıntı paneli (`aria-live`), özet kartları,
  `?gorunum=tablo` eşdeğer tablo görünümü, GET süzgeç formu. Örnek veri `_veri/ornek-ag.json`, eval betiği üretir.
- Kaynak seçimi `ara` ile aynı: `KAZUIST_ARAMA_KAYNAGI=fikstur` yalnız yerel ve deneme; üretimde veritabanı yoksa 503.
- Ölçüm `eval/citations/olc.py`: 7 gerçek karar (8 karar atfı, 4 doktrin atfı) ve 4 sentetik metinde kenar kimliği
  kesinliği %100. Bu 15.3/4 değildir: 100 kararlık altın set ve gerçek corpus yok, "ölçülmedi" yazıldı.
- Erişilemeyen kaynak: Yargıtay karar arama (`karararama.yargitay.gov.tr/aramalist`) otomatik istemciye "Hata Oluştu"
  döndü (robot doğrulaması yolu var); dürüst kimlikle 3 deneme yapıldı, kimlik taklidi ve aşma yapılmadı. SRS'teki dört
  kararın resmî metni bu yüzden alınamadı; HGK E.2014/4-56 K.2015/1679 atfı gerçek iki kararda (4. HD 2023/12295 ve
  7. CD 2023/30) bulundu, kararın kendisi corpusta yok.
- Açık: doktrin tabloları (`work_citations`, `works.work_key`) ve `citation_edges.rejected`; editör kuyruğu ekranı
  (kimlik, admin); 100 kararlık set; `bozma/onama/ayni_yonde/aksi_yonde` türleri üretilmiyor (yalnız `atif`);
  yıl içermeyen eski numaralar (`7803-9629 sayılı`) desteklenmiyor; pyproject `testpaths` içine `citations/tests` eklenmeli.
- i18n: yalnız `packages/i18n/tr/atif-agi.json` (kullanıcı kararı: İngilizce yok); `en` eşlik testi bu dosya için
  düşer, test değiştirilmedi (on-yuz `en` dizinini kaldıracak).

## 7 Kasım 2026, icerik: Rehberler modülü açıldı (codex/dalga2-rehberler)

Yeni bağımlılık yok (MDX yerine JSON, gerekçe docs/istekler/icerik-rehberler.md); contracts ve db değişmedi. `acikModuller`
kümesine yalnız `'/rehberler'` eklendi. Yalnız Türkçe: `en` dizini yok (orkestra kararı), `packages/i18n/test/parity.test.ts`
bu yüzden `rehberler.json` için iki test kırar ve `en` kaldırılınca düzelir; test değiştirilmedi.
- İçerik `content/rehberler/*.json`: makale 12 adım, tez monografi modeli ve 12 adım (her adım bir dayanağa bağlı), Zotero 8 ve
  EndNote 6 adım, karşılaştırma tablosu, 14 maddelik kontrol listesi, YÖK yönergesi m. 4/1 altı ihlal (birebir tanım, kurgusal
  hukuk örneği). Şema `apps/web/src/app/rehberler/_alan/sema.ts`; geçersiz dosya derlemeyi durdurur.
- Sayfalar: `/rehberler`, `/rehberler/{makale,tez,zotero-endnote,kontrol-listesi,etik}`. Her sayfada üstte etik kutusu, altta sabit
  uyarılar ve /tespit bağlantısı. İlerleme `localStorage` `kazuist.rehber.v1`, makale, tez ve kontrol ayrı saklanır; sunucuda
  saklama (FR-34) için istek yazıldı. Kapalı modüle (/ara, /yazma) bağlantı çizilmez.
- Kaynak: "Hukuk Atlası: Makale ve Tez Yazım Rehberi" Word belgesi depoda yok, içerik ondan aktarılmadı; yalnız doğrulanmış
  kaynaklar kullanıldı. Zotero (zotero.org/support) ve EndNote 2025 (docs.endnote.com) düğme ve menü adları resmî sayfalardan
  alındı, her kayıt URL ve okuma tarihiyle sayfada listeli. YÖK PDF'i okundu. Kitap dayanaklarının (Volokh, Dunleavy,
  Silvia, Hutchinson ve Duncan) hiçbiri birincil okunmadı, sayfada "ikincil" yazılı; Edinburgh planlayıcısı birincil.
  Deakin sayfası CAPTCHA istedi (aşılmadı); EndNote sistem gereksinimi sayfası 404 verdi.
- Doğrulama: typecheck, lint, check:text, web testleri 354 geçti/1 skip, üretim derlemesi; 375/768/1440 px'te 6 sayfa, klavyeyle
  işaretleme, yenileme sonrası kalıcılık, etik kutusunun klavyeyle açılması: 93 kontrol, 24 axe taraması, 0 sorun
  (`apps/web/src/app/rehberler/_kanit/`; axe test tarayıcısında `bypassCSP` ile çalıştı, ekran okuyucuyla elle deneme yapılmadı).
- Açık: FR-34 sunucu saklama, /ara filtre parametresi, seo (Article, canonical), kitap dayanaklarının asıl metinle
  doğrulanması, Word rehber belgesinin gelmesi, EndNote'ta İSNAD stili doğrulaması.
## 7 Kasım 2026, on-yuz: ADR-0032 yalnız Türkçe (codex/yalniz-turkce)

Kullanıcı kararı (ADR-0032, PR #64) uygulandı; PR açık, birleştirilmedi. Yönlendirme eklenmedi.
- i18n: `packages/i18n/en/**` ve `parity.test.ts` silindi. `src/index.ts` tek dilli: `locales`, `Locale`,
  `sourceLocale` kalktı, `ortak()` parametresiz (tip `tr/ortak.json`'dan). Yeni `test/anahtarlar.test.ts` yalnız tr
  dizinini, boş değer, yinelenen anahtar ve tip güvenliğini denetler; `check` betiği ona bakar. `ortak.json`'dan
  `altBilgi.casuistEn`, `anaSayfa.enNotu`, `casuist.baglayiciSurum`, `casuist.turkceSurum` çıktı. Bütün
  `ortak('tr')` çağrıları `ortak()` oldu.
- Rotalar: `(casuist)` altındaki /en, /problem, /how-it-works, /evaluation, /partner, /about ve /legal/[belge]
  sayfaları ile 11 İngilizce arşiv JSON'u silindi. Türkçe arşiv sayfalarından "English" dil bağı (`langLink`)
  kaldırıldı; `CasuistSayfa` dil dallanmasız, marka bağı /tr. /eski arşivi `lang: tr`, başlığı Türkçe.
  next.config.ts'deki Türkçe hukuki 301 aynen duruyor (İngilizceye ait girdi yoktu).
- Kabuk: alt bilgideki "Casuist (English)" bağı ve ana sayfadaki İngilizce not kalktı; `html lang="tr"` zaten sabitti.
- Hukuki: `content/hukuki/en/**` silindi; altı Türkçe metindeki `alternate: /legal/...` satırı ve /hukuki
  sayfalarındaki hreflang `alternates` kalktı. `yukle.ts` yalnız `tr` okur, `lang: tr` dışını reddeder;
  `HukukiGovde` bağlayıcı sürüm notu ve en-GB tarih dalı olmadan.
- Testler: Ek H tablosu 23 satır kaldı; 2-11 numaralı satırlar `gone` ve 404 beklenir, /en de 404 ve Location yok.
  Güvenlik başlık testinde /problem yerine /tr. Lighthouse bütçesi /en yerine /tr (CI adımı adı dahil).
- SEO: main'de sitemap.ts, robots.ts ve public/llms.txt yok; temizlenecek adres yoktu.
- Doğrulama (origin/main #63 ve #64 birleştirildikten sonra): typecheck, lint, check:text, build; i18n 20,
  contracts 122, ui 31, casuist 104, db 43, ledger 168, web 487/1 skip, worker-node 77, ai-gateway 67/2 skip.
  #63'ün eklediği `packages/i18n/en/{yazma,kalemcik,tespit}.json` silindi, yeni `ortak('tr')` çağrıları
  `ortak()` oldu. Yerel üretim sunucusunda 11 İngilizce adres 404 (Location yok), /tr ve altı, /yazma, /kalemcik
  200, beş Türkçe hukuki 301. Ekran ve axe `docs/tasarim/ekran`: 16 sayfa, 375/1440 axe 0, üç genişlikte taşma 0.
- Açık: sözleşme ve sahiplik temizliği `docs/istekler/on-yuz-yalniz-turkce-sozlesme.md` (mimar). Arşiv HTML'leri
  `docs/tasarim/casuist-arsiv/*.html` kayıt olarak duruyor, dönüştürücü artık yalnız Türkçe sayfaları üretir.
  Search Console kaldırma talebi seo ajanında (ADR-0032).

## 7 Kasım 2026, yazma: Dalga 2 yazma modülü (codex/dalga2-yazma)

Yeni sözleşme veya şema değişikliği yok; ihtiyaçlar docs/istekler/yazma-*.md (sozlesme, bildirim-ve-hesap, yz-gecidi, orkestra).
- Çekirdek `apps/web/src/app/yazma/_cekirdek`: kural şeması (SRS 6.2), tez ve makale .docx üreticisi (docx 9.15; iki bölüm, i/ii ve 1/2 numara, Normal/Başlık 1-3/Dipnot Metni stilleri, içindekiler alanı, kapak, ASCII dosya adı), PDF/DOCX/TXT metin çıkarma (20 MB, tür içerikten, zip bombası sınırı, 200 karakter altı uyarı), kural çıkarma hattı (Haiku, şema düşerse Sonnet, alan başına sayfa ve alıntı, alıntı kılavuzda birebir aranır, değer alıntıda geçmezse "Örnek değer"), kısaltmalar cetveli.
- API (`api/v1/{writing-projects,journals,templates,jobs,abbreviations}`): çalışmalar ve ilerleme, dergi profilleri (yalnız editörün onayladığı sürüm görünür), kılavuz yükleme işi, .docx denetimi, kısaltma cetveli. Dosyalar saklanmaz, YZ'ye gitmez (denetim) ya da maskelenmiş gider (kılavuz; YZ bağlaması kapalı gelir, `YAZMA_YZ=acik`).
- Sayfalar: /yazma, /yazma/sablon (?dergi=<slug> onaylı profili ekrana doldurur), /yazma/dergiler/[slug], /kalemcik; /tespit ile karşılıklı bağlantı; `acikModuller`'e '/yazma'.
- Python `services/worker-py/docxcheck`: stdlib ile .docx denetimi (kenar boşluğu, yazı tipi, punto, satır aralığı, girinti, başlıklar, dipnot, sayfa numarası konumu ve Roma/Arap, bölüm sırası, kelime sınırı), iç HTTP ucu, LibreOffice headless PDF ve sayfa numarası doğrulaması, CLI. 43 test.
- Kalemcik: `apps/worker-node/src/kalemcik` günlük iş (teslim 14/7/3/1/0 gün, üç gün sessizlik kuralı ve iki günde bir tekrar, hitap sen/siz, 30 gün saklama temizliği); mesajlar `content/kalemcik.yaml`'dan (JSON kopyası, test sapmayı yakalar). Metin `notify.send` refId'sinde adlandırılır; kimliğin `render()` satırı bekleniyor.
- eval/rules: beş gerçek DergiPark kılavuzu, altın etiketler, ölçüm betiği. Plan 15.3/3: "3 kılavuzda hatasız .docx" geçti; "çekirdek %95" **geçmedi** (canlı model ölçümü yok, 5/10 kılavuz). Word ve Google Docs elle kontrol kaydı bekliyor (eval/rules/el-kontrol-kaydi.md).
- Doğrulama: web 307 test, worker-node 77, i18n 15, python docxcheck 43; typecheck, lint, prettier, check:text, üretim derlemesi; 375/768/1440 axe 0 ihlal ve taşma 0 (eval/rules/ekran, gerçek PostgreSQL 18, gerçek docxcheck servisi, Brave).
- Açık: orkestra kayıtları (kalemcik.daily, docxcheck bağlama, pyproject testpaths), YZ bütçe ve kredi girişi (yz-gecidi), 10 enstitü/dergi kılavuzu ve canlı ölçüm, DergiPark protokolü olmadan otomatik çekme yapılmadı, editör kuyruğuna düşen dergi taslakları için yönetim arayüzü kimlik/orkestra'da.
## 7 Kasım 2026, casuist: /ara, kaynaklı özet ve /kaydettiklerim (codex/dalga2-casuist)

Dalga 2 casuist ilk teslimi; PR açık, birleştirilmedi. `packages/contracts` ve `packages/db` değişmedi.
- Çekirdek `packages/casuist`: Ek D.2 normalizasyonu; norm çözücü (kanun numaraları mevzuat.gov.tr resmî metniyle
  doğrulandı, `src/laws.ts`); 6.5 kalıplarıyla karar çözücü; kimlik, tam metin ve vektör kollarını RRF (k=60) ile
  birleştiren arama; ilgililik (sıra kanıtla ölçeklenir) ve önem puanı; 7.3 etiketleri; Ek F otorite sınıfı;
  `MemoryBackend` (fikstür) ve `sqlBackend` (records, chunks, `turkish` tsvector, halfvec HNSW, citation_edges);
  pasaj seçimi (künye satırı pasajın ilk satırıdır, sayılar onunla doğrulanır); Ek D.2 satır doğrulayıcısı
  (`./validator` girişi tarayıcıda çalışır, test Node yerleşiği kullanmadığını zorlar); SSE olay akışı ve çekimserlik;
  RIS ve BibTeX. Canlı federasyon `LiveSource` arayüzü 1,2 sn bütçeyle hazır, bağdaştırıcı yok.
- Fikstür: 75 kayıt, resmî kaynaklardan 7 Kasım'da alındı (KVKK tamamı, TBK m.49-75, Anayasa 5 madde, 7 Yargıtay
  kararı, 1 KVKK Kurul özeti, GDPR m.1-2). Kaynak, özetler ve üretim komutu `packages/casuist/fixtures/KAYNAK.md`.
  Üretimde fikstür kapalıdır; veritabanı yoksa arama 503 döner.
- Uçlar: `GET /v1/search`, `/v1/records/:id`, `/v1/norms/resolve` (IP hız sınırlı, yalnız `masked_text`, gizli kayıt
  yok); `POST /v1/answers` (SSE; yz-gecidi üzerinden yalnız maskeli metin; günlük 2 ücretsiz, edu.tr ile 5; sonra 2
  kredi; doğrulanmış cümle yoksa hak ve kredi geri; BYOK aktarma `yz_aktarim` onayı ister); `prepare` ve `verify`
  (tek kullanımlık nonce, imzalı istem, sunucuda yeniden doğrulama); `/v1/library` GET/POST/DELETE ve export
  (ris, bibtex; İSNAD/OSCOLA/Bluebook CSL kararına kadar 400 ve açıklama).
- Arayüz: `/ara` (form, filtreler, türe göre sayılı sekmeler, sonuç kartı, kenar şerhli özet, dayanağı göster,
  sabit uyarılar, etiket sözlüğü, resmî siteler) ve `/kaydettiklerim` (liste, çıkarma, kaynakçayı kopyala, indir).
  `acikModuller` içine `/ara` ve `/kaydettiklerim` eklendi.
- Ölçüm: `node eval/rag/olc.ts --yaz`; 50 soru (36 cevaplı, 10 cevapsız, 4 tuzak). Fikstürde ilk 10'da beklenen kaynak
  36/36, doğrulayıcı 144 saldırgan satırın hiçbirini göstermedi, birebir alıntılı 36/36 satırı kabul etti. Gerçek
  corpus ve model gerektiren 7.6 eşikleri (çekimserlik, desteksiz cümle, p95'ler, ad sızıntısı) ölçülmedi, geçti
  sayılmadı. Rapor `eval/rag/raporlar/dalga-2-fikstur.md`.
- Doğrulama: casuist 104, web 227 geçti/1 skip (PGlite üstünde gerçek göçlerle SQL arka ucu, özet ve kütüphane
  uçları, taklit sağlayıcı), tüm çalışma alanı testleri, typecheck, lint, check:text, üretim derlemesi. Yerel
  PostgreSQL 18 + pgvector'de göçler ve fikstür yüklemesi, üretim sunucusunda arama ve 375/768/1440 px axe 0, yatay
  taşma 0 (özet ekranı taklit SSE ile; görüntüler yerel çalışma klasöründe).
- Açık: kilit dosyası güncellemesi (orkestra), sözleşme önerileri ve komşu ajan işleri
  `docs/istekler/casuist-dalga2.md` ve `casuist-kaydettiklerim.md`; embedding servisi ve eval/embed, embed.chunks
  tüketicisi ve uzlaştırma işi, BYOK istemci arayüzü, zaman çizelgesi (FR-13), CSL biçimleri, gerçek corpus ölçümü.
## 7 Kasım 2026, pratik: FSRS, dört oyun, HMGS destesi ve deneme, onay akışı (codex/dalga2-pratik)

Yeni bağımlılık yok; contracts ve db değişmedi (istekler `docs/istekler/pratik-*.md`). Menüde `/pratik` açıldı
(`acikModuller`).
- Motor `apps/web/src/app/pratik/_alan/`: `fsrs.ts` FSRS-6, bağımlılıksız, ts-fsrs 6.0.0 (MIT) referansıyla 8 senaryo x 14
  adım sekiz ondalığa eşleşir (`referans/`); fuzz kapalı, gün sınırı UTC+3, dakika adımı yok. `kart.ts` kart modeli
  (plan 10.6/1 alanları, durum hesaplanır), `onay.ts` iki editör kuralları, `depo.ts` ilerleme (günlük yeni kart sınırı
  10, tekrar sınırsız, seri), `oyun.ts` tur mantığı, `deneme.ts` 120 soru/155 dk dağılımı, baraj 70, konu raporu.
- Arayüz: `/pratik`, `/pratik/bugun`, `/pratik/deste/[slug]`, `/pratik/hmgs`, `/pratik/hmgs/deneme`, `/pratik/editor`.
  Doğru/yanlış işareti şekil ve metindir (FR-58), açıklama, kaynak, birebir kanun alıntısı, "kanunu aç". İlerleme
  tarayıcıda `localStorage`; sunucuda yalnız `GET /api/v1/decks` ve `/decks/{id}/cards`.
- İçerik `content/desteler/`: 7 deste, 59 özgün kart, 61 kaynak denetimi `dogrula.ts` ile birebir geçti (Anayasa
  anayasa.gov.tr, TMK mevzuat.gov.tr). Hiçbir kart editör onayı almadı, bu yüzden üretimde görünür kart 0 ve sayfalar
  bunu dürüstçe söyler. Staging'de `PRATIK_ONIZLEME=1` onay bekleyen kartları gösterir. 13 alanda deste yok.
- Kaynak erişimi: mevzuat.gov.tr tarayıcı olmayan istemcilere zaman aşımı veriyor. TMK sayfasını ve Anayasa'nın
  karşılaştırma kopyasını keşif sırasında tek seferlik tarayıcı kimliğiyle okudum (2 istek); sonra bunu bıraktım,
  kalan kaynaklar anayasa.gov.tr'den dürüst kimlikle alındı. Betik `--yerel` ile tarayıcıdan kaydedilmiş sayfa alır;
  TMK kartlarının editör tarafından kendi kaydettiği sayfayla yeniden doğrulanması önerilir.
- Doğrulama: typecheck, lint, check:text, tüm testler (web 321 geçti/1 skip, i18n 14), üretim derlemesi; 375/768/1440
  px klavyeyle dört oyun, çalışma, kısmi deneme: 522 kontrol ve 75 axe taraması, 0 sorun, taşma 0
  (`apps/web/src/app/pratik/_kanit/`, 9 ekran x 3 genişlik). Ekran okuyucuyla elle deneme yapılmadı.
- Açık: editör onayı (Tarık ve ikinci editör), diğer 13 alan için kaynak, veri tabanı eşlemesi ve sözleşme
  (pratik-sozlesme.md), akademisyen özel destesi (FR-61 1.1 derse atama; özel deste oluşturma yok, YZ taslağı
  geçidi ve kredi kaydı gerekir), konu piktogramları (FR-57) yok.
## 7 Kasım 2026, on-yuz: Turkuaz Kampüs arayüzden çıktı, /tespit bağlantısı

Dal codex/on-yuz-kampus-cikar (ADR-0031). Yeni bağımlılık yok; contracts ve db değişmedi; `acikModuller` kümesine dokunulmadı.
- Kabuk: `rotalar.ts` modül listesinden `kampus` çıktı (altı sekme), `ModulGezinmesi.tsx` ve `kabuk.css` Kampüs sınıfları silindi.
- Ana sayfa: Kampüs bandının yerinde /tespit tanıtımı (`.ana-tespit`, kâğıt zemin, şerh çizgisi; ikinci renk yok).
  Alt bilgi "Ürün" listesine "Yazım kuralları ve iz denetleyicisi" bağlantısı; metinler `ortak.json`
  (`gezinme.tespit`, `anasayfa.tespit*`). Üst menüde modül sekmesi olarak eklenmedi.
- packages/ui: `--kz-color-kampus*` belirteçleri, `Etiket` ve `HalkaGrafik` `kampus` türleri ve CSS sınıfları
  kaldırıldı; token testi tek vurgu rengini zorlar. i18n testi `ortak.json`da Kampüs anahtarı kalmadığını zorlar.
- /fiyatlar: "Kampüs YZ özeti" ve "Poster taslağı" satırları çıktı; plan.md 4.4 güncellenene kadar test bu iki
  satırı `adr0031Kaldirilan` kümesiyle dışarıda tutar. `docs/tasarim/yon.md` renk tablosu güncellendi.
- Doğrulama: ui 31, i18n 14, web 185 geçti/1 skip; typecheck, lint, check:text, üretim derlemesi yeşil;
  17 sayfa x 375/768/1440 ekran görüntüsü yenilendi, axe 0 ihlal ve yatay taşma 0 (docs/tasarim/ekran/axe-sonuc.json).
- Açık: docs/istekler/on-yuz-kampus-temizligi.md (kimlik: takedown.ts, admin testi, hesap.json; mimar: şema ve
  sözleşme; odeme: ledger fiyatları; orkestra: plan.md 4.4, 12.2, 13.1; hukuk-uyum: `topluluk` belgesi ve metinler).

## 6 Kasım 2026, orkestra: Hetzner barındırma, Kampüs kapsam dışı, /tespit

Kullanıcı kararlarıyla ADR-0030 (Hetzner Cloud, AB konumu; staging hemen, üretimde kişisel veri KVKK m.9 aktarım dayanağı ve bildirim tamamlanmadan işlenmez) ve ADR-0031 (Turkuaz Kampüs kapsam dışı, /tespit 1.0 kapsamında) yazıldı; plan.md K-03, K-14, 0/6, 1, 5.5, 10.7, URL tablosu ve Dalga 2 satırı güncellendi.
/tespit PR #57 dört yeşil CI işiyle squash birleşti (00a7da2). Hetzner'da yalnız kulular-uretim-01 (CX23, Helsinki) var; Kazuist'e uygun değil, dokunulmadı.
Açık: kullanıcı staging sunucusunu açıp ~/Desktop/kazuist-staging.txt yazacak; hukuk-uyum aktarım envanteri ve metinler; mimar kampus sözleşme/şema temizliği; docs/istekler/yazma-tespit.md dört istek.

## 6 Kasım 2026, tespit: /tespit sayfası (yazım kuralları ve iz denetleyici)

Dal codex/tespit. Yeni bağımlılık yok; sözleşme (contracts, db) değişmedi.
- Sayfa `apps/web/src/app/tespit/`: bütün istemi kopyalayan düğme (navigator.clipboard, aria-live durum satırı, pano yoksa
  seçili textarea yedeği), `/tespit/yazim-kurallari.md` indirme ucu (ASCII dosya adı), kural setinin 11 bölüm ve 159
  madde olarak okunur gösterimi (her madde `#kural-<bölüm>-<sıra>` bağlantısı) ve tarayıcıda çalışan iz denetleyici.
- Tek kaynak `docs/tespit/yazim-kurallari.md`. `_veri/kurallar.json` onun ayrıştırılmış hâlidir; yeniden üretim
  `node apps/web/src/app/tespit/_veri/uret.ts`. Denetleyici kataloğu (`_veri/izler.ts`) her girdiyi kural numarasına ve
  kuralın metnindeki birebir terime bağlar; test ikisini karşılaştırır.
- Kural id'si `<bölüm>.<sıra>`; Bölüm 9'un ikinci listesi kaynakta 1'den başladığı için 9.7 ile 9.12 olarak numaralanır.
- Sunum: "yapay zekâ yazdı" ya da "%X yapay zekâ" yok; şiddete göre iz sayısı, 1000 sözcükte iz, ritim ölçümü (10.6) ve
  yanlış pozitif uyarısı (9.3, 9.4, 9.5). Metin sunucuya gitmez; test kaynakta ağ, depolama, log yolu olmadığını zorlar.
- check-text.mjs değişmedi ve devre dışı bırakılmadı: kural verisi taranan yollarda (content, packages/i18n) durmaz.
- Doğrulama: typecheck, lint, check:text, tüm workspace testleri (web 185 geçti/1 skip, i18n 13), üretim derlemesi;
  375/768/1440 px axe 0 ihlal, yatay taşma 0 (docs/tespit/ekran). Pano, yedek yol, indirme ve ağ isteği ölçümü Playwright ile.
- Açık: gezinme bağlantısı (on-yuz), site haritası ve indeksleme (seo), e2e listesi (kalite-guvenlik): docs/istekler/yazma-tespit.md.
  Ekran okuyucuyla elle deneme ve Word/Google Docs gibi dış araçlarla ilgili bir kayıt bu işin kapsamında değildir.

## 2 Kasım 2026, orkestra: bekleyen PR'ların birleştirilmesi

Kullanıcı 2 Kasım'da "hallet" diyerek açık PR'ların birleştirilmesini istedi. Her PR yalnız son HEAD'inde
dört CI işi (node, python, docker, gitleaks) completed/success iken birleştirildi.
- Squash: #55 (pypdf/minimatch, f3614a3), #53 (hukuki işaretler, 9459def), #54 (VPS paketi, b967e97).
- Merge commit (yığın ortak geçmişi korunsun diye): #43 (30457f3), #50 (7605f44), #51 (ca4e4d6), #52 (fd18cc4).
- İçerikleri birleşenlerde main'e girdiği için kapatıldı: #38, #41, #42 (#43'te); #47, #49 (#50'de); #48 (#51'de).
  Her birinin HEAD'i main atasıdır; #42'nin HEAD'i olan merge commit'in iki ebeveyni de main'dedir.
- Yığın güncellemelerinde yalnız DEVIR.md ve docs/ilerleme.md üst bölümleri çatıştı; iki taraf korundu.
  Her ara adayda yerel build, typecheck, lint, check:text ve workspace testleri geçti; son main ağacı #52
  HEAD'iyle (26c6e87) aynıdır: ledger168, web114/1 skip, db43, contracts127, worker-node47.
Açık PR kalmadı. ADR-0027/0028/0029 kabulleri PR açıklamalarındaki 27 Ekim kullanıcı onayına dayanır; bu
birleştirme canlı migration, canlı ödeme, hukuki yayım veya depo görünürlüğü değişikliği değildir. Dalga 1
kapısı 5/9 açık kalır (staging, gerçek sandbox akışı, bağlayıcıların staging çalışması, künye ve iki hukuki işaret).

## 2 Kasım 2026, orkestra: yeni bağımlılık açıkları (pypdf, minimatch)

2 Kasım'da GitHub Actions yeniden çalıştı; PR53 gitleaks işinin tarama adımı yeni ilanlarla düştü (sızıntı yok).
- pypdf 6.21.2: CVE-2026-119203/119204/119205/119207/119209, düzeltme 6.21.4. Alt sınır `pypdf>=6.21.4`,
  uv.lock 6.21.4. Python 143 geçti/3 skip.
- minimatch <11.0.1 (GHSA-g3hv-75wg-m249, orta): ESLint zinciri `minimatch@10` override ile 11.0.3.
  openapi-typescript 7.13.0 hâlâ @redocly/openapi-core 1.34.21 (minimatch 5) kullanır; o yol da 11.0.3'e
  zorlandı ve tek `require("minimatch")` satırı adlandırılmış dışa aktarıma `patches/` ile uyarlandı.
  Yamalı `match` doğru/yanlış örnekleri, contracts lint ve check:generated geçti. Yalnız geliştirme aracıdır.
Doğrulama: tarama.sh status0 (pnpm audit0, pip-audit0, gitleaks temiz, lisans yasak yok); typecheck, lint,
check:text, contracts:lint, build ve workspace testleri geçti. Kök kilit ve workspace dosyası orkestra yetkisiyle değişti.
## 2 Kasım 2026, orkestra: hukuki doğrulama işaretleri, iyzico yanıtı ve CI engeli

Yedi `[DOĞRULANACAK]` işaretinden dördü birincil kaynakla kapatıldı; metinler taslak kalır, yayım onayı verilmedi.
- topluluk: Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi m.4/1 altı ihlal türünü aynen sayar
  (yok.gov.tr/documents/documents/68fb63b8b2511.pdf; son değişiklik 28/8/2025 YÖK Genel Kurulu).
- cerezler: kvkk.gov.tr/Icerik/7353 güncel rehber sürümü "Temmuz 2025, KVKK Yayınları No: 69".
- yapay-zeka: m.50, 2 Ağustos 2026'dan beri uygulanır (digital-strategy.ec.europa.eu SSS, 24/7/2026 güncel);
  Tüzük (AB) 2026/1744 (8/7/2026, ABRG L 24/7/2026, yürürlük 27/7/2026) m.50/2 için dört aylık geçiş (gerekçe 38).
- on-bilgilendirme: ticaret.gov.tr hakem heyeti bilgilendirme metni, e-Devlet üzerinden TÜBİS başvurusu.
Beşinci işaret (cerezler tercih kaydı) koda göre kapatıldı: tercih çerezi ve dil çerezi yok; analitik etkin
olmadığı için tercih sorulmuyor. better-auth 1.7.11 ve passkey kaynağından okunan giriş doğrulama çerezleri
tabloya eklendi: state 300 sn (veri tabanı durum stratejisi), better-auth-passkey 300 sn, two_factor 600 sn;
trust_device arayüzde tetiklenmediği için yazılmadı. EN cookies özeti aynı gerçeğe çekildi.
Sürümler 2026-11-02.1. Açık kalan iki işaret: gizlilik VUK/TTK saklama süreleri ve iade-ve-kredi Abonelik
Yönetmeliği değişiklik kontrolü (mevzuat.gov.tr ve resmigazete.gov.tr okuma aracında robots ve ağ vekilinde
403; ikincil kaynakla kapatılmadı). Doğrulama: check:text 795 dosya, Prettier, contracts 118, web 88/1 skip geçti.

iyzico 31 Ekim 2026'da yanıtladı: sandbox hesabında abonelik özelliği etkinleştirildi. ADR-0029 yeni abonelik
satışını kapattığı için bu yalnız eski abonelik akışlarının sandbox testi içindir.

En üst aday PR52 (e4f0eca) Node 26.13 ile bulutta yeniden ölçüldü: typecheck, lint, check:text,
contracts:lint, build geçti; test i18n12, contracts127, ui31, casuist1, db43, ledger168, worker-node47,
ai-gateway67/2 skip, web114/1 skip; Python143/3 skip; enjeksiyon60. GitHub Actions run 40456390075 dahil
27 Ekim'den 2 Kasım gecesine kadar bütün koşular dört işte sıfır adımla failure verdi (hesap ödeme/harcama
kısıtı); kısıt 2 Kasım'da kalktı, birleştirme aşağıdaki orkestra bölümündedir.
## 27 Ekim 2026, on-yuz, ücretsiz kullanım ve fiyatlar (codex/ucretsiz-fiyatlar)

ADR-0029 onayına göre fiyatlar sayfası Ücretsiz/BYOK/Platform kredisi seçeneklerine geçti.
Tüm özelliklerin ücretsiz olduğu ve BYOK sağlayıcı faturasının kullanıcıya ait olduğu tr/en
sözlüklerde açık. Eski aylık/yıllık öğrenci, akademisyen ve kurumsal satış satırları kaldırıldı.
39/109/299 TL paketler ve işlem kredi tutarları değişmedi. Ledger, API veya eski haklar değiştirilmedi.
Mobilde beş sütun yerine semantik başlık/tanım listesi; tablet/masaüstünde tablo korunur.

Kanıt: plan4.2-4.4 eşliği mevcut5 test, i18n12 test, web/i18n typecheck, kapsam lint/format,
metin ve üretim build geçti. Üretim sunucusunda375/768/1440: HTTP200, axe0, yatay taşma0.
Üç ekran görüntüsü gözle incelendi; kanıt /tmp/kazuist-ucretsiz-fiyatlar-2026-10-27/.
Yeni mirroring test eklenmedi. GitHub CI hesap engeli açık; birleşmedi. Public/lisans değişmedi.

## 27 Ekim 2026, ücretsiz ürün ve açık kaynak önerisi

ADR-0029 ücretsiz bütün özellikler/BYOK ve yalnız isteğe bağlı platform YZ kredisi gelirini önerir. Public/Apache-2.0 ayrı açık onay bekler. Plan, UI, LICENSE ve görünürlük değişmedi. Mahremiyet kapsamı ve henüz incelenmemiş geçmiş Actions içerikleri docs/istekler/orkestra-acik-kaynak-oneri.md içinde; CI faturalandırma engeli nedeniyle birleştirme yapılmaz.

## 27 Ekim 2026, ödeme, D9 rezervasyon yükleme maliyeti

loadWallet rezervasyon tahsisleri için geçmişi her rezervasyonda yeniden taramak yerine tek indeks
kurar: O(E*R) hesap O(E+R) olur. 1800 kayıt ve 101 rezervasyonda tarihsel filtreyle aynı tahsis,
sıra, çoğul kayıt ve boş tahsis sonucu doğrulandı; PGlite geri yükleme testleriyle birlikte7test geçti.
Tam geçmiş hâlâ yüklenir. D9 kapanmadı: checkpoint/veri modeli ile wallet/ledger sayfalaması ayrı iştir.
İlk satış kapısı commitinin üretim web/worker derlemesi, lint, tip ve metin denetimleri geçti.
Yerel üretim sayfasında 375/768/1440 px görüntüleri incelendi; üç axe ölçümünde ihlal0, taşma0.
Kanıt: /tmp/kazuist-subscription-sales-ui/axe.json ve odeme-<genişlik>.png.

## 27 Ekim 2026, ödeme, ADR-0029 yeni abonelik satış kapısı

Yeni abonelik başlatma servis sınırında 409 subscription_sales_closed döner; sağlayıcıya,
replay veya veri tabanına erişmez. Fiyat API yalnız üç kredi paketini sunar. Eski abonelik
bağlantıları alıcı/sözleşme yüklemeden satışın kapalı olduğunu gösterir. Tarihsel fiyat
kataloğu, callback, yenileme, fesih, iade ve rol hakları korunur. Eski abonelik kurulumları
üretim bayrağı olmadan yalnız test fixture sınıfındadır; legacy senaryolar atlanmadı.
Defter167, web odeme sayfası ve gerçek admin handler9 test, ledger/web tip ve lint geçti.
Üretim derlemesi ve üç genişlik görsel/axe doğrulaması ayrıca sonuçlandırılacak.
D9 tüm geçmiş yükleme ve hareket listesinin sayfalamasız olması açık kalır.

## Orkestra iade entegrasyonu, 27 Ekim 2026

43 adayı5a532dc ile49adayıe857d6c, izole278dd78 üzerinde birleştirildi; bu yerel entegrasyon main değildir. İki store çatışması ödeme sahibi tarafından snapshot/deletionfalse ve iade akışları birlikte korunarak çözüldü. Root tip kontrolü, ledger165, web113/1skip, DB43, contracts127 ve worker47 testlerini geçirdi. Web/worker üretim derlemesi, kaynak çatışma dosyalarının lint/biçimi ve metin kontrolü geçti. Bağımsız denetçi son birleşik adayda25testi ve kendi PGlite finansal repro'sunu geçirdi; yeni kritik/yüksek/orta bulgu yok. Ödeme önceki kapsamında ayrıca154ledger/12HTTPtesti ve üretim build geçti. Dalga1kapısı5/9 kalır, ADR28 öneridir ve CI hesap engeli sürer. Canlı işlem veya üretim migration yok.

İade tutarı gerçek tahsilat ve kalan krediyle tavanlı/tüketici lehine yuvarlanır. Unknown sonuç otomatik yeniden gönderilmez. Manuel sonuç ödeme/kalem/defterle atomiktir. Açık hold varken chargeback409 ile güvenli durur. Fatura gerekliliği kalıcı audit'e yazılır; e-Arşiv entegratörü idempotency/requery olmadan otomatik fatura kurtarma tamamlanmış sayılmaz. PGlite/fake testleri gerçek sandbox veya O9 süreç çökmesi kanıtı değildir. Ücretsiz BYOK/özellik ve kredi tekgelir önerisi ayrıPR48/ADR29'da; public yapılmadı.

## 27 Ekim 2026, ödeme, silme iadesi yönetimi (codex/silme-iade-yonetimi)

ADR-0028 önerisinin beş admin ucu gerçek BillingService/PgBillingStore akışına bağlandı.
Karar, özgün tahsilat/kalan kredi kalemleri ve kısmi tutmalar tek transaction'da; sağlayıcı çağrısı
transaction dışında ve CAS ile tekil. Belirsiz sonuç otomatik yeniden gönderilmez; ayrı admin
kalem çözümü aktör/gerekçe/sağlayıcı referansıyla kaydedilir. Eski belirsizlik kuyruğu bu kalemleri dışlar.
İşlem anahtarı aktör/operasyon/hedef/gövdeye kalıcı bağlanır. Passkey/TOTP, strict body, rate,
private no-store ve audit aktörü gerçek guard/PGlite testinde sınandı.

Tutar BigInt ile tüketici lehine kuruşa yuvarlanır ve geçmiş iade maruziyetiyle sınırlanır.
Açık rezervasyon varken chargeback409 döner; iade tutmasının yanlış borç sayılması önlenir.
Önce sağlayıcı belirsizliği çözülür; başarılı kısmi iade sonrası chargeback yalnız harcanan payı borçlandırır.
Fatura gerekliliği ledger tamamlanırken kalıcı audit uyarısına yazılır. Mevcut e-Arşiv adaptöründe
idempotency/requery API'si olmadığı için crash sonrası otomatik fatura resend eklenmedi;
entegratör seçimi ve fatura outbox/kurtarma ayrı açık iştir. Finansal iade tamamlandı ifadesi
faturanın dış sağlayıcıda kesildiği iddiası değildir.

Yerel ledger154, billing route12, typecheck/lint/metin ve üretim build doğrulandı.
GitHub CI billing limiti açık; yeşil sayılmadı, birleşmedi. Canlı iade/migration/ağ işlemi yok.

## 27 Ekim 2026, mimar, silme iade sözleşmesi 1.4 (codex/mimar-silme-iade)

ADR-0028 ÖNERİ, Tarık onayı bekliyor. ADR-0027 dosyası değiştirilmedi; onay kaydı root43 dalındadır.
Migration0006 mevcut FK'leri korur; karar reason/key/hash ve orijinal paket başına immutable allocation
kalemi ekler. Tam tüketici lehine kuruş üst sınırı, gerçek tahsilat/kalan kredi/sahiplik ve diğer iade
riski DB'de doğrulanır. Karar ve kalem değişimleri aktör/gerekçeyle append-only audit'e girer.
Belirsiz kalem tamamlanmaz; başarılı payment kanıtı olmadan basarili olamaz. Tamamlanan talebin tutarı
başarılı kalem toplamıyla aynı olmalıdır. Audit TRUNCATE da engellenir.

Sözleşme iki GET/üç POST tanımlar; admin/passkey/TOTP, strict body, Idempotency-Key ve aktörün
sunucudan gelmesi şarttır. Route/partial ledger/sağlayıcı entegrasyonu ödeme ajanının ayrı işidir;
bu PR o uygulamayı tamamlandı saymaz. Ayrıntı docs/istekler/mimar-silme-iade-v1-4.md.

Kanıt: tetikleyicisiz karar geçişi kabulü kırmızıydı; yeni guard'larla dolu1.3 yükseltme8/8,
DB43/43, contracts127/127; tam Node636 geçti/3 ortam testi atlandı. Build/typecheck/lint,
OpenAPI lint ve check:text geçti. Audit TRUNCATE eklemesinden sonra DB43 yeniden geçti.
GitHub CI hesap/billing limiti orkestrada açık kapıdır; dört iş başarılı diye yazılmadı ve kör
workflow yeniden başlatılmadı. Canlı migration, sandbox veya canlı para iadesi yapılmadı.


## Orkestra son aday ölçümü, 27 Ekim 2026

Birleşik aday1a97d36 için izole kalite: JS569/Python143/enjeksiyon60 geçti, toplam6skip; tip/lint/biçim/metin/OpenAPI/build ve güvenlik taramaları temiz. Bağımsız76test ve gerçekPG18 SIGKILL kurtarma geçti. Ayrıntı docs/kalite/dalga-1.md üst bölümündedir. Kapı5/9 açık; staging/sandbox/bağlayıcı/hukuki hazırlık ve gerçekSMTP kabulü eksik. O9 yönetici iade işi ayrı dalda sürer, ADR28 öneridir. CI hesap engeli kalkmadı; hiçbir PR bu nedenle kapı atlanarak birleştirilmedi. Kullanıcının public sorusu görünürlük onayı sayılmadı; depo PRIVATE kalır. Ücretsiz özellik/BYOK ve isteğe bağlı platform kredisi modeli ayrı karar önerisinde hazırlanıyor.

## Orkestra CI hesap engeli, 27 Ekim 2026

GitHubActions run40405096283 sonHEAD50d0c15 için dört işi de2-3saniyede ve sıfır adımla failure yaptı. Jobannotation: recentaccountpaymentsfailed veya spendinglimit artırımı gerekiyor. Kullanıcıya https://github.com/settings/billing > Billing and licensing / Budgets and alerts > Actions hesabıadımı verildi; ödeme/kart/token değeri istenmedi. Kör tekrar veya kapıgevşetme yok. ADR27 onaylıdır, ancak43 sonHEAD dörtgreenolmadanbirleşmez. Yerel geliştirme/test ve O6/O9 işleri devameder.
## 27 Ekim 2026, kimlik: gerçek ödeme öncesi metin ve silinmiş hesapta sözleşme teslimi

`codex/checkout-metin`, birleşik aday 50d0c15 üstünde ayrı inceleme değişikliğidir; PR42 değiştirilmedi.
Ödeme ekranı yer tutucu yerine aynı yayımlanmış Türkçe kaynağın gövdesini ve kabul edilecek sürümünü
birlikte gösterir. Paket/abonelik başlığı kaynak metinden gelir. Gerçek oturum adı/e-postası ve seçili
ürünün alanları `orderFields`/`fillLegalDoc` üzerinden hazırlanır; geçmiş PDF yeniden üretilmez. Eksik
ad/soyadda tahminî alıcı yazılmaz. Taslak, boş künye, eksik alan, yanlış sürüm veya sözleşme türünde
metin ve ödeme kapalıdır. İçerik/tutar değişirse kutu onayları yeniden alınır. Tablo ve kod dahil gövdede
en az 12pt korunur. Teyit/cayma kutuları ve ürün adları i18n üzerinden gerçek metindir. Hukuki yayım
onayı verilmedi; mevcut canlı kaynaklar bu kapıyı aşmaz.

Sözleşme işi, genel `deleted_at` kontrolünden önce yalnız sipariş sahibi ve değişmez belge takımından
çözülür. Alıcı yalnız her iki snapshot'ın aynı ve geçerli `ALICI_EPOSTA` alanıdır; güncel kullanıcı
e-postasına veya başka bir varsayılana dönülmez. Böylece ödeme sonrası silinen hesapta sözleşme işi
atlanmaz. Diğer ödeme, takip ve kampanya bildirimleri silinmiş kullanıcıda hâlâ `no_user` ile atlanır;
dış push'a özel sözleşme içeriği gitmez. Eksik/bozuk/çelişen alıcıda gönderim ve teslim kaydı yoktur.

Kanıt: yer tutucu+yanlış başlık ve silinmiş hesapta atlanan sözleşme için önce kırmızı testler, sonra
yeşil regresyonlar. Web 111 geçti/1 mevcut skip; worker 47 geçti. İki uygulamanın typecheck ve üretim
derlemesi geçti; değişen kod ESLint, tam Prettier ve metin kontrolü temiz. Tarayıcıda yayımlanmış
sentetik fikstürle 375/768/1440px görüntü, WCAG2A/AA+2.1AA axe 0 ve gövde/tablo/kod alt sınırı 16px
(12pt) doğrulandı. Görünen üç sürüm fake checkout POST'uyla aynı; gerçek /odeme kapalı kaldı. Yerel
fikstür rotası kaldırıldı. Kanıt dizini: Codex visualizations/2026/10/25/
01a1736a-3c34-7d40-ae4e-8f8808e87e0c/checkout-metin. SMTP testleri taklittir; canlı gönderim yapılmadı.
CI hesap faturalama sınırı nedeniyle root tarafından bloklu bildirildi; yeniden çalıştırma tetiklenmedi.

## Orkestra, 27 Ekim 2026

Kullanıcı ADR-0027'yi açıkça onayladı. Kabul kaydı bu dalda işlendi; hukuki metin yayını ve canlı migration izni çıkarılmaz. PR44/45 dörder tamamlanmış yeşil CI işiyle main fef96e3'e alındı. Birleşik43 adayı main ile güncellendi; sonHEAD dört CI işi tamamlanmadan birleşmez. Eski38/41/42PR'ları aynı kapsamın kaynaklarıdır, birleşik43 sonrasında yinelenen değişiklik olarak kapatılacak.

O6gerçek ödemeöncesi metin gösterimi ve silinmiş kullanıcıya kalıcı sözleşme teslim yarışı kimlikte; O9iade taleplerinin yönetici kararı/ödeme akışı ödeme+mimarın ayrıworktree'lerinde sürüyor. YeniADR0028 öneri kalır. Güncel Dalga1kapısı5/9; sonraki dalga başlamadı. İyzico aktivasyon yanıtı, gerçekuygulama sandbox/staging, bağlayıcılar ve hukuki hazırlık açık.

## 26 Ekim 2026, kimlik: kalıcı PDF teslimi ve hesap silme tercihi (codex/belge-teslim)

O6 teknik hat tamamlandı: satın alma anındaki onaylı Türkçe sürüm ve alanlar snapshot olarak doğrulanır;
PDF yalnız hash ve tam belge takımı kontrolünden geçen kayıttan üretilir. Gömülü DejaVu Sans, 12 punto,
sayfa bölme ve sayfa numarası vardır. SMTP PDF eklerini taşır; sağlayıcının alıcıyı kabul etmesi ve
messageId dönmesi sonrasında teslim kaydı yazılır. Gönderim yoksa, kayıt eksikse veya bozuksa iş hata
verir; genel ödeme metniyle tamamlanmaz. Order kilidi paralel gönderimleri sıralar, kayıtlı teslim
tekrarı göndermez. SMTP kabulü ile DB commit atomik değildir; bu aralıktaki hata aynı Message-ID ile
tekrar denemeye yol açabilir, sağlayıcı seviyesinde tam bir kez teslim garantisi verilmez.

Kendi siparişinin kalıcı metinlerine erişim ucu private/no-store ve IDOR kontrollüdür. O9 silme ekranı
wallet API'den gerçek bakiye ve kullanılmamış paket toplamını gösterir. İade tercihi strict DELETE gövdesiyle
users.deletion_request_refund alanına silme durumu ile aynı güncellemede yazılır ve kancaya iletilir.
Gövdesiz eski istemcilerde varsayılan true. Ödeme ajanının atomik checkout ve günlük tercih kurtarma
entegrasyonu bu dalın bağımlılığıdır; ödeme dosyaları o ajanın commitlerinden alındı.

Doğrulama: web 92 geçti/1 mevcut skip, worker 43 geçti (SMTP alıcı kabulü/ID sınırları dahil), ledger 134 geçti; sonra eklenen onaylı alıntıyı
koruma testiyle belge hedefli 7 test geçti. Web ve worker üretim derlemesi, tipler ve değişen kod lint
kontrolü geçti. PDF iki sayfa Poppler ile render edilip gözle incelendi; metin çıkarımı Türkçe glifleri,
12.00pt alt sınırını ve gömülü fontu doğruladı. Silme ekranı 375/768/1440px, mock wallet ve iade opt-out
isteğiyle doğrulandı; yeni bölümün WCAG2A/AA ve 2.1AA axe sonucu 0. Yerel kanıtlar Codex
visualizations/2026/10/25/01a1736a-3c34-7d40-ae4e-8f8808e87e0c/belge-teslim dizinindedir.

Canlı gönderim yapılmadı. Hukuki taslak/yayım kapısı korunur; ADR-0027 ve hukuki yayım onayları hâlâ
beklenir. Root katkısı: worker direct PDF bağımlılıkları, font build kopyası ve Docker font yolu.
## Dalga 1, ödeme, checkout snapshot ve silme tercihi entegrasyonu, 2026-10-26

Durum: `codex/odeme-snapshot-deletion`; şema 0005/mimar `1b49422` ve snapshot helper/kimlik
`db10a07` bağımlılıkları dala birleştirildi. Ödeme uygulaması `47ce6c4` kimliğe iletildi.
Checkout önce kabul edilen metin sürümünü, gerçek tutarı ve alıcı alanlarını dondurur; draft,
eksik alan veya değişen sürüm sağlayıcı formu açılmadan reddedilir. Sunucu production context'i
snapshot factory olmadan checkout açmaz. Paket ön bilgi+mesafeli satış, abonelik ön bilgi+abonelik
takımı, kaynak ve dolu metin SHA-256 özetiyle saklanır. PDF/worker belge dosyalarına dokunulmadı.

`PgBillingStore.saveCheckout`: order, tüm consent satırları ve freezeOrderLegalDocuments aynı
transaction client'ıyla yazılır; hatada tamamı rollback olur. Özel snapshot satırı içerebilen SQL hata
detayları API/log hatasına taşınmaz. İdempotent checkout replay mevcut order sonucunu kullanır;
geçmiş belge güncel dosyadan üretilmez. Depo helper'ı runtime kullanıldığı için ledger `@kazuist/db`
bağımlılığı dev'den runtime'a alındı; yalnız ledger lock importer taşıması orkestra yetkisiyle yapıldı.

`onAccountDeletion(userId,{requestRefund?:boolean})`: false seçimi canlı abonelik iptalini korur,
iade talebi açmaz. Seçim verilmezse users.deletion_request_refund okunur (varsayılan true).
Günlük kurtarma false tercihli yalnız paket hesabını seçmez; canlı aboneliği varsa iptal eder.
Tercihin kullanıcı silme kaydıyla atomik yazılması kimlik ajanındadır.

Kanıt: önce snapshot takım kaydı ve rollback testleri 2 kırmızıydı. Son PGlite 6/6, web factory 2/2;
ana senaryolarla hedefli 20/20. Tam Node workspace 626 geçti, 3 ortam testi atlandı; typecheck,
lint ve check:text yeşil. Build ilk turda DB barrel'in migration URL çözümü nedeniyle kırıldı;
mimar c2f7b95 alt yol export'u ve ödeme 37ac0f6 import düzeltmesiyle yeniden build geçti.
Gerçek ödeme/ağ/sır çağrısı yok. O8 rapor/mutabakat işi orkestradadır.

## 25 Ekim 2026, güvenlik bağımlılık düzeltmesi (codex/guvenlik-bagimlilik)

O-09 tarama hataları artık kapıyı kapatır; CLI ikizleriyle kırmızı/yeşil regresyon kanıtı var. pypdf6.21.2,
setuptools84.2.1 ve optimum bağımlılığı kaldırılarak transformers5.16.1: gerçek all-extras pip-audit 0.
Python145 geçti/1 optional skip; küçük offline ONNX dinamik şekil testi yeşil. Akdeniz50belge eski/yeni
runtime PERSON440/440 eş; Hushmark402paragraf span1.0. GLiNER yeni-yığın tam export disk28 nedeniyle
geçmedi; yeni Torch vs mevcut ONNX20belge span1.0 (150span), skor fark2e-5. CI/final tam tarama ve bağımsız denetim bekleniyor, birleşmedi.
Kanıt ve açık işler: docs/istekler/kalite-bagimlilik.md. Eski model cache ve runtime kodu değişmedi.

## Orkestra güncel durum, 26 Ekim 2026

Main f41457d temiz; PR35/36/37/39/40 dört completed/success CI işi sonrası birleşti. Beş ADR onayı kaydedildi, plan düzeltildi, iyzico aktivasyon e-postası kayıtlı hesaptan26Ekim00:32 gönderildi ve Gönderilenler doğrulandı. Gerçek readonly sandbox raporuyla kimlik/kısmi iade eşlemesi düzeltildi; bağımsız O-N4 sayfalama açığı da kapandı.

PR38(schema/ADR27),41(checkout/deletion),42(PDF/delivery/UI) birleşik43adayında9c37234 tabanında toplandı. Root bütün workspace test/tip/lint/metin/build kontrollerini geçirdi; ledger144, DB35, contracts121, web94, worker43. Yeni esbuildyaması44 ayrıca adayda birleştirildi; son CI/bağımsız kalite beklenir. ADR27 onayı henüz yok; üretim migration ve hukuki yayım yapılmaz.

Bağımsız denetimin O6yer tutucu gösterim ve O9silme iadesi yönetimi kalanları için kimlik/ödeme/mimar ayrı worktree'lerde sürüyor. İade yönetimi yeni ADR28 önerisi gerektirir; kabul varsayılmaz. Güncel gate5/9; staging, gerçek uygulama sandbox, stagingbağlayıcıları ve hukuki hazırlık açık. Künye üç alanı henüz boş, değerler yazdırılmadı. Tek kullanıcı listesi docs/istekler/orkestra-onaylar-2026-10-25.md. Dalga2 başlamadı.

# Devir kaydı

En üstteki bölüm günceldir. Her ajan işini bitirince kendi bölümünü en üste ekler.

## Dalga 1, mimar, kalıcı belgeler ve ürün sürümleri (codex/mimar-kalici-belge), 2026-10-26

PR #38 açık, birleştirilmedi. Sözleşme/db 1.3.0; ADR-0027 öneri, Tarık onayı bekliyor.
Migration0005: ürün kodu tekilliği kalkar, birleşik sürüm tekilliği ve eski ürün UUID ilişkileri kalır;
ürün finansal sürüm alanları değişmez. Kalıcı sipariş belgeleri, SHA-256/sürüm/sahiplik denetimi,
değişmez sağlayıcı kabul kanıtı ve silmede kalıcı iade tercihi eklendi.

`@kazuist/db` freezeOrderLegalDocuments ve recordOrderLegalDocumentDelivery mevcut transaction client alır.
Entegrasyon ayrıntısı `docs/istekler/mimar-kalici-belge-entegrasyonu.md`.
Main PR35 D4 uyumu ve PR37 güvenlik/onay önkoşulları dala alındı; önceki ON CONFLICT(code)
uyumsuzluğu kapandı. Orkestra yetkisiyle ledger D4 testindeki elle DROP satırı IF EXISTS yapıldı;
aynı test 0004 ve 0005 üstünde çalışır.
Doğrulama: DB35/35, contracts121/121; tam Node616 geçti,3 ortam testi atlandı.
Build, tüm typecheck, lint, OpenAPI lint ve check:text geçti. Gerçek Docker/PostgreSQL ölçümü
PR CI'da; dört iş yeşil olmadan birleşmez. Canlı migration ve hukuki yayın yapılmadı.
ADR0027 onayı önceki beş ADR onayından ayrıdır.
## Orkestra, ADR onayları ve teknik açıklar, 26 Ekim 2026

Kullanıcı ADR-0021/0022/0023/0024/0026 kararlarını ve runbook'taki iyzico aktivasyon taslağının gönderimini açıkça onayladı. ADR durumları ve plan 4.5 eşit bölüşüm/gönüllü bildirim atıfları güncellendi. Hukuki yayım onayı verilmedi; künye kullanıcı tarafından doldurulacak. İyzico taslağı kayıtlı hesaptan 26 Ekim 00:32 gönderildi ve Gönderilenler doğrulandı; yanıt bekleniyor. GLiNER yeni export20belge span eşliği1.0; CI37 tam tarama0. Kanıt kalite-bagimlilik isteğinde.

PR #35 (8ee22e9) ve #37 (ef4479a), dörder tamamlanmış yeşil CI işiyle main'e alındı. PR #37 beş ADR kabulünü ve plan düzeltmesini de içerir. Teknik işler ayrı worktree'lerde sürüyor: mimarda kalıcı belge/fiyat sürümleme migration 0005 ve ADR-0027 önerisi, güvenlikte hata yutan tarama ve Python bağımlılık düzeltmeleri, kimlikte PDF/hesap silme entegrasyonu. Yeni ADR-0027 onaylanmış sayılmaz; üretim migration'ı uygulanmaz. Dalga 1 kapısı son ölçümde 5/9, sonraki dalga başlamadı. Biten PR'lar yalnız dört CI işi yeşil tamamlanınca birleştirilecek.
## Dalga 1, ödeme, süresi dolmuş rezervasyon property regresyonu, 2026-10-26

Seed `944090688`: 2 promosyon kredisi, iki ayrı 1 kredilik rezervasyon, 5 dakika ilerleme,
aynı ilk işlem anahtarını tekrar ayırma. `reserve` önce her iki süresi dolmuş tutmayı çözer,
sonra eski anahtarı `already_settled` ile reddeder. Yeni rezervasyon veya tüketim oluşmaz.
Eski property testinin reddedilen komutun en fazla bir transaction yazabileceği varsayımı yanlıştı.
Üretim defter kodu değişmedi. Test artık hata sonrasında yalnız süresi dolmuş eski rezervasyonların
çözümünü ve süresi dolmuş promosyonların temizliğini kabul eder; rezervasyon anahtarları daima tekildir.
Minimal dizi önce kırmızıydı (2 > 1); düzeltme sonrası tam ledger 128/128, typecheck ve test eslint temiz.
PR #35 mevcut yeşil head ile birleştirildi; bu test değişikliği ayrı PR'dadır.

## Dalga 1, ödeme, D3 ve D8 teknik kapanış, 2026-10-25

Durum: `codex/odeme-aciklar`, PR #35 açık; main `1ffbe56` tabanı. Plan 4 ve 9.
D3: fesih/iade istemci anahtarı kullanıcı+işlem bazında kalıcı `idempotency_keys` kaydına ve
hedef dahil gövde SHA-256 özetine bağlandı. Başarılı aynı istek özgün sonucu döndürür; farklı
hedef/mod/gerekçe 409. Çalışan aynı istek 409 verir, tamamlanınca tekrar özgün sonucu alır.
PostgreSQL'de özel havuz oturumunda advisory lock işlem süresince tutulur; süreç ölünce PG
kilidi bırakır, aynı gövdeli sahipsiz pending kayıt iş akışının mevcut iade/fesih korumalarıyla
sürdürülür. Hata sonrası gövde bağı kaybolmaz. Havuzda defter/iş sorguları için bağlantı ayrılır.
Kaynak: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

D8: `/v1/coupons/redeem`, `/v1/admin/chargebacks`, `/v1/admin/price-changes` gerçek servise bağlı.
Admin işlemlerinde yönetici rolü+passkey+TOTP, actor denetim kaydı, hız sınırı, strict zod ve
kalıcı istek anahtarı vardır. Kupon mevcut defter idempotency ve tüketim limitiyle işler.
D4 ikinci migration isteği `docs/istekler/odeme-d4-urun-fiyat-surumu.md`; DB/contracts değişmedi.
Mimar 0005 öncesinde ödeme uyumu bu PR'da: katalog `(code,price_table_id)` çatışma anahtarını kullanır,
aynı sürümün fiyat/kredi/işlem içerik değişimini reddeder; eski order/sub product UUID'si korunur,
yeni sipariş işlem tarihindeki sürümü seçer. İlk abonelik ürünü siparişten taşınır; planRef sürüm bazlıdır.
D4 önce iki yeni test kırmızıydı; son odaklı test 23/23 ve ledger typecheck geçti.
0005 ve hesap silme tercihi/PDF snapshot bağlantıları sonraki ayrı entegrasyondadır.

Kanıt: önce D3 hedefli regresyon 2 başarısız/14; D8 route henüz yokken import hatası.
Düzeltme sonrası odaklı memory 14/14, PGlite 7/7, gerçek guard+servis route 2/2 geçti.
Sahipsiz pending, ayrı depo örnekleri, replay, gövde çatışması, havuz kapasitesi ve kilit bırakma sınandı.
Tam test turu (son iki lock recovery testi öncesi) 601 geçti, 3 ortam testi atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti. Son lock değişikliğinde
ledger typecheck ve küçük hedefli testler yeniden geçti. Disk sınırı nedeniyle yeni büyük build koşulmadı.
Gerçek PostgreSQL session termination testi yerelde yapılmadı; pool yolu protokol taklidi/PGlite ile sınandı.
O8 gerçek sağlayıcı rapor çağrısı orkestradadır; sır veya ağ ödeme çağrısı yapılmadı.
PDF/sözleşme ve worker notice dosyalarına dokunulmadı. Tarık'tan yeni adım gerekmiyor.

## Orkestra devralma ve Dalga 1 yeniden ölçümü, 25 Ekim 2026

Devir alındı. Önceki iki ajanın günlükleri kullanım sınırında durduklarını gösterdi; mimarın kaydedilmemiş
çalışması korunarak tamamlandı. PR #30, #31, #33 ve #32 dörder tamamlanmış yeşil CI işiyle squash
birleştirildi. Son ürün main `219b903`; denetlenen birleşik aday `4457292` ile ürün kodu farkı yok.
CI kanıtı: https://github.com/tialkan/kazuistcom/actions/runs/40202875693.
Son main 219b903 push CI: https://github.com/tialkan/kazuistcom/actions/runs/40203467801, dört iş başarı.

- İki ana iş tamam: ödeme üçüncü denetim ve cevap şekli fikstürleri (#30), sözleşme 1.2/migration 0004 (#31).
- Ek düzeltmeler: teknik iyzico hatasında incelemenin korunması, paket kredili silinmiş hesap kurtarma,
  abonelik onaylarının gerçek form/servis kaydı (#33); ayrıntılı ödeme e-postası, yönetim iade uçları ve
  yalnız genel metin kullanan dış push kanalları (#32).
- Bağımsız son denetim: defter 120, form 3, bildirim 16, yönetici iade yetkisi 8; toplam 147 test geçti.
  Kalite, aynı kontroller ve enjeksiyon 60 ile 207 test doğruladı. D6 migration korumaları 27 testle teyitli.
- Güncel kapı `docs/kalite/dalga-1.md`: 5/9 geçti. Staging, gerçek uygulama sandbox kabulü, staging
  bağlayıcıları ve hukuki hazırlık açık; Dalga 2 başlamadı.
- Ödeme denetimindeki kritik/yüksek bulgular kapalı; orta O6/O8/O9, düşük D3/D4/D8/D9/D-N2/D-N7 sürüyor.
  Bu sayım bağımlılık güvenliğini kapsamaz: Python bulguları ve tarama hata kodu O-07/O-09 olarak açık.
- Sandbox fikstürü gerçek uygulama uçtan uca kabulü değildir. Abonelik 100001 cevabının sebebi kesin değil;
  resmî aktivasyon/durum teyidi e-postası için gönderilmemiş taslak runbook'ta hazır.
- Güncel tek kullanıcı listesi `docs/istekler/orkestra-onaylar-2026-10-25.md`: beş ADR, sandbox hesap adımı,
  eksik künye. `~/Desktop/kazuist-kunye.txt` boş alanlı şablon olarak izin 600 ile hazırlandı.
- ADR onayı alınmış sayılmadı; plan, sürüm etiketi, DNS, canlı ödeme, canlı veri ve App Store değiştirilmedi.
  Eski worktree'ler korundu. Aşağıdaki ajan kayıtlarındaki eski PR durumları tarihsel kayıttır.

## Dalga 1, kalite-guvenlik, yeniden ölçüm, 2026-10-25

Dalga 1 kapısı kapanmadı: 5/9 geçti. Güncel kanıt ve dokuz hüküm `docs/kalite/dalga-1.md` en üstünde; 22 Ekim ölçümü tarihsel korundu. Son ürün main219b903; aynı ürün ağacındaki birleşik4457292 CI40202875693 dört işte yeşil, HTTP72/E2E108 geçti, yükleme20 atlandı. Birleşik 4457292 yerel kalite kontrolü ledger120, notify16, web gate3/admin8 ve enjeksiyon60 geçti. Gerçek staging, uygulama uçtan uca sandbox, beş bağlayıcının staging çalışması ve hukuki hazırlık açık. O-07 Python runtime/extra bağımlılık bulguları ile O-09 tarama exit-kodu açığı raporlandı; yeşil CI bu açıklıkları kapatmaz. Yeni ürün kodu değiştirilmedi.

## Dalga 1, ödeme, dördüncü denetim düzeltmeleri, 2026-10-25

Durum: `codex/odeme-denetim4`, PR açılacak; birleştirme orkestrada ve yeşil CI sonrasında.
Plan 4.5/12 ve 9: Y-N7 için yalnız belgelenmiş 10051/10005 kart retleri siparişi kapatır;
teknik/bilinmeyen `status: failure` sipariş ve kupon durumunu korur, günlük yeniden sorgu hata alarmı üretir.
5122/5124 ödenmemiş token davranışı korundu. Resmî kaynak: https://docs.iyzico.com/ek-bilgiler/hata-kodlari
(2026-10-25 doğrulandı; hata kodu aralığına genelleme yok).
O9: canlı aboneliği olmayan, kullanılmamış paket kredili silinmiş kullanıcı da kurtarma işine alınır;
eski talepler korunur, eşzamanlı yeniden denemeler deterministik UUID ve PK ile tek iade talebi açar.
O5: abonelikte ayrı cayma kutusu API gövdesine taşınır ve sunucuda zorunlu doğrulanır; yıllık taahhüt,
`content/hukuki/tr/abonelik.md` içindeki ayrılmaz bölüm olduğu için aynı metnin sürümüyle gönderilir,
sunucuda doğrulanır ve `yillik_taahhutname` onayına yazılır. Yeni hukuki metin veya sözleşme alanı eklenmedi.
Kırmızı kanıt: önce Y-N7/O9 regresyonları 2 başarısız / 118 test; düzeltme sonrası 119/119 ledger testi geçti.
Son ek 10005 testi dahil ledger 120/120 geçti; PGlite yeniden kontrolü 4/4 geçti.
`pnpm test`: 588 geçti, 3 ortam gerektiren test atlandı (son ek 10005 testi öncesi).
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti; web ödeme gate 3/3.
Gerçek sandbox çağrısı, sır erişimi veya canlı işlem yapılmadı. O6 hukuki metin/PDF/e-posta işi ve önceki
diğer bulgular bu kapsamda kapandı sayılmadı. ADR/hukuki yayın onayı orkestranın birleşik listesinde kalır.

## Dalga 1, mimar, ikinci istek turu (dalga-1/mimar/istekler-2), 2026-10-25

Durum: PR açık, birleştirilmedi. Sözleşme v1.2; ADR-0026 ve güncellenen ADR-0024 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md (ikinci tur).

Doğrulama (güncel main ve PR #30 ile): `pnpm test` 585 geçti, 3 ortam gerektiren test atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm contracts:lint`, `pnpm check:text`, `pnpm build` geçti.
Python `uv run --project services/worker-py pytest services/worker-py/tests -q`: 86 geçti.
Migration testleri 27/27; v1.1 verisinden yükseltme ve defter/parça tetikleyicileri dahil.
Dal commitleri `gitleaks git --redact --log-opts='origin/main..HEAD'` ile temiz.
IFN gövdesi PR #30 ile eşlendi (`paymentId`, `fraudStatus`); `orders.status` CHECK eklenmedi.
Gerçek servisli Docker ölçümü CI'da yapılacak; yerel ortamda Docker yok.


- Migration `0004_v1_2_ledger_guards.sql`: D6 tetikleyicileri (`ledger_transactions` değişmez, `credit_lots` yalnız
  `remaining_credits`), `products (code, price_table_id)` tekil (D4 genişletme adımı), `payments.status` ve
  `notices.kind` CHECK'leri NOT VALID, `records.masked_text` tetikleyicisi (parçaları siler, `embed.chunks` atar).
  v1.1 verisinden yükseltme testi `packages/db/test/migration-0004.test.ts`.
- Dikkat: `credit_lots` ve `ledger_transactions` üzerinde UPDATE, DELETE veya TRUNCATE yapan kod ya da test artık
  hata alır; düzeltme ters kayıtla yapılır.
- Dikkat: `records.masked_text` her değiştiğinde o kaydın parçaları silinir; masked_text yazan her üretici bunu
  bilmeli (aynı metni yeniden yazmak tetiklemez).
- D4 daraltma adımı ve iki CHECK'in VALIDATE edilmesi sonraki migration'lardır (odeme deposu ve staging verisi).
- OpenAPI: iki iyzico dönüş ucu yalnız 303 döndüğü için `.redocly.lint-ignore.yaml` (lint) ve `redocly.generate.yaml`
  (üretici) içinde açık istisna; başka istisna eklenmemeli.
- worker-py `ner-runtime` ekstrası kilitli; imaj işi altyapıda.
- Orkestra talimatıyla değişen sahip dışı dosyalar: `apps/web/src/app/(odeme)/odeme/page.tsx`,
  `odeme/donus/page.tsx` (tekil main), `services/worker-py/pyproject.toml` ve `uv.lock` (ner-runtime).

## Dalga 1, kimlik, ödeme bildirimleri ve bekleyen iadeler, 2026-10-25

Y-N8: ödeme ayrıntısı yalnız e-postada; Web Push ve APNs genel metni kullanır. Önce kırmızı
regression tutar/tarih sızıntısını üretti, düzeltmeden sonra iki push ve e-posta aynı testte doğrulandı.
Worker 34 test, typecheck, build, ESLint ve check:text geçti.

Y5: notify dispatch ödeme referansını gerçek tutar/tarih ve hemen veya dönem sonu fesih metnine bağlar;
yalnız renderer null dönerse genel metne düşer. O-N1: sözleşme 1.2 bekleyen iade listesi ve karar uçları
kimlik guard üzerinden yönetici, passkey, ikinci adım ve hız sınırıyla bağlıdır. Karar servisinde aktör
kimliği denetim kaydına aktarılır; sonuçlanmış iadede 409 döner.

Doğrulama: web 86 test geçti, 1 mevcut atlandı; worker 33 test geçti. Her iki uygulamada typecheck
ve üretim derlemesi, değişen kodda ESLint/Prettier geçti. O6 PDF eki bu işte uygulanmadı.

## Orkestra devri, 2026-10-25

Orkestra yeni oturuma devredildi. Devralan oturum önce `docs/ORKESTRA-DEVIR.md`'yi okur; başlangıç metni o dosyanın 11. bölümündedir.

## Dalga 1, kalite-guvenlik, kapı raporu (dalga-1/kalite-guvenlik/kapi), 2026-10-22

### Durum

PR açık, birleştirilmedi. Rapor `docs/kalite/dalga-1.md`: Dalga 1 kapısı kapanmadı (9 maddeden 3 geçti).
Açık kritik: K-01 (oturumlu statik uçlar üretimde 500, kimlik), ödeme denetimi K1 ve K2 (odeme). Açık
yüksek: Y-01 (güvenlik başlıkları ve CSP yok, altyapi), ödeme denetimi Y1-Y7 (Y7 için PR #18, teyit bekliyor).
Staging, iyzico sandbox anahtarı ve gerçek YZ sağlayıcı anahtarı olmadığı için ilgili maddeler "veri yok".

### Bilinmesi gerekenler

- Testler: `tests/e2e` (Playwright, axe), `tests/security/http` (başlıklar, erişim, yetki ve IDOR, CSRF,
  hız sınırı, yükleme saldırıları), `tests/security/enjeksiyon` (vitest, sunucusuz), `tests/security/tarama`
  (gitleaks, audit, pip-audit, lisans). `tests/e2e` ve `tests/security` workspace dışı paketlerdir:
  `pnpm --dir <yol> install --ignore-workspace`; kök kilit dosyası değişmedi. CI'a bağlama isteği
  `docs/istekler/kalite-ci-e2e.md`. Çalıştırma: `docs/kalite/README.md`.
- Testler çalışan bir sunucuya karşı koşar (varsayılan http://localhost:3300). Yerelde Homebrew
  PostgreSQL 18 ve pgvector ile geçici küme ve Redis kullanıldı; migration 0000-0003 ve db-smoke geçti.
- Kırmızı testler bulgudur, gevşetilmedi: e2e 5, güvenlik 18, enjeksiyon 6. Yükleme saldırıları uçlar
  (yazma, Dalga 2) açılınca kendiliğinden çalışır.
- K-01 doğrulaması için `guard.ts` yerelde geçici olarak değiştirilip geri alındı; dala girmedi.
- İş listesi: `docs/istekler/kalite-*.md` (kimlik oturum uçları ve kararsız test, güvenlik başlıkları,
  yz-gecidi maskeleme, hukuk-uyum taslaklar, on-yuz bağlantılar, seo erken geçiş, CI, bağımlılık).

### Sonraki adım

Sahip ajanlar K-01 ve Y-01'i kapatınca `tests/e2e` ve `tests/security` yeniden koşulur ve rapor
güncellenir; staging kurulunca aynı testler `KAZUIST_E2E_BASE_URL=https://staging.kazuist.com` ile ve
ZAP, k6 (Dalga 2 uçlarıyla) ve Ek I robotları çalıştırılır.

## Dalga 1, anonimlestirme, NER karşılaştırması ve bağlama (dalga-1/anonimlestirme/ner), 2026-10-21

### Durum

PR açık, birleştirilmedi. Kazanan yapılandırma kural katmanı + akdeniz27 (`KAZUIST_NER_BACKEND=akdeniz27`);
rapor `eval/anon/raporlar/dalga-1-ner.md`. Ölçüm yalnız sentetik set ve elle yazılmış zor sette yapıldı; 15.3/2
yayın kapısı geçmedi sayılır (200 gerçek kararlık set yok).

### Bilinmesi gerekenler

- Ağırlıklar depo dışında: `~/.cache/kazuist-ner/src/<aday>` (sürümü sabit indirme, sha256 doğrulandı) ve
  `~/.cache/kazuist-ner/<aday>` (ONNX, `kazuist_manifest.json`). Yeniden üretim (services/worker-py):
  `uv sync --extra ner`, sonra `uv run python ../../eval/anon/export_ner.py`. savasy indirilmedi.
- Hushmark'ın indirilen yükleyicisi incelendi (ağ, alt süreç, eval/exec, pickle yok); yalnız dışa aktarmada
  eşdeğerlik referansı olarak çalıştı. Çalışma zamanı onu yüklemez; Hushmark ve akdeniz27 yalnız onnxruntime,
  tokenizers ve numpy ister (torch gerekmez). GLiNER gliner paketini ve torch'u ister.
- `KAZUIST_NER_BACKEND` boşsa yalnız kural katmanı çalışır (`ner.none`); verilip model ya da bağımlılık yoksa
  işçi başlamaz (core/main.py "startup failed"), sessizce zayıf moda düşmez. `+` ile birleşim verilebilir.
- `ENGINE_VERSION` anon-0.2.0; sürüm dizesi `anon-0.2.0+ekE-2026.10.0+ner.akdeniz27@99995f7`. Model veya
  normalizasyon değişince kayıtlar yeniden işlenmeli (plan 6.4/7).
- Model PERSON span'ları normalize edilir (satır sonu, "ve", "ile", virgülde bölme; unvan ve rol sözcüğü,
  ticaret unvanı sözcüğü ayıklama). Normalizasyon hiçbir ad karakterini açmaz: altın span testi ve
  `compare_ner.py --raw-spans` denetimi bunu gösterir.
- `records.masked_text` (sözleşme v1.1): yayımlanabilir sonuçta span'larla aynı işlemde yazılır, editör kuyruğu
  açıksa NULL; `embed.chunks` yalnız yazıldığında `embed:<recordId>` anahtarıyla kuyruğa girer. Editör onayı
  sonrası masked_text yazımı (editör ekranı) henüz yok.
- İstekler: `docs/istekler/anonimlestirme-ner-calisma-zamani.md` (orkestra: `ner-runtime` extra; altyapi:
  model birimi ve ortam değişkenleri), `docs/istekler/anonimlestirme-embed-payload.md` (mimar: payload şeması,
  eski parçaların silinmesi).

### Sonraki adım

ADR-0022 onayıyla 200 gerçek kararlık setin etiketlenmesi; modellerin Türkiye sunucusuna kurulup gecikmenin
orada `compare_ner.py --threads <n>` ile ölçülmesi; gerçek sette kaçak analizi (Dalga 3).


## Dalga 1, mimar, sözleşme istekleri (dalga-1/mimar/istekler), 2026-10-20

Durum: PR #10 açık, birleştirilmedi. Sözleşme v1.1; ADR-0021, ADR-0022, ADR-0023 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md; her istek dosyasının sonunda "Sonuç".

- Sözleşme: `CONTRACT_VERSION = '1.1.0'` (openapi.yaml, package.json ile testle eşit). Yeni modüller
  `packages/contracts/src/account.ts` (rıza, KVKK, kaldırma, kuyruk adları), `jobs.ts` (iş payload şemaları,
  bildirim türleri), `legal.ts` (hukuki metin yayın kapısı). Üretilmiş tipler yenilendi.
- Uyumsuz üç değişiklik (v1 hiçbir ortamda yayımlanmadı, istemci yok): `GET /v1/me/export` 200 ve dosya,
  `POST /v1/me/edu-verification` 204, `POST /v1/takedown-requests` gövdesi `kind/targetType/targetId`.
  v1.1 etiketinden sonra katı semver.
- Veri tabanı: `packages/db/migrations/0003_wave1_requests.sql` yalnız ekler; iki elle düzeltme var
  (eski `payments_provider_uq` yeni kısmi dizinden sonra düşer; `takedown_requests.target_id` önce doldurulur)
  ve sonda rol tohumu. v1 verisi olan veri tabanında yükseltme testi `test/migration-0003.test.ts`.
  Yeni enum değerleri aynı migration içinde kullanılmaz (ALTER TYPE ADD VALUE işlem içinde).
- `records.masked_text`: sunulabilir tek metin; NULL ise kayıt sunulmaz ve dizinlenmez. Yazan: anon.run
  (anonimleştirme) ve norm kayıtları için ingest (veri toplama). İkisi de yönlendirildi.
- Drizzle tek kopya: kök `pnpm-workspace.yaml` overrides ve `dedupePeerDependents`;
  `packages/db/test/single-drizzle.test.ts` kilit dosyasını denetler. `orm.ts` kaldırılabilir, kimlikte.
- `/api/health`: `src/server/deps.ts` (paylaşılan pg.Pool ve iovalkey istemcisi, globalThis), `src/instrumentation.ts`.
  Yoklamalar instrumentation kaydı olmadan "not wired" ile 503 verir; bu bilinçli.
- worker-node: `runner.ts` (LISTEN, yoklama, bayat kilit, SIGTERM), `handlers.ts` (kayıt, `unavailableBilling`,
  `dailyBillingTick`), `scripts/build.mjs`. Billing gerçek depo gelene kadar `BillingStoreUnavailable` ile
  kapalı başarısız; günlük zamanlama kapalı. notify.send `APP_URL` yoksa kayıtlı değildir.
- worker-py: `python -m core.main`; anon.run kendi işleminde. Eski `core/worker.py` kullanılmıyor (veri-toplama
  kararı). İmaj `docs/kaynaklar`'ı içermediği için kaynak kayıt defteri imajda boştur (yönlendirildi).
- Doğrulama sınırı: yerelde Docker ve pgvector yok; migration 0003 gerçek PostgreSQL 18'de yalnız CI docker
  işinde uygulanır. Yerelde PGlite (PostgreSQL 18 wasm) ve Homebrew PostgreSQL 16 ile Redis 8 kullanıldı.
- Sonraki adım: Tarık ADR onayı; orkestra `mimar-yonlendirme-*.md` işlerini dağıtır; onaydan sonra
  `contracts-v1.1` etiketi.

## on-yuz, Tarık onayları (dalga-1/on-yuz/onaylar), 2026-10-20

Kaynak: docs/kararlar.md, 2026-10-20 satırları. Durum: PR açık, birleştirilmedi.

- Künye: `apps/web/src/app/(kabuk)/_kabuk/kunye.ts` içinde `dogrulandi: true`, `kaynakNotu: 'Tarık onayı 2026-10-20, mevcut site /tr/hakkinda'`. Değerler arşivlenmiş /tr/hakkinda ile birebir (test: `fiyatlar/fiyatlar.test.ts`). Alt bilgi e-postası kulularteknoloji@gmail.com.
- /fiyatlar: TASLAK notu, `fiyatlar.taslak` i18n anahtarı ve `.taslak-notu` stili kaldırıldı; `fiyatTablosuSurumu = '2026-10-20'`. Tablo değerleri plan.md 4.2-4.4 ile test ediliyor; plan tablosu değişirse test kırılır ve `fiyatlar.ts` birlikte güncellenmeli. Hukuki metinler taslak kalır.
- Casuist görselleri: orijinaller https://kazuist.com/<dosya> adresinden salt okunur indirildi (kazuist-baslik.webp 1600x900, tubitak.svg, eureka.png 560x147, eurostars.png 380x283, hacettepe-logo.png 1359x2000, aybu-logo.png 185x272; sha256 değerleri `gorselleri-donustur.mjs` çıktısında). `apps/web/public/casuist/` altında AVIF ve WebP (başlık 640/960/1280/1600w; Eureka 150/300w; Eurostars 78/156w; üniversite logoları 16/22/32/44w), TÜBİTAK SVG olarak değiştirilmeden. Toplam yaklaşık 290 KB.
- Akış: `donustur.py` artık img için özgün `src`'yi (Next.js görüntü URL'si açılmış) JSON'a yazar; `_bilesen/gorseller.ts` bu yolu yerel dosyalara eşler; `Dugum.tsx` `<picture>` (AVIF kaynak, WebP img, width/height, lazy; başlık eager ve fetchpriority high) basar. Eşlemesi olmayan görsel yine yer tutucu olur. Logolar arşivdeki yükseklikte, kendi en-boy oranıyla çizilir (TÜBİTAK 47x58, Eureka 152x40, Eurostars 78x58, Hacettepe ve AYBÜ 22x32 ile 16x24). Başlık görseli alt metni i18n'de `casuist.gorselAlt.kazuistBaslik`; logolarda arşivdeki özel adlar alt metindir.
- Görselleri yeniden üretmek için: orijinalleri boş bir klasöre indirip `NODE_PATH=<sharp içeren dizin> node docs/tasarim/casuist-arsiv/gorselleri-donustur.mjs <klasör> apps/web/public/casuist`.
- Ekran görüntüleri: değişen sayfalar (/en, /tr, /partner, /tr/ortak (yeni), /eski, /fiyatlar) 375/768/1440 px yenilendi; axe 42 ölçümde ihlal 0, yatay taşma 0. Betik tembel görselleri çekimden önce yükler. Lighthouse bu işte çalıştırılmadı.
- Not: başlık görselinin YZ ürünü olmadığı ve logo kullanım izni Tarık beyanına dayanır (docs/kararlar.md); `apps/web/public/casuist/**` sahiplik tablosunda yok, orkestra on-yuz'a eklemeli.

## Dalga 1, orkestra birleştirmesi, 2026-10-20

PR #1-#8 main'de, CI yeşil. Kapı henüz kapanmadı (kalite-guvenlik raporu bekliyor). Aşağıdaki bölümler ajanların PR açıklamalarındaki DEVIR notlarıdır.

### on-yuz (PR #8)


Dalga 1, on-yuz, 2026-10-20. Durum: PR açık, birleştirilmedi. Bileşenler `@kazuist/ui`'dan (stil: `@kazuist/ui/components.css`, layout'ta yüklü); metinler prop ile verilir, bileşen içinde sabit metin yok. Kenar şerhi: `<SerhliMetin><SerhSatiri serhEtiketi=... serh={<KaynakCipi .../>}>cümle</SerhSatiri></SerhliMetin>`. Etiket türleri ve şekilleri `etiketSekli`'nde; yeni etiket eklerken benzersiz şekil testi korunmalı. Kabuk her sayfayı sarar; modül sayfası kendi `<main>`'ini açmaz, sayfa kapsayıcısı için `.sayfa` sınıfı kullanılabilir. Casuist içeriği yeniden çekmek için: docs/tasarim/casuist-arsiv'e HTML'i yeniden kaydedip `python3 -I docs/tasarim/casuist-arsiv/donustur.py docs/tasarim/casuist-arsiv "apps/web/src/app/(casuist)/_icerik"`. Ekran görüntüleri: üretim sunucusu açıkken `docs/tasarim/ekran-goruntusu.mjs` (başındaki komut; playwright ve @axe-core/playwright NODE_PATH ile verilir, PW_CHROME önbellekteki tarayıcıyı kullanır).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### veri-toplama (PR #7)

- Kapatma anahtarı: ortam `KAZUIST_SOURCE_<AD>=on` (MEVZUAT, RESMI_GAZETE, KVKK, REKABET, OPENALEX, CROSSREF, EURLEX); varsayılan kapalı; `KAZUIST_ENV=production` iken ek olarak kaynak belgesinde `tarik_onayi: onaylandi`.
- Anonimleştirme kancası: karar ve kurul_karari kayıtları `anonymized=false` yazılır, `anon.run {recordId}` kuyruğa girer (anonymizer/job.py ile uyumlu). embed.chunks'ı yalnız anonimleştirme tamamlanınca anonimleştirme tarafı kuyruğa atmalı; bu kod atmaz. Norm ve künye kayıtları `anonymized=true`, sürüm `gerekmez-norm`.
- jurisdiction: yabancı doktrin için "INT" kullanıldı (plan "ülke kodu" der); mimar teyit etmeli.
- Mevzuat fikstürü SENTETİK; sürüm zinciri ileri yönlüdür (geriye dönük RG zinciri editör onaylı ayrı iş). RG tetikleyicisi yalnız kanun numarası içeren başlıklar için ingest.fetch kuyruğa atar; mevzuat künye listesi (başlık, tür, tertip) yok.
- Ham arşiv varsayılanı ./.raw-store (KAZUIST_RAW_DIR); .gitignore'a eklenmesi orkestra işi. S3 için boto3 benzeri istemci enjekte edilir, SDK bağımlılığı eklenmedi.
- Canlı sorgu sayıları: KVKK ve EUR-Lex'te 5 sınırı aşıldı (6), ayrıntı kaynak belgelerinde. Fikstür kayıt sayıları: RG 55 girdi, KVKK 6 liste + 1 özet, Rekabet 4 liste + 1 karar, OpenAlex 1, Crossref 1, CELLAR GDPR 2 madde, Mevzuat 6 madde x 2 sürüm (sentetik).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### kimlik (PR #6)


Dalga 1, kimlik, 2026-10-20. Kimlik çekirdeği apps/web/src/server/auth altında; her hesap ucu withAuth ile korunur, yeni modül uçları da withAuth({ roles, admin, rate }) kullanmalı. Yönetici uçları için `admin: true` passkey oturumu ve /api/auth/step-up ile ikinci adım ister. Bildirim üreticileri jobs tablosuna `notify.send` ve `{ type, userId, refId? }` yazar; kişisel veri yazmaz. Geçici çözümler ve istekler yukarıda. Gereken ortam değişkenleri: BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, MAIL_SMTP_URL, TRUSTED_PROXY_COUNT, AUTH_TRUSTED_ORIGINS, GOOGLE_CLIENT_ID/SECRET, APPLE_CLIENT_ID/SECRET, APPLE_APP_BUNDLE_IDENTIFIER (.env.example mimarındır; istek gerekebilir).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### odeme (PR #5)

Dalga 1 odeme, 2026-10-20. Defter ve kurallar packages/ledger'da saf TS ve PGlite testli; iyzico akışları taklit istemciyle 9.5 Dalga 1 senaryolarını geçiyor. D1 kapandı. Sonraki adım: istek dosyasındaki DB sütunları, PgBillingStore, route bağlama, sandbox anahtarıyla gerçek uçtan uca deneme.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### hukuk-uyum (PR #4)


Dalga 1, hukuk-uyum, 2026-10-20. Durum: taslaklar PR'da, onay bekliyor. Sonraki: Tarık künye ve kararları verir; mimar istekleri işletir; odeme ve kimlik ajanları consent_kind ve metin sürümlerini (ön bilgi version) onay ekranlarına bağlar; on-yuz yayın kapısını (status: taslak ve yer tutucu kontrolü) uygular.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### anonimlestirme (PR #3)


### Durum
Dalga 1 anonimleştirme iskeleti PR'da; birleştirilmedi. Kapı ölçümü yalnız sentetik, NER yok.

### Bilinmesi gerekenler
- pyproject.toml ve uv.lock orkestra dosyası: pyyaml çalışma bağımlılığına taşındı, extras eklendi, testpaths genişletildi (testler sahiplik yolunda, anonymizer/tests).
- review_queue.decision için 'superseded' değeri kullanılıyor; maskeli metnin nerede tutulacağı mimar kararı bekliyor (istek dosyası).
- Sentetik setin şablonları ve kurallar aynı elden; sonuçlar iyimser.

### Sonraki adım
NER adaylarını ölç, en iyisini `KAZUIST_NER_BACKEND` ile bağla, gerçek altın sette kaçak analizi yap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### altyapi (PR #2)


### Durum
Dalga 1 anonimleştirme iskeleti PR'da; birleştirilmedi. Kapı ölçümü yalnız sentetik, NER yok.

### Bilinmesi gerekenler
- pyproject.toml ve uv.lock orkestra dosyası: pyyaml çalışma bağımlılığına taşındı, extras eklendi, testpaths genişletildi (testler sahiplik yolunda, anonymizer/tests).
- review_queue.decision için 'superseded' değeri kullanılıyor; maskeli metnin nerede tutulacağı mimar kararı bekliyor (istek dosyası).
- Sentetik setin şablonları ve kurallar aynı elden; sonuçlar iyimser.

### Sonraki adım
NER adaylarını ölç, en iyisini `KAZUIST_NER_BACKEND` ile bağla, gerçek altın sette kaçak analizi yap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### yz-gecidi (PR #1)

- Durum: geçit kodu ve testleri PR'da; birleştirilmedi.
- Bilinmesi gerekenler: istemci modu sunucuda çalışmaz (RunInput.mode byok_istemci kabul etmez); tarayıcı `createAdapters({ browser: true })` kullanır. restoreLabels varsayılan kapalı; maskeli etiketler gösterime öyle gider. Yedeğe geçiş yalnız ilk çıktıdan önce ve yalnız platform modunda. odeme ajanı LedgerReservations arayüzünü packages/ledger'da gerçekler; web ajanı NonceGoneError'ı 410'a, BudgetError'ı 429'a, GatewayError'ı status alanına eşler.
- Sonraki adım: canlı duman testi, gerçek Valkey sayaç ve nonce deposu bağlantısı (altyapı).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


## Dalga 0, mimar, denetim düzeltmeleri, 2026-10-19

### Durum

Bağımsız denetimin yüksek (Y1), orta (O1..O5) ve düşük (D2..D7) bulguları kapatıldı; D1 Dalga 1'e ertelendi. main'de commit'li, push ve etiket yok.

### Yapılanlar

- Y1: ledger_transactions tablosu eklendi (idempotency_key tekil); ledger_entries satır düzeyi tekil dizini kaldırıldı, transaction_id artık ledger_transactions'a dış anahtar. Promosyon ve paket partisine yayılan tek harcama için PGlite testi var; aynı anahtarla ikinci yazım reddediliyor.
- O1, O2: tüm istek gövdeleri additionalProperties: false; her gövde için zod şeması (packages/contracts/src/requests.ts, requestBodies eşlemesi); test, OpenAPI gövdeleriyle yapısal eşitliği ve kapalı nesneleri denetliyor (muaf: authPost, iyzicoWebhook, appStoreWebhook).
- O3: POST /v1/answers ve /v1/abbreviations Idempotency-Key alıyor (diğer kredi harcayan uçlarda zaten vardı).
- O4: CI'da gitleaks CLI 8.30.1 sabit sürüm ve sağlama toplamıyla; .githooks/pre-commit (gitleaks yoksa uyarı), etkinleştirme: pnpm hooks:install.
- O5: consents ve audit_log ekle-yalnız tetikleyicili; kullanıcı silinince user_id/actor_id NULL olur, user_hash/actor_hash kanıtı tutar; testli.
- D2: jobs (type, dedupe_key) etkin işlerde kısmi UNIQUE. D3: queued'a dönen işte NOTIFY. D4: /api/health yalnız {status} döner; veri tabanı ve Valkey için ping arayüzü (setHealthDeps), bağlantı yoksa 503. D5: admin uçlarında x-kazuist-requires: [passkey, second-factor]. D6: BYOK nonce Valkey SET NX EX 600 ve GETDEL, ADR-0008 notu. D7: sahiplik.md düzeltmesi ve gerekçeli sapma notları.
- 0001_init.sql yeniden üretildi (henüz hiçbir ortamda uygulanmadığı için yeni migration yerine; contracts-v1 etiketinden sonra her değişiklik yeni migration olur).

### Açık işler

- D1 (ertelendi, Dalga 1 odeme): packages/ledger'da eksi bakiye kuralı (yalnız ters ibraz ve Apple iadesiyle eksiye düşme) ve özellik tabanlı testler.
- Health ping'lerinin gerçek pg ve Valkey istemcilerine bağlanması (altyapi, Dalga 1).

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
