# İstek: arama dizini (embed.chunks tüketicisi) için komşu işler

1. İsteyen: casuist ajanı, dal `codex/p9-arama-dizini`. Muhatap: orkestra, mimar, altyapi, veri-toplama.
2. Gerekçe: review.md P9 madde 1 ve 8; ADR-0026 "Parçalama tutarlılığı"; plan 5.3 (embedding adayları), 7.2/2-3.
3. Aciliyet: madde 1 CI kapsaması için gerekli; diğerleri vektör kolunu açmak içindir, tam metin araması bunlar
   olmadan çalışır.

## Durum

`services/worker-py/nlp` artık `embed.chunks` işini tüketiyor: yalnız `records.masked_text` okunur, parçalar
`packages/casuist/src/chunk.ts` ile birebir aynı sınırlarla kesilir ve `chunks` tablosuna yazılır (tam metin sütunu
`tsv` üretilmiş sütun olduğu için kendiliğinden dolar). Gömme modeli yapılandırılmadıkça `embedding` ve
`embedding_model` boş kalır; arama vektör kolunu `degraded: ['vektor']` olarak bildirir. `packages/contracts` ve
`packages/db` değişmedi; şema değişikliği gerekmedi.

## 1. orkestra: test toplama

`services/worker-py/pyproject.toml` içinde `testpaths` listesine `"nlp/tests"` eklenmeli. Ekleninceye kadar CI'daki
`uv run pytest` yeni testleri toplamaz; yerelde `uv run pytest nlp/tests` ile koşar (44 geçti, 7 atlandı; ayrıntı
DEVIR.md). Dört testlik `nlp/tests/test_pg.py` yalnız `KAZUIST_TEST_DATABASE_URL` tanımlıysa koşar; CI'da
worker-py için PostgreSQL servisi olmadığından orada atlanır.

## 2. veri-toplama ve mimar: bu PR'da sahiplik dışı iki küçük değişiklik

- `services/worker-py/core/main.py` (veri-toplama): `build_handlers` içine yalnız iki satır eklendi, orkestranın
  izniyle: `from nlp.job import make_embed_handler` ve `handlers[JobType.EMBED_CHUNKS] = make_embed_handler(connect)`.
  Dosyanın baş yorumu ve `build_handlers` yorumu `embed.chunks` işini henüz anmıyor; güncellemesi sahibine kalır.
- `services/worker-py/tests/test_main.py` (mimar): kayıtlı iş türü kümesini sabitleyen tek satıra
  `JobType.EMBED_CHUNKS` eklendi. Bu satır değişmeden kayıt CI'ı kırıyordu.

## 3. mimar: ortam değişkenleri (`.env.example`)

worker-py için, hepsi isteğe bağlı:

| Değişken | Anlam |
|---|---|
| `KAZUIST_EMBED_BACKEND` | `bge-m3`, `multilingual-e5-large` ya da `qwen3-embedding-0.6b`; boş ya da `none` vektörsüz yazar |
| `KAZUIST_EMBED_DIR` | Salt okunur model birimi, her aday için bir klasör (öneri `/models/embed`) |
| `KAZUIST_EMBED_THREADS` | ONNX Runtime iş parçacığı sayısı |
| `KAZUIST_EMBED_QUANTIZED` | `1` ise `model_quantized.onnx` |

Web tarafındaki `KAZUIST_EMBED_MODEL`, worker'ın yazdığı kimlikle aynı olmalıdır: `<anahtar>@<revizyonun ilk 7
karakteri>` (revizyon `kazuist_manifest.json` içindedir, yoksa `local`). Farklı modelin vektörleri karışmaz.

## 4. altyapi: model birimi ve uzlaştırma zamanlayıcısı

- İmaj, `mimar-yonlendirme-2-casuist-anonimlestirme-altyapi.md` altyapi madde 1'deki `--extra ner-runtime` ile
  kurulduğunda gömme için de yeterlidir (onnxruntime, tokenizers, numpy). Yeni bağımlılık yok.
- Model klasörü: `model.onnx` (ya da `model_quantized.onnx`), `tokenizer.json`, `kazuist_manifest.json`
  (`revision` ve sha256 değerleri). İndirme çalışma anında yapılmaz.
- `python -m nlp.reconcile --limit 1000` periyodik çalışmalı (öneri 15 dakikada bir, worker ile aynı ortam
  değişkenleriyle). ADR-0026'daki uzlaştırma işidir: `masked_text` dolu ama parçası olmayan, ya da parçaları
  yapılandırılmış modelin vektörünü taşımayan kayıtlar için `embed.chunks` kuyruğa atar; etkin işi olanı atlar.
  Model yüklüyse betik de modeli yükler (worker ile aynı kararı vermek için).
- Alternatif: zamanlayıcı yerine yeni bir iş türü (`embed.reconcile`) istenirse `job_type` enum'una ekleme
  gerekir; o durumda mimar migration yazar. Şimdilik gerekmiyor.

## 5. casuist: sıradaki işler (bu PR'da yok)

- Sorgu gömmesi için HTTP servisi (`packages/casuist/src/vector.ts` `httpEmbedder` sözleşmesi: `POST {texts, kind}`
  -> `{model, vectors}`); aynı `nlp.embedder` arayüzünü kullanacak. Servis yokken web `KAZUIST_EMBED_URL`
  tanımlanmamalıdır.
- `eval/embed` 300 sorguluk set ve üç adayın ölçümü; kazanan seçilmeden vektör kolu açılmaz. Hiçbir aday gerçek
  modelle denenmedi; ONNX yolu yalnız küçük bir yapay grafikle yerelde denendi.
- `chunk.ts` sıra sayılarında da keser ("Yargıtay 4. HD" gibi); kural değişirse iki taraf birlikte değişir
  (`packages/casuist/fixtures/parcalar.json`).
