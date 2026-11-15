# İstek: worker-py imajında ONNX çalışma zamanı ve /models/embed birimi

1. İsteyen: casuist ajanı, dal `casuist/embed-model-secimi`. Muhatap: altyapi (`infra/docker/worker-py/Dockerfile`,
   Coolify servis tanımı ve ortam değişkenleri). Bilgi: orkestra, mimar.
2. Gerekçe: plan 5.3 ve 7.2/3 (vektör kolu kendi sunucumuzda), ADR-0037 (Önerildi, Tarık onayı bekliyor; embedding
   modeli BGE-M3 int8), ADR-0026 (`embed.chunks`, `ner-runtime` ekstrası), ADR-0033 (tek sunucu, 8 GB Arm64 CAX21 ile
   16 GB x86 arası), review.md P9 madde 1. Ölçüm: `eval/embed/raporlar/dalga-2-embed.md` ve `dalga-2-hibrit.md`.
3. Aciliyet: vektör kolunu üretimde açmak için gerekir. Bu istek yapılmadan arama tam metin ve kimlik koluyla çalışmayı
   sürdürür (`degraded: ['vektor']`); hiçbir şey kırılmaz. Değişkenler ADR-0037 onaylanmadan üretimde verilmez.

## 1. İmaj: `ner-runtime` ekstrası

`infra/docker/worker-py/Dockerfile` derleme aşamasında:

```
RUN uv sync --frozen --no-dev --extra ner-runtime \
 && rm -rf tests
```

- Ekstra yalnız `onnxruntime`, `tokenizers`, `numpy` getirir (kilit: onnxruntime 1.31.0 MIT, tokenizers 0.23.3
  Apache-2.0, numpy 2.4.6 BSD-3-Clause). torch, transformers ve gliner gelmez. Yeni bağımlılık yoktur; ekstra
  ADR-0026 ile kabul edildi, anonimleştiricinin NER'i de aynı ekstrayı kullanır (`mimar-yonlendirme-2-casuist-anonimlestirme-altyapi.md`
  altyapi madde 1 hâlâ açık).
- arm64: kilitteki üç paketin de PyPI'da aarch64 tekerleği var (14 Kasım 2026'da pypi.org JSON API'sinden okundu):
  `onnxruntime-1.31.0-cp312-cp312-manylinux_2_28_aarch64.whl`,
  `tokenizers-0.23.3-cp310-abi3-manylinux_2_17_aarch64.manylinux2014_aarch64.whl`,
  `numpy-2.4.6-cp312-cp312-manylinux_2_27_aarch64.manylinux_2_28_aarch64.whl`. Debian trixie'nin glibc sürümü 2.41
  (sources.debian.org), yani `python:3.12-slim-trixie` `manylinux_2_28` koşulunu karşılar. ADR-0033 madde 4'teki çok
  mimarili derlemede `linux/arm64` için `python -c "import onnxruntime, tokenizers, numpy"` denetimi önerilir.
- İmaj büyümesi: yaklaşık 60 MB (onnxruntime tekerleği) ve numpy. Model dosyaları imaja girmez.

## 2. Model birimi: `/models/embed` (salt okunur)

- Sunucuda bir klasör (öneri `/srv/kazuist/models/embed`), konteynerde `/models/embed`, salt okunur bağlanır.
- İçerik: tek klasör `bge-m3/` ve içinde yalnız şu dört dosya (int8 kurulum için yeterli):
  `model_quantized.onnx` (yaklaşık 543 MB), `tokenizer.json` (17 MB), `kazuist_manifest.json`, `README.md`
  (MIT lisans bildirimi model kartındadır, birlikte taşınır). fp32 `model.onnx` ve `model.onnx_data` (2,2 GB)
  üretimde gerekmez.
- Klasör `eval/embed/hazirla.py` ile üretilir (resmî `BAAI/bge-m3` deposu, revizyon
  `5617a9f61b028005a4858fdac845db406aefb181`, her dosya Hub'ın sha256 özetine karşı denetlenir; ardından int8
  nicemleme). Üretim sunucusunda indirme yapılmaz; klasör geliştirici makinesinde ya da CI'da üretilip sunucuya
  kopyalanır (`rsync` ya da `scp`). Dosya izinleri 0644; işçi uid 10001 ile okur.
- Kurulum denetimi (her kopyalamadan sonra ve konteyner başlamadan önce):

  ```
  docker run --rm -v /srv/kazuist/models/embed:/models/embed:ro <worker-py imajı> \
    python -m nlp.model_check /models/embed/bge-m3 --quantized
  ```

  Çıkış 0 ve `OK bge-m3` beklenir. Manifest revizyonu ve lisansı `nlp/embedder.py` `CANDIDATES` ile, dosya
  özetleri manifestle karşılaştırılır.

## 3. Ortam değişkenleri (worker-py; ADR-0037 onaylandıktan sonra)

| Değişken | Değer | Not |
|---|---|---|
| `KAZUIST_EMBED_BACKEND` | `bge-m3` | Boşken vektörsüz yazar (bugünkü öntanım, değişmedi) |
| `KAZUIST_EMBED_DIR` | `/models/embed` | |
| `KAZUIST_EMBED_QUANTIZED` | `1` | int8; fp32 8 GB sunucuda önerilmez |
| `KAZUIST_EMBED_THREADS` | `2` | CAX21'in 4 vCPU'su web ve PostgreSQL ile paylaşılır; 16 GB x86 seçilirse 4 |
| `HF_HUB_OFFLINE` | `1` | Zaten öneriliyor (`.env.example`) |

`python -m nlp.reconcile --limit 1000` zamanlayıcısı (`casuist-p9-arama-dizini.md` madde 4) aynı değişkenlerle
çalışır; model açıldığında vektörsüz parçaları yeniden kuyruğa alır.

Web tarafındaki `KAZUIST_EMBED_URL` ve `KAZUIST_EMBED_MODEL` sorgu gömme servisi yazılana kadar verilmez (casuist'in
sıradaki işi; servis yokken web vektör kolunu atlar). Servis geldiğinde `KAZUIST_EMBED_MODEL=bge-m3@5617a9f`,
`KAZUIST_EMBED_DIM=1024`.

## 4. Kaynak bütçesi (ölçüm Apple M4'te; CAX21'de yeniden ölçülmeli)

- Bellek: int8 model yüklenince süreç yaklaşık 1,4 GB RSS'e çıkar ve metin başına gömmede artmaz (macOS ölçümü;
  tokenizer tek başına yaklaşık 0,4 GB). NER modeli (akdeniz27, yaklaşık 0,7 GB) aynı süreçte açılırsa worker-py
  için 2,5 GB ayrılmalı. Coolify'da worker-py konteynerine bellek sınırı konacaksa 3 GB önerilir.
- `nlp.reconcile` her çalışmada modeli de yükler (işçiyle aynı kararı vermek için; yükleme 1 sn'nin altında):
  15 dakikada bir, kısa süreli ikinci bir yaklaşık 1,4 GB'lık süreç demektir. Zamanlayıcı bellek sınırı buna göre
  konur ya da aralık uzatılır.
- Disk: birim 0,6 GB.
- CPU: tek sorgu p95 13 ms (4 iş parçacığı, M4); gömme saniyede yaklaşık 16 parça. CAX21'in Ampere çekirdekleri ve 2
  iş parçacığıyla bunun altında kalması beklenir (ölçülmedi); tam corpus'un ilk gömmesi günler sürebilir. İlk dolum
  için ayrı bir karar gerekebilir (ADR-0037 "Sonuçlar").
- Hedef sunucuda ölçüm komutu (model klasörü hazırken, worker-py içinden):
  `uv run --extra ner-runtime python -I ../../eval/embed/olc.py --only bge-m3 --bicim int8 --threads 2 --yaz`.

## 5. Geriye uyumluluk

Değişkenler verilmezse davranış bugünküyle aynıdır. İmaja eklenen paketler yalnız model yapılandırıldığında
yüklenir. Şema ve sözleşme değişmez (`halfvec(1024)`).
