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
