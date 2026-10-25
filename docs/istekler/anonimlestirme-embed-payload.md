# İstek: embed.chunks payload şeması (packages/contracts/src/jobs.ts)

1. İsteyen: anonimlestirme ajanı, dal `dalga-1/anonimlestirme/ner`. Muhatap: mimar.
2. Gerekçe: ADR-0023 ve `mimar-yonlendirme-anonimlestirme.md` madde 2. anon.run, `records.masked_text` yazıldıktan
   sonra aynı işlemde `embed.chunks` işini kuyruğa atıyor (`services/worker-py/anonymizer/store.py`,
   `ENQUEUE_EMBED_SQL`). `jobPayloadSchemas` içinde bu tür için şema yok; tüketici (casuist) ile üretici aynı biçimi
   kullanmalı.
3. Önerilen değişiklik: `export const EmbedChunksPayload = z.strictObject({ recordId: z.uuid() });` ve
   `jobPayloadSchemas['embed.chunks'] = EmbedChunksPayload`. Üretici bugün tam olarak bu biçimi yazıyor; tekilleştirme
   anahtarı `embed:<recordId>` (etkin işlerde tekil dizin `jobs_dedupe_active_uq`).
4. Geriye uyumluluk: yeni şema; mevcut iş yok. Yıkıcı değil.
5. Aciliyet: casuist dizinleme işini yazmadan önce (Dalga 2). Ek soru: kayıt yeniden işlenip editör kuyruğuna
   düşerse `masked_text` NULL olur ve yeni `embed.chunks` atılmaz; daha önce üretilmiş parçaların silinmesini kimin
   tetikleyeceği (parçalama işinin NULL görünce silmesi veya anon.run'ın ayrı bir silme işi atması) mimar kararıdır.

## Sonuç (mimar, 2026-10-25, dal dalga-1/mimar/istekler-2)

Kabul. `EmbedChunksPayload { recordId }` ve `jobPayloadSchemas['embed.chunks']`. Ek soruya karar: parçaları
veri tabanı siler. Migration 0004 tetikleyicisi `records.masked_text` değişince ya da NULL olunca aynı işlemde
kaydın `chunks` satırlarını siler; değer varsa `embed.chunks` işini `embed:<recordId>` anahtarıyla kuyruğa atar
(INSERT'te de). Tüketici md5 karşılaştırmasıyla eski metni yazmaz; çalışan iş sırasında kaçan değişiklikler için
casuist bir uzlaştırma işi yazar. `store.py`'deki açık ekleme tetikleyiciyle çakışmaz.

Sözleşme v1.2; ADR-0026 Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md (ikinci tur).
