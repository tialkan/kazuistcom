# İstek: ingest.fetch yeni yük biçimleri, protokol durumu değeri, AYM açık kaynak adı

İsteyen: veri-toplama, dal `worktree-agent-ac159744b3b120907` (AYM, Yargıtay, Danıştay bağlayıcıları ve zamanlayıcı).

## 1. Gerekçe

Plan 6.1 "Tazelik" sütunu (haftalık, günlük) ve "Nothing schedules collection" bulgusu: zamanlayıcı
(`services/worker-py/core/scheduler.py`) ve keşif işleri (`core/discovery.py`) çalışıyor, ama kuyruk tüketicisi
(`core/jobs.py`, `packages/contracts` `IngestFetchPayload`) yeni kaynakların yük biçimlerini tanımıyor ve onları
"invalid payload" diye gömüyor. Zamanlayıcı bu yüzden bu işleri `contract_pending` diye atlıyor (dry-run çıktısında
görünür); sözleşme kabul edince `core.scheduler` ek değişiklik olmadan kuyruğa almaya başlar (`payload_problem` denetimi).

## 2. Önerilen değişiklik: `IngestFetchPayload` birleşimine eklenecek biçimler

Hepsi `z.strictObject`; yükler yalnız kimlik taşır (karar numarası, tarih, birim adı), taraf adı veya metin taşımaz.

```ts
// AYM: liste sayfası ve tek karar
z.strictObject({ source: z.literal('aym'), kararTipi: z.enum(['BireyselBasvuru', 'NormDenetimi']),
                 page: z.number().int().min(1).max(10000) }),
z.strictObject({ source: z.literal('aym'), kararTipi: z.enum(['BireyselBasvuru', 'NormDenetimi']),
                 id: z.uuid() }),
// Yargıtay ve Danıştay: liste sayfası (birim, karar yılı, sayfa) ve tek karar (kimlik ve künye)
z.strictObject({ source: z.enum(['yargitay', 'danistay']), unit: z.string().min(1).max(100),
                 year: z.number().int().min(1900).max(2100), page: z.number().int().min(1).max(10000) }),
z.strictObject({ source: z.enum(['yargitay', 'danistay']), id: z.string().regex(/^[0-9]{1,20}$/),
                 unit: z.string().min(1).max(100), esas: z.string().regex(/^\d{4}\/[\dA-Za-z()-]+$/),
                 karar: z.string().regex(/^\d{4}\/[\dA-Za-z()-]+$/), date: z.iso.date() }),
// KVKK ve Rekabet: liste sayfası (keşif)
z.strictObject({ source: z.enum(['kvkk', 'rekabet']), page: z.number().int().min(1).max(10000) }),
```

Dikkat: `kvkk` ve `rekabet` için mevcut `{source, url}` biçimi korunur; birleşim ayırıcısı `source` tek başına
yetmez (aynı `source` iki biçim), `z.union` kullanılmalı. `core/jobs.py` `_ingest_fetch` ve
`packages/contracts/test/fixtures/job-payloads.json` ortak fikstürü aynı biçimlerle güncellenmeli (örnek yükler
`services/worker-py/tests/test_discovery.py` ve `test_scheduler.py` içinde).

Davranış tarafı `core/discovery.py` içinde hazırdır: liste işi bilinmeyen kararlar için belge işi ve gerekiyorsa
sıradaki sayfa işini kuyruğa alır (dedupe anahtarı kaydın `source_key`'i, sayfa için `<kaynak>:list:...`).

## 3. `protocol_status` enum değeri

Plan 6.1 Yargıtay ve Danıştay için "toplu çekme için protokol başvurusu" der. Başvuru yapılmadı; `protocol_status`
enum'unda "gerekli ve yapılmadı" karşılığı yok (`gerekmez, basvuruldu, imzalandi, reddedildi, canli_federasyon`).
Kaynak dosyaları `protokol_durumu: gerekli_yapilmadi` yazar (`core/sources.py` kabul eder), kayıtlar ise şimdilik enum
varsayılanı `gerekmez` ile yazılır; bu doğru bilgiyi yanlış gösterir. Öneri: enum'a `gerekli` ekleyen migration (eklemek
yıkıcı değildir). Eklenince `RECORD_PROTOCOL_STATUSES` listesine eklenip bağlayıcı kodu değişmeden çalışır.

## 4. Anonimleştirme politikasındaki açık kaynak adı (anonimlestirme ajanına bilgi)

`anonymizer/policy.yaml` `open_sources: [AYM, AİHM, ABAD]` ve `anonymizer/pipeline.py` bunu `records.court` ile
karşılaştırıyor. AYM bağlayıcısı `court = "Anayasa Mahkemesi"` yazar (atıf ağı `SCOPE_1_0` ve `classifyAuthority` bu adı
bekliyor). Eşleşme olmadığı için AYM üyesi adları Ek E'nin tersine maskeleniyor (güvenli yön, ama kaynak açık yayımladığı
bilgi kaybolur). Öneri: anonimleştirme ajanı eşleştirmeyi mahkeme adına çevirsin ("Anayasa Mahkemesi" gibi) veya takma ad
tablosu eklesin.

## 5. Geriye uyumluluk ve aciliyet

Geriye uyumlu (yalnız ekleme). Bu değişiklik olmadan ilerlenebilir: bağlayıcılar, keşif işleri ve zamanlayıcı hazır ve
testli, ama hiçbir yeni kaynak işi kuyruktan çalışamaz; kaynaklar zaten `tarik_onayi: bekliyor` olduğu için üretimde
çalışmıyor. Onaydan önce kapanmalı.

## Sonuç (mimar, 15 Kasım 2026, sözleşme v1.6, ADR-0038)

Değiştirerek kabul.

- Madde 2: `IngestFetchPayload` `z.union` oldu; KVKK ve Rekabet liste sayfası, AYM liste ve belge, Yargıtay ve Danıştay
  liste ve belge biçimleri eklendi, mevcut biçimler korundu. İki sapma, ikisi de üreticinin yazdığı biçime göre: AYM
  kimliği `z.uuid()` değil `z.guid()` (bankanın kimlikleri RFC 9562 UUID değil; `tests/fixtures/aym/bb-liste.json`
  içindeki `817f0b47-acf1-0404-...` sürüm hanesi 0, varyant hanesi 3), esas ve karar numarası `connectors/judicial.py`
  `case_number` biçiminde (sonda isteğe bağlı `/<rakam>`, yalnız ASCII rakam, en çok 50 karakter). Sözcük listeleri
  `aymDecisionTypes`, `courtSources`, `INGEST_MAX_PAGE` sözleşmede. `core/jobs.py` `_ingest_fetch` ve
  `packages/contracts/test/fixtures/job-payloads.json` (10 geçerli, 21 geçersiz yeni örnek) aynı biçimlerle güncellendi.
  Zamanlayıcının varsayılan planı artık sözleşmeyi varsayan planla aynıdır; `tests/test_scheduler.py` içindeki
  `contract_pending` testi buna göre değişti.
- Madde 3: enum değeri `gerekli` değil `gerekli_yapilmadi` (migration 0008); `docs/kaynaklar` dosyalarındaki
  `protokol_durumu` ile aynı sözcük. `RECORD_PROTOCOL_STATUSES`'e eklemek size yönlendirildi.
- Madde 4: anonimleştirmeye yönlendirildi.
- `core/discovery.py` `_CASE_NO`'nun `case_number`'dan dar olması ve belge başlarındaki `contract_pending` anlatımı:
  `mimar-yonlendirme-4-sozlesme-v1-6.md`.
