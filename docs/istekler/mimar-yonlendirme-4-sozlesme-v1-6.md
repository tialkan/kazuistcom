# Yönlendirme: sözleşme v1.6 (ADR-0038) sonrası sahip işleri

Tarih: 15 Kasım 2026. Yazan: mimar (dal `mimar/sozlesme-v1-6`). Bu dosya sözleşmeyi değiştirmez; orkestra
ilgili ajana iş olarak verir. Hepsi geriye uyumludur: bugünkü kod v1.6 ile çalışır.

## veri-toplama

1. `core/sources.py` `RECORD_PROTOCOL_STATUSES` listesine `gerekli_yapilmadi` ekleyin. Değer migration 0008 ile
   `protocol_status` enum'unda; eklenince Yargıtay ve Danıştay kayıtları `gerekmez` yerine doğru durumla yazılır.
   `SOURCE_PROTOCOL_STATUSES` aynı kalabilir (değer artık iki listede de olur). `tests/test_judicial.py` beklentisini
   buna göre güncelleyin.
2. `core/discovery.py` `_CASE_NO` (`^\d{4}/[\dA-Za-z()\-]+$`) `connectors/judicial.py` `case_number`'dan dardır:
   bağlayıcı `2024/817/2` gibi sonda `/<rakam>` taşıyan numarayı listeden okuyup belge işine yazar, `court_job` ise
   onu `BadJob` ile reddeder (iş beş deneme sonra `dead`). Sözleşme `case_number` biçimini kabul eder; `_CASE_NO`'yu
   aynı desene ve `[0-9]` ile ASCII rakama çevirin (Python `\d` Unicode rakamları da eşler).
3. `core/discovery.py` belge başındaki ve `core/scheduler.py` başındaki "sözleşme gelene kadar gömülür" ve
   `contract_pending` anlatımı artık yeni biçimler için geçerli değil; metni güncelleyin. `contract_pending` düzeneği
   ileride eklenecek biçimler için kalabilir.
4. Bilgi: `tests/test_scheduler.py` içindeki `test_unknown_payload_shapes_wait_for_the_contract_but_known_ones_run`
   bu PR'da `test_every_night_payload_shape_is_in_the_job_contract` oldu (sözleşmenin doğrudan sonucu). Dosya artık
   sahiplik tablosunda sizin satırınızda.
5. Bilgi: AYM kimliği sözleşmede `z.guid()` ile denetlenir (bankanın kimlikleri RFC 9562 UUID değil); `discovery.py`
   `_UUID` gevşek desenle uyumludur.

## kimlik

1. `apps/web/src/server/auth/edu.ts` `claimedByOther`: `edu_claims` üzerinden tek satır okuma yeterlidir
   (`select user_id from edu_claims where email = $normalized`; dönen `user_id` başka hesapsa adres kullanımda). Eski
   satırlar için tutulan `normalizedColumn` taraması gerekmez; tablo geri doldurmayla dolu gelir.
2. Onay işlemi `verified_at` yazarken tetikleyici SQLSTATE 23505 (`constraint = 'edu_claims_pkey'`) ile düşebilir
   (danışma kilidini kullanmayan başka bir yazıcı aynı anda doğruladıysa). Bu hatayı `taken` sonucuna ve
   `hata.eduKullanimda` mesajına eşleyin; 500 olmasın. Danışma kilidi kalabilir (gereksiz bekleme yaratmaz).
3. `account.purge` (`apps/worker-node/src/account/purge.ts`) değişmez: `edu_verifications` silmesi talebi tetikleyiciyle
   kaldırır. `edu_claims`'in `users`'a yabancı anahtarı yoktur; `purge-integration.test.ts` bu yüzden yeni satır
   istemez.
4. Bilgi: migration aynı posta kutusunu sonradan doğrulamış hesapların satırlarına ve `profiles.edu_verified`
   değerlerine dokunmaz; liste sorgusu ADR-0038 madde 4'tedir. Bulunursa karar Tarık'ındır.

## casuist

1. `SearchResponse.degraded` sözleşmede (açık liste, `string[]`); `packages/casuist/src/api.ts` `toSearchResponse`
   dönüş tipindeki `& { degraded?: string[] }` eki kaldırılabilir, alan artık `SearchResponse` tipinde.
2. `apps/web/src/app/ara/_sunucu/ozet.ts`: `hasControlChars` denetimi artık şemada (`AnswerRequest.q` ve
   `PrepareRequest.q`, `QuestionText`); uçtaki ek satır kaldırılabilir. Kaldırırken 400 testleri kalmalı.
3. `preparePost`: `PrepareRequest.filters` sözleşmede; `search()` çağrısına `AnswerRequest` ile aynı biçimde geçirin.
4. Bilgi: `casuist-arama-kalitesi.md` madde 2 (EUR-Lex otorite sınıfı ve yargı çevresi) veri-toplama'nın, madde 3
   orkestra ve yz-gecidi'nin, madde 4 altyapının; sözleşme değişikliği istemiyorlar.

## yz-gecidi

1. `packages/ai-gateway/src/byok/client.ts` `PrepareBody`'ye `filters?: AnswerFilters` ekleyin (tip
   `@kazuist/contracts`'tan). Casuist süzgeçleri geçirince `packages/i18n/tr/byok.json` `ozet.filtre` notu kalkar.
2. `scrubParts` denetim karakteri silmesi kalmalı (savunma derinliği); şema yalnız uç girişini kapatır.

## anonimlestirme

- `.env.example` metni istekteki gibi eklendi. Bilgi (veri-toplama isteği madde 4): `anonymizer/policy.yaml`
  `open_sources: [AYM, AİHM, ABAD]` `records.court` ile karşılaştırılıyor; AYM bağlayıcısı `court = "Anayasa
  Mahkemesi"` yazar. Eşleşme olmadığı için AYM üyesi adları Ek E'nin tersine maskelenir (güvenli yön). Eşleştirmeyi
  mahkeme adına çevirin ya da takma ad tablosu ekleyin.

## on-yuz, pratik, yazma, atif-agi

- Dar çekirdek ADR-0038 madde 8 ile kayda geçti; `.env.example`'da `KAZUIST_MODULLER` var. API uçlarının
  kapatılması istenmedi; istenirse sahibi `modulGorunur()` ile yapar.

## altyapi

1. Web imajında ve Coolify'da `KAZUIST_ENV=production` açıkça verilsin; runbook'a web için de yazılsın (dar çekirdek
   kuralı `KAZUIST_ENV` unutulsa da gizler, ama SEO açılışı ADR-0023 gereği değeri ister).
2. `KAZUIST_SCHEDULER` üretimde kaynak onayları gelene kadar boş kalabilir; açılırsa zamanlayıcı yalnız anahtarı açık
   ve onaylı kaynaklar için iş koyar. Kapalı provada `KAZUIST_SCHEDULER_DRY_RUN=on` ile plan loglanabilir.

## orkestra

- `apps/web/src/server/security-headers.ts` sahiplik notunda orkestranın.
