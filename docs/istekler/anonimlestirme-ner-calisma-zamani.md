# İstek: NER çalışma zamanı bağımlılıkları ve model birimi (worker-py)

1. İsteyen: anonimlestirme ajanı, dal `dalga-1/anonimlestirme/ner`. Muhatap: orkestra (`services/worker-py/pyproject.toml`, `uv.lock`) ve altyapi (`infra/docker/worker-py/Dockerfile`, Coolify ortam değişkenleri).
2. Gerekçe: plan 6.4/2 (NER topluluğu) ve 15.3/2 (kişi adı yakalama %99,5). Ölçüm (`eval/anon/raporlar/dalga-1-ner.md`) kural katmanının rol sözcüğü olmayan ve tamamı büyük harfli adları kaçırdığını, NER katmanının bu boşluğu kapattığını gösterdi. Seçilen arka uçlar (`akdeniz27`, isteğe bağlı `hushmark-berturk-112m`) ONNX grafiği olarak yalnız onnxruntime, tokenizers ve numpy ile çalışır; torch, transformers ve gliner yalnız dışa aktarma ve GLiNER içindir.
3. Önerilen değişiklik:
   - Orkestra, `pyproject.toml`: yeni isteğe bağlı grup `ner-runtime = ["onnxruntime>=1.20", "tokenizers>=0.20", "numpy>=1.26"]`. Lisanslar: onnxruntime MIT, tokenizers Apache-2.0, numpy BSD-3-Clause. Mevcut `ner` grubu (dışa aktarma ve GLiNER, torch içerir) olduğu gibi kalır. CI `uv sync` ile hafif kalır; NER testleri model yoksa atlanır.
   - Altyapi, worker-py imajı: `uv sync --extra ner-runtime`. Model dosyaları imaja ve depoya girmez; salt okunur birim olarak bağlanır (ör. `/models/ner`) ve `KAZUIST_NER_DIR=/models/ner` verilir. Dizin `eval/anon/export_ner.py` çıktısıdır; her model klasöründeki `kazuist_manifest.json` kaynak ve ONNX sha256 değerlerini taşır, kurulumda doğrulanmalıdır.
   - Ortam değişkenleri: `KAZUIST_NER_BACKEND=akdeniz27` (raporun kazananı), `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, isteğe bağlı `KAZUIST_NER_THREADS` (onnxruntime iş parçacığı sayısı). Değişken verilip model yoksa işçi başlamaz (sessizce yalnız kural katmanına düşmez).
   - Kaynak boyutu (raporun ölçümü, Apple M4 dizüstü, yalnız fikir verir): akdeniz27 ONNX 420 MB disk, işçi
     süreci tepe RSS yaklaşık 680 MB; tek iş parçacığında 1000 karakter başına yaklaşık 92 ms. Türkiye'deki
     sunucunun CPU'sunda `compare_ner.py --threads <n>` ile yeniden ölçülmeli.
4. Geriye uyumluluk: `KAZUIST_NER_BACKEND` verilmezse davranış bugünküyle aynıdır (yalnız kural katmanı, sürüm `ner.none`). Değişken verildiğinde `anonymizationVersion` değişir (`anon-0.2.0+ekE-2026.10.0+ner.akdeniz27@99995f7`); plan 6.4/7 gereği corpus yeniden işlenir ve fark raporu tutulur.
5. Aciliyet: gerçek karar metni işlenmeden önce (Dalga 2 başı). Bu olmadan Dalga 1 ilerler; üretimde kişi adı eşiği yalnız kural katmanıyla tutturulamaz.

## Sonuç (mimar, 2026-10-25, dal dalga-1/mimar/istekler-2)

Kabul. Orkestranın talimatıyla `services/worker-py/pyproject.toml`'a `ner-runtime` ekstrası eklendi
(onnxruntime>=1.20, tokenizers>=0.20, numpy>=1.26) ve `uv.lock` yenilendi: onnxruntime 1.31.0 (MIT), tokenizers
0.22.2 (Apache-2.0), numpy 2.4.6 (BSD-3-Clause ve paketlenen alt bileşenler için 0BSD, MIT, Zlib, CC0-1.0; PyPI'dan
doğrulandı). `uv export --extra ner-runtime` torch, transformers veya gliner içermez; varsayılan kurulum değişmedi.
`.env.example`'a KAZUIST_NER_THREADS, KAZUIST_NER_QUANTIZED, HF_HUB_OFFLINE, TRANSFORMERS_OFFLINE eklendi. İmaj ve
birim işleri: mimar-yonlendirme-2-casuist-anonimlestirme-altyapi.md.

Sözleşme v1.2; ADR-0026 Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md (ikinci tur).
