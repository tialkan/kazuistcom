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
