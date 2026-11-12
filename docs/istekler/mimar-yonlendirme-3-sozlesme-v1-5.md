# Yönlendirme: sözleşme v1.5 (ADR-0035) sonrası sahip işleri

Tarih: 12 Kasım 2026. Yazan: mimar (dal `codex/p1-sozlesme-v1-5`). Bu dosya sözleşmeyi değiştirmez; orkestra ilgili
ajana iş olarak verir. Hepsi geriye uyumludur: bugünkü kod v1.5 ile çalışır, aşağıdakiler eksik kalan korumaları
tamamlar.

## orkestra

- Bu PR'da plan adım A gereği değişen dosyalarınız: `apps/worker-node/src/queue.ts` (sözleşme yük doğrulaması,
  kalp atışı, işçi kimliğiyle bitirme, "lock lost" ve "job buried" logları), `runner.ts` (bayat kilit sonucu logu,
  `pruneJobsSql` ile günlük temizlik, `pruneEveryMs`), `handlers.ts` (`dailyBillingTick` artık
  `enqueueJob(..., { once: true })`), `apps/worker-node/test/{queue,runner,billing}.test.ts`. `main.ts`
  değişmedi; `createConsumer` loglarını öntanımlı olarak `main.ts` ile aynı JSON satırı biçiminde yazar.
- `services/worker-py/anonymizer/tests/test_anonymizer.py` (anonimlestirme) içinde tüketici testinin kayıt kimliği
  `"r1"` yerine UUID yapıldı; tüketici artık yükü denetliyor.

## yazma

1. `apps/worker-node/src/kalemcik/gunluk.ts` `kalemcikTick`: `enqueueKalemcikDailySql` yerine
   `enqueueJob(db, 'kalemcik.daily', {}, { once: true, dedupeKey: 'kalemcik.daily:' + gun, runAfter })`
   (`runAfter` İstanbul 08.00, bugünkü hesap). Böylece yeniden başlatılan süreç bitmiş günü yeniden kuyruğa koymaz.
   `KUYRUK_SQL` (`notify.send`) hatırlatma satırı koşullu UPDATE ile korunduğu için değişmesi gerekmez;
   isterseniz `enqueueJob(db, 'notify.send', yuk, { dedupeKey })` ile doğrulayarak yazın.
2. `apps/web/src/app/yazma/_sunucu/kurallar.ts` `isOlustur`: web sürecinin kendi yürüttüğü `rules.extract`
   satırına `maxAttempts: 1` yazın. Web süreci işi bitirmeden çökerse bayat kilit temizliği (`releaseStaleJobsSql`)
   satırı artık `dead` yapar (`error = 'stale lock'`); bugün `queued`'a döner ve tüketicisi olmadığı için orada
   kalır.
3. Rota dosyaları yerel zod yerine sözleşme şemalarını içe aktarsın: `TemplateCheckUpload` (`rules` metni),
   `WritingSettings` (`ayarlar`), `TemplateRulesUpload` (`kind` v1.5'te sözleşmede), `WritingProjectInput`,
   `WritingProgressInput`, `DocxCountUpload`, `AbbreviationsInput`. Sözleşme testi yerel şemanın sözleşmeden
   ayrışmasını görmez.
4. `/v1/templates/docx` `x-kazuist-uygulama: planlandi` taşıyor; işleyici yazılınca ek sözleşmeden kaldırılır (mimar,
   istekle). `ayarlar` yol adı ADR-0036'da konuşulur.

## odeme

- `apps/worker-node/src/billing/jobs.ts` `enqueueDailyBillingSql` artık çağrılmıyor (`dailyBillingTick` sözleşme
  yardımcısını kullanıyor); kaldırabilirsiniz. `billing/notices.ts` `notify.send` üreticisi `notices.sent_at`
  ile aynı ifadede korunduğu için değişmesi gerekmez.
- `/v1/webhooks/appstore` `planlandi` (ios ile).

## kimlik

1. `apps/worker-node/src/notify/dispatch.ts`: `notification_deliveries` ile kanal bazında tekillik
   (`docs/istekler/kimlik-p7-bildirim-idempotency.md`, Sonuç). Her teslimden önce `deliveredTargetsSql`, teslimden
   hemen sonra `recordDeliverySql`; e-posta hedefi `'email'`, push hedefi uç nokta ya da jetonun HMAC-SHA256'sı
   (küçük harf onaltılık). Sessiz saat ertelemesindeki ham `insert into jobs` yerine `enqueueJob(db, 'notify.send',
   payload, { runAfter })`.
2. `/auth/step-up/confirm` artık sözleşmede: işleyici `EduVerificationConfirm` yerine `StepUpConfirmInput` kullansın.
3. `planlandi` uçlarınız: `/v1/notifications/preferences`, `/v1/push/web-subscriptions`, `/v1/push/apns-tokens`;
   girdi şemaları sözleşmede hazır (`NotificationPreferencesInput`, `WebPushSubscriptionInput`, `ApnsTokenInput`).
4. Atıf kuyruğu editör ekranı yazılınca retde `confirmed = true, confidence = 0` yerine `rejected = true` yazın.

## atif-agi

1. `services/worker-py/citations/store.py`: ret `rejected = true` ile işaretlenir; `UPSERT_EDGE_SQL` ve
   `UPSERT_WORK_CITATION_SQL` yalnız `confirmed = false AND NOT rejected` satırları günceller; budama sorguları
   `rejected` satırları silmez. Başlıktaki "until a rejected column exists" notu kalkar.
2. Doktrin tabloları var: `SqlCitationStore(doctrine=True)` açılabilir.
3. `apps/web/src/app/atif-agi/_sunucu/sql.ts`: kenar ve eser okumalarına `NOT rejected`; `42P01` yedeği artık
   gerekmez (bırakmak zararsızdır).

## casuist

- `packages/casuist/src/sql.ts` atıf sayısı sorgusu (`citation_edges e WHERE e.to_record_id = r.id ...`) `NOT
  e.rejected` koşulunu eklesin; bugünkü `confidence > 0` koşulu eski ret biçimini zaten dışarıda bırakır.
- `/v1/records/{id}/versions` `planlandi`.

## veri-toplama

- `mevzuat.rg_daily` için bugün üretici yok. Günlük zamanlayıcı yazıldığında `core/jobs.py` `ENQUEUE_ONCE_SQL`
  (anahtar `mevzuat.rg_daily:<gün>`) kullanılmalı; `ingest.fetch` üreticisi (`core/pipeline.py` `ENQUEUE_SQL`)
  değişmeden çalışır, yük biçimi sözleşmededir (`IngestFetchPayload`).
- `core/main.py` baş yorumu `embed.chunks` işini anmıyor (casuist isteği madde 2).

## pratik ve icerik

- `planlandi` uçlar: pratik `/v1/hmgs/exams`, `/v1/hmgs/exams/{id}/attempts`, `/v1/hmgs/report`, `/v1/reviews`;
  icerik `/v1/guides/{id}/progress`. İşleyici yazıldığında `x-kazuist-uygulama` eki kaldırılmalıdır, yoksa
  `packages/contracts/test/rotalar.test.ts` kırılır (mimara istek; ek kaldırma sözleşme değişikliği değildir,
  aynı PR'da mimar onayıyla yapılabilir).
