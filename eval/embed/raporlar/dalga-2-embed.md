# Embedding ölçümü, Dalga 2 (2026-11-14)

Komut: `uv run --extra ner-runtime python -I ../../eval/embed/olc.py --yaz`. Derlem fikstur-2026-11-07 (75 kayıt, 202 parça).
Setler: rag-50 (39 beklenen kaynaklı, 11 cevapsız), sentetik (60 beklenen kaynaklı, 0 cevapsız). Yalnız vektör
kolu ölçülür (tam metin ve kimlik kolu yok); kayıt puanı, parçalarının en yüksek kosinüsüdür.

Ortam: Darwin arm64, Apple M4, 4 iş parçacığı, onnxruntime 1.31.0.
Süreler bu makinenindir; hedef sunucu (Hetzner CAX21, Arm64 Ampere, 4 vCPU, 8 GB) üzerinde ölçülmedi ve
orada daha yavaş olması beklenir. Bellek, ölçüm sürecinin tepe RSS değeridir (Python, numpy, derlem dahil).

## Getirme (vektör kolu tek başına)

isabet@k: beklenen kayıtlardan en az biri ilk k'da. AUC: cevaplı soruların en üst kosinüsünün cevapsız
sorularınkinden yüksek olma oranı (çekimserlik eşiği için bilgi, eşik değildir).

| Aday | Biçim | Pasaj | Sentetik isabet@1 | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 isabet@10 | rag-50 nDCG@10 | rag-50 AUC |
|---|---|---|---|---|---|---|---|---|---|
| bge-m3 | fp32 | metin | %68.3 | %90.0 | 0.779 | %79.5 | %92.3 | 0.851 | 0.916 |
| bge-m3 | fp32 | baslik+metin | %68.3 | %93.3 | 0.802 | %94.9 | %97.4 | 0.957 | 0.921 |
| bge-m3 | int8 | metin | %68.3 | %93.3 | 0.787 | %82.0 | %92.3 | 0.860 | 0.918 |
| bge-m3 | int8 | baslik+metin | %66.7 | %93.3 | 0.799 | %94.9 | %94.9 | 0.949 | 0.925 |
| multilingual-e5-large | fp32 | metin | %68.3 | %95.0 | 0.804 | %82.0 | %92.3 | 0.865 | 0.923 |
| multilingual-e5-large | fp32 | baslik+metin | %68.3 | %93.3 | 0.796 | %89.7 | %100.0 | 0.953 | 0.928 |
| multilingual-e5-large | int8 | metin | %61.7 | %95.0 | 0.774 | %84.6 | %92.3 | 0.874 | 0.921 |
| multilingual-e5-large | int8 | baslik+metin | %70.0 | %93.3 | 0.799 | %89.7 | %100.0 | 0.954 | 0.925 |
| qwen3-embedding-0.6b | fp32 | metin | %55.0 | %90.0 | 0.706 | %71.8 | %94.9 | 0.832 | 0.918 |
| qwen3-embedding-0.6b | fp32 | baslik+metin | %46.7 | %91.7 | 0.665 | %89.7 | %100.0 | 0.955 | 0.918 |
| qwen3-embedding-0.6b | int8 | metin | %50.0 | %85.0 | 0.659 | %61.5 | %94.9 | 0.777 | 0.918 |
| qwen3-embedding-0.6b | int8 | baslik+metin | %45.0 | %86.7 | 0.633 | %87.2 | %100.0 | 0.949 | 0.923 |

## Adayların farkı (eşleştirilmiş, iki setin bütün etiketli soruları)

nDCG@10 farkı (a eksi b) ve soruların yeniden örneklenmesiyle %95 güven aralığı. Aralık sıfırı içeriyorsa bu
setlerle fark gösterilemedi demektir.

| Biçim | Pasaj | a - b | nDCG@10 farkı | %95 aralık |
|---|---|---|---|---|
| fp32 | metin | bge-m3 - multilingual-e5-large | -0.021 | [-0.062, +0.021] |
| fp32 | metin | bge-m3 - qwen3-embedding-0.6b | +0.052 | [-0.003, +0.106] |
| fp32 | metin | multilingual-e5-large - qwen3-embedding-0.6b | +0.073 | [+0.011, +0.133] |
| fp32 | baslik+metin | bge-m3 - multilingual-e5-large | +0.006 | [-0.032, +0.045] |
| fp32 | baslik+metin | bge-m3 - qwen3-embedding-0.6b | +0.084 | [+0.028, +0.142] |
| fp32 | baslik+metin | multilingual-e5-large - qwen3-embedding-0.6b | +0.078 | [+0.020, +0.138] |
| int8 | metin | bge-m3 - multilingual-e5-large | +0.002 | [-0.038, +0.043] |
| int8 | metin | bge-m3 - qwen3-embedding-0.6b | +0.110 | [+0.055, +0.166] |
| int8 | metin | multilingual-e5-large - qwen3-embedding-0.6b | +0.108 | [+0.043, +0.170] |
| int8 | baslik+metin | bge-m3 - multilingual-e5-large | -0.002 | [-0.043, +0.038] |
| int8 | baslik+metin | bge-m3 - qwen3-embedding-0.6b | +0.100 | [+0.036, +0.166] |
| int8 | baslik+metin | multilingual-e5-large - qwen3-embedding-0.6b | +0.103 | [+0.036, +0.170] |

## Kaynak kullanımı (pasaj biçimi: metin)

| Aday | Biçim | Disk MB | Yüklenince RSS MB | Tepe RSS MB | Yükleme sn | Sorgu p50 ms | Sorgu p95 ms | Pasaj/sn | Ort. token | Kesilen |
|---|---|---|---|---|---|---|---|---|---|---|
| bge-m3 | fp32 | 2162 | 1610 | 1763 | 3.41 | 23.3 | 28.0 | 9.25 | 150.3 | 0 |
| bge-m3 | int8 | 542 | 1412 | 1412 | 0.71 | 11.3 | 13.1 | 15.77 | 150.3 | 0 |
| multilingual-e5-large | fp32 | 2132 | 1609 | 1764 | 2.77 | 23.1 | 25.3 | 9.21 | 152.3 | 0 |
| multilingual-e5-large | int8 | 535 | 1410 | 1410 | 0.7 | 11.9 | 13.9 | 15.8 | 152.3 | 0 |
| qwen3-embedding-0.6b | fp32 | 2274 | 1893 | 2079 | 6.2 | 63.0 | 65.3 | 4.36 | 218.5 | 0 |
| qwen3-embedding-0.6b | int8 | 570 | 1075 | 1075 | 1.04 | 34.3 | 39.3 | 6.3 | 218.5 | 0 |

Ayrıntı (soru bazında sıra ve kosinüs, kaçan sorular): dalga-2-embed.json.
