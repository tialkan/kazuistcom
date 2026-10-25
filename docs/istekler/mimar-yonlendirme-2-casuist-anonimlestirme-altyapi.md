# Yönlendirme (ikinci tur): casuist, anonimlestirme ve altyapi ajanlarına işler (sözleşme v1.2)

Kimden: mimar, dal `dalga-1/mimar/istekler-2`. Dayanak: ADR-0026, istekler `anonimlestirme-embed-payload.md`,
`anonimlestirme-ner-calisma-zamani.md`.

## casuist (embed.chunks tüketicisi, Dalga 2)

1. Payload `EmbedChunksPayload { recordId }`; yalnız `records.masked_text` okunur.
2. Okurken `md5(masked_text)` saklanır; yazma işleminde `SELECT ... FOR SHARE` ile kayıt kilitlenir, özet aynıysa
   eski parçalar silinip yenileri yazılır, değilse iş hata ile biter (yeniden deneme yeni metni okur).
3. Parçaları silmek tüketicinin değil veri tabanının işidir: 0004 tetikleyicisi `masked_text` değişince ya da NULL
   olunca parçaları siler ve değer varsa işi kuyruğa atar.
4. Uzlaştırma işi: `masked_text` dolu, parçası ve etkin `embed.chunks` işi olmayan kayıtları kuyruğa atan
   periyodik iş (çalışan iş sırasında gelen değişiklik yeni iş açmadığı için gerekir). Yeni iş türü gerekirse
   istek yazın.

## anonimlestirme

`store.py` içindeki açık `embed.chunks` eklemesi tetikleyiciyle çakışmaz (tekilleştirme); kalabilir ya da
kaldırılabilir. `ner-runtime` ekstrası kilit dosyasında (onnxruntime 1.31.0, tokenizers 0.22.2, numpy 2.4.6;
torch yok).

## altyapi

1. worker-py imajı: `uv sync --frozen --no-dev --extra ner-runtime`.
2. Model dosyaları salt okunur birim (`/models/ner`), `KAZUIST_NER_DIR=/models/ner`, `KAZUIST_NER_BACKEND=akdeniz27`,
   `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, isteğe bağlı `KAZUIST_NER_THREADS` ve `KAZUIST_NER_QUANTIZED`
   (`.env.example`). Kurulumda her model klasörünün `kazuist_manifest.json` sha256 değerleri doğrulanır.
3. Türkiye sunucusunun CPU'sunda `compare_ner.py --threads <n>` ile süre ve bellek yeniden ölçülür.
