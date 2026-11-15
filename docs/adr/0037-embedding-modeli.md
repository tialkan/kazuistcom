# ADR-0037: Embedding modeli BGE-M3 (int8, CPU, ONNX Runtime)

- Tarih: 2026-11-14
- Durum: Kabul edildi (Tarık İsmet Alkan, 15 Kasım 2026)
- İlgili kararlar: K-06 ve ADR-0006 (PostgreSQL içinde hibrit getirme, `halfvec(1024)`), ADR-0026 (`embed.chunks`,
  `ner-runtime` ekstrası), ADR-0030 ve ADR-0033 (Hetzner, tek sunucu, 8 GB Arm64 ile 16 GB x86 arası); plan 5.3,
  5.5, 6.7, 7.2/3; review.md P9 madde 1 ve 9
- Yazan: casuist ajanı (orkestranın görevlendirmesiyle; `docs/adr/**` mimarın yoludur, mimar ve Tarık gözden geçirir)

## Bağlam

Arama dizininin vektör kolu kapalıdır: `services/worker-py/nlp/embedder.py` öntanımda model yüklemez, `embed.chunks`
parçaları vektörsüz yazar ve arama `degraded: ['vektor']` bildirerek yalnız tam metin ve kimlik koluyla cevap verir.
Plan 5.3 üç aday sayar (BGE-M3, Qwen3-Embedding-0.6B, multilingual-e5-large) ve seçimi `eval/embed` ölçümüne
(nDCG@10 ve CPU gecikmesi) bağlar. Kısıtlar:

1. Lisans açık olmalı; AGPL ve SSPL ADR'siz eklenmez (CLAUDE.md).
2. Vektör boyutu 1024 olmalı; `chunks.embedding` `halfvec(1024)`'tür, başka boyut şema ADR'si ister (ADR-0006).
3. Model kendi sunucumuzda, ONNX Runtime ile CPU'da çalışır (plan 5.3). ADR-0033'e göre üretim tek sunucudur ve
   aralığın alt ucu Hetzner CAX21'dir: Arm64 (Ampere), 4 vCPU, 8 GB RAM. Aynı sunucuda Coolify, web, worker-node,
   PostgreSQL ve pgvector, Valkey ve NER modeliyle worker-py çalışır.
4. Çalışma anında indirme yok; model dosyaları salt okunur birimden okunur (`KAZUIST_EMBED_DIR`).

Plan 6.7'deki 300 soruluk `eval/embed` seti henüz yoktur. Bu ölçüm iki setle yapıldı:

- `eval/rag/set-50.json`: Dalga 2 kaynaklı özet seti; 39 beklenen kaynaklı soru (36 cevaplı ve 3 tuzak) ve 11
  cevapsız soru (beklenen kaynağı olmayan tuzak dahil).
- `eval/embed/set-sentetik.json` (yeni): 60 soru, fikstür derleminin metni okunarak casuist ajanınca yazıldı; kelime
  örtüşmesi bilerek düşük (gündelik dil, eş anlamlı ifade, kısaltma, Türkçe sorudan İngilizce GDPR metnine). Gerçek
  kişi verisi yoktur. Etiketler hukukçu editör teyidi bekliyor.

Derlem her ikisi için `packages/casuist/fixtures/kayitlar.json` (75 kayıt, 202 parça; KVKK, TBK m.49-75, beş Anayasa
maddesi, yedi Yargıtay kararı, bir Kurul kararı, GDPR m.1-2). Küçük ve dar bir derlemdir; sonuçlar yön gösterir,
kesin değildir.

## Lisanslar (birincil kaynak)

Her adayın lisansı sabitlenen revizyondaki model kartının ön bilgisinden (`README.md` YAML `license`) ve Hugging Face
API'sinin `cardData.license` alanından okundu; ikisi ve `nlp/embedder.py` `CANDIDATES` değeri eşleşmezse
`eval/embed/hazirla.py indir` durur. Okuma tarihi 14 Kasım 2026.

| Aday | Resmî depo ve revizyon | Lisans | Temel model ve lisansı | ONNX kaynağı |
|---|---|---|---|---|
| BGE-M3 | `BAAI/bge-m3` `5617a9f61b028005a4858fdac845db406aefb181` | MIT | `FacebookAI/xlm-roberta-large`, MIT | Depodaki resmî `onnx/` dışa aktarımı (havuzlama ve normalleştirme grafikte) |
| multilingual-e5-large | `intfloat/multilingual-e5-large` `3d7cfbdacd47fdda877c5cd8a79fbcc4f2a574f3` | MIT | `FacebookAI/xlm-roberta-large`, MIT | Depodaki resmî `onnx/` dışa aktarımı |
| Qwen3-Embedding-0.6B | `Qwen/Qwen3-Embedding-0.6B` `97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3` | Apache-2.0 | `Qwen/Qwen3-0.6B-Base`, Apache-2.0 | Resmî ONNX yok; safetensors ağırlıklarından `torch.onnx` ile dışa aktarıldı, Torch ile fark en çok 6,4e-7 |

Plan dışı olduğu için ölçülmeyen, lisansı aynı gün okunan modeller: `jinaai/jina-embeddings-v3` CC BY-NC 4.0
(ticari kullanım yok, elendi), `google/embeddinggemma-300m` Gemma kullanım şartları ve kapılı erişim (OSI lisansı
değil), `Snowflake/snowflake-arctic-embed-l-v2.0` Apache-2.0 ve `intfloat/multilingual-e5-large-instruct` MIT
(ikisi de 1024 boyutlu; 300 soruluk set gelince aday olabilir).

İndirilen her dosya Hub'ın bildirdiği özete karşı denetlendi (LFS dosyalarında sha256, diğerlerinde git blob sha1);
kayıt `~/.cache/kazuist-embed/src/<aday>/kazuist_download.json`. Model dosyaları depoya girmez.

## Ölçüm

Komutlar: `eval/embed/olc.py --yaz` (vektör kolu tek başına, her aday ve biçim ayrı süreçte) ve
`eval/embed/hibrit.ts` (aynı vektörlerle `packages/casuist` `search()`, tam metin ve kimlik koluyla RRF). Raporlar:
`eval/embed/raporlar/dalga-2-embed.md` ve `dalga-2-hibrit.md`. Makine Apple M4, 4 iş parçacığı, onnxruntime 1.31.0;
hedef sunucuda ölçülmedi.

### Vektör kolu tek başına (pasaj biçimi: yalnız parça metni, üretimdeki `embed.chunks` gibi)

| Aday | Biçim | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 nDCG@10 | rag-50 en üst kosinüs, cevaplı / cevapsız |
|---|---|---|---|---|---|---|
| BGE-M3 | fp32 | %90,0 | 0,779 | %79,5 | 0,851 | 0,69 / 0,53 |
| BGE-M3 | int8 | %93,3 | 0,787 | %82,0 | 0,860 | 0,69 / 0,52 |
| multilingual-e5-large | fp32 | %95,0 | 0,804 | %82,0 | 0,865 | 0,88 / 0,82 |
| multilingual-e5-large | int8 | %95,0 | 0,774 | %84,6 | 0,874 | 0,88 / 0,82 |
| Qwen3-Embedding-0.6B | fp32 | %90,0 | 0,706 | %71,8 | 0,832 | 0,67 / 0,48 |
| Qwen3-Embedding-0.6B | int8 | %85,0 | 0,659 | %61,5 | 0,777 | 0,65 / 0,47 |

Eşleştirilmiş nDCG@10 farkı (iki setin 99 etiketli sorusu, soruların yeniden örneklenmesiyle %95 aralık): int8'de
BGE-M3 eksi e5 +0,002 [-0,038, +0,043], BGE-M3 eksi Qwen3 +0,110 [+0,055, +0,166], e5 eksi Qwen3 +0,108
[+0,043, +0,170]. fp32'de BGE-M3 eksi e5 -0,021 [-0,062, +0,021]. Yani BGE-M3 ile e5 arasında bu setlerle fark
gösterilemedi; Qwen3 int8 ikisinden de geride. Vektör kolu tek başına rag-50'nin kimlik sorularını ("KVKK m.11",
"TBK 49", esas ve karar numarası) bulamaz; bunları kimlik kolu çözer (hibrit tabloda isabet@10 %100).

### Hibrit arama (`search()`, tam metin ve kimlik koluyla RRF, `KAZUIST_EMBED_ESIK=0`)

| Satır | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 nDCG@10 | Cevapsız 11 soruda ilk sonuç "Yüksek ilgililik" |
|---|---|---|---|---|---|
| Vektörsüz (bugünkü üretim) | %80,0 | 0,610 | %92,3 | 0,965 | 1 |
| Karakter üçlüsü (fikstür) | %80,0 | 0,589 | %92,3 | 0,968 | 0 |
| BGE-M3 int8 | %91,7 | 0,748 | %92,3 | 0,968 | 1 |
| BGE-M3 fp32 | %93,3 | 0,745 | %94,9 | 0,978 | 1 |
| multilingual-e5-large int8 | %90,0 | 0,737 | %89,7 | 0,952 | 11 |
| Qwen3-Embedding-0.6B int8 | %85,0 | 0,650 | %92,3 | 0,968 | 1 |

### Kaynak kullanımı (Apple M4, 4 iş parçacığı, metin başına bir çalıştırma)

| Aday | Biçim | Disk | Yüklenince / tepe RSS | Sorgu p50 / p95 | Pasaj hızı | Ort. token (parça) |
|---|---|---|---|---|---|---|
| BGE-M3 | fp32 | 2162 MB | 1610 / 1763 MB | 23 / 28 ms | 9,3/sn | 150 |
| BGE-M3 | int8 | 542 MB | 1412 / 1412 MB | 11 / 13 ms | 15,8/sn | 150 |
| multilingual-e5-large | int8 | 535 MB | 1410 / 1410 MB | 12 / 14 ms | 15,8/sn | 152 |
| Qwen3-Embedding-0.6B | fp32 | 2274 MB | 1893 / 2079 MB | 63 / 65 ms | 4,4/sn | 219 |
| Qwen3-Embedding-0.6B | int8 | 570 MB | 1075 / 1075 MB | 34 / 39 ms | 6,3/sn | 219 |

fp32 ile int8 vektörlerinin kosinüs uyumu (8 sınama cümlesi, sorgu ve pasaj): BGE-M3 en düşük 0,981, e5 0,992,
Qwen3 0,921. RSS macOS'ta ölçüldü; Linux'ta ve Ampere'de farklı olabilir.

## Karar (öneri)

1. Embedding modeli BGE-M3'tür (`BAAI/bge-m3`, revizyon `5617a9f61b028005a4858fdac845db406aefb181`, MIT), 1024
   boyut, CLS havuzlama ve L2 normalleştirme (resmî ONNX grafiğinin içinde), sorgu ve pasajda önek yok.
2. Üretimde int8 dinamik nicemlenmiş grafik (`model_quantized.onnx`, yaklaşık 543 MB) kullanılır
   (`KAZUIST_EMBED_QUANTIZED=1`). fp32 grafik (2,2 GB) 8 GB sunucu için önerilmez.
3. Gömme her metin için ayrı çalışır (`OnnxEmbedder.batch_size = 1`): int8 nicemleme etkinleştirmeleri bütün yığın
   üzerinden ölçeklediği için yığınla gömülen pasajın vektörü yığın arkadaşlarına bağlı kalıyordu (aynı metnin tek
   başına vektörüyle kosinüs en düşük 0,986); CPU'da yığın hız da kazandırmadı. Böylece pasaj vektörü yeniden
   üretilebilir ve sorgu vektörüyle aynı yoldan hesaplanır.
4. Öntanım değişmez: `KAZUIST_EMBED_BACKEND` boşken işçi vektörsüz yazar. Model, bu ADR onaylandıktan, altyapi
   birimi kurduktan (`docs/istekler/altyapi-embed-model-birimi.md`) ve hedef sunucuda yeniden ölçüldükten sonra
   şu değerlerle açılır: `KAZUIST_EMBED_BACKEND=bge-m3`, `KAZUIST_EMBED_DIR=/models/embed`,
   `KAZUIST_EMBED_QUANTIZED=1`, `KAZUIST_EMBED_THREADS=2` (16 GB x86 seçilirse 4). Saklanan model kimliği
   `bge-m3@5617a9f`'tir; web tarafında `KAZUIST_EMBED_MODEL` aynı değeri alır.
5. `KAZUIST_EMBED_ESIK` (vektör isabeti alt sınırı) şimdilik 0 kalır: hibrit ölçümde BGE-M3 cevapsız sorularda
   "Yüksek ilgililik" sayısını vektörsüz duruma göre artırmadı. Eşik 300 soruluk setle ayarlanır.
6. Şema değişmez (`halfvec(1024)`, HNSW kosinüs).

## Gerekçe

- Getirme: Vektör kolu tek başına ölçüldüğünde BGE-M3 ile multilingual-e5-large arasındaki fark iki setin 99
  etiketli sorusunda istatistiksel olarak gösterilemedi (eşleştirilmiş farkın %95 aralığı sıfırı içeriyor); ikisi de
  int8'de Qwen3-Embedding-0.6B'den iyi (aralık sıfırın üstünde). Hibrit aramada BGE-M3 int8 sentetik sette nDCG@10'u
  0,610'dan 0,748'e, isabet@10'u %80,0'dan %91,7'ye çıkardı; rag-50 değerleri düşmedi.
- Belirleyici fark ilgililik ölçeğidir: `relevance()` (`packages/casuist/src/scoring.ts`) kosinüsü kanıt olarak
  kullanır. multilingual-e5-large kosinüsleri dar ve yüksek bir aralıkta toplanır (rag-50'de en üst kosinüs cevaplı
  sorularda ortalama 0,88, cevapsızlarda 0,82); bu yüzden cevapsız 11 sorunun 11'inde ilk sonuç "Yüksek ilgililik"
  etiketi aldı. BGE-M3'te (0,69 ve 0,52) bu sayı vektörsüz durumla aynı kaldı (1). e5 ile ilgililik etiketleri ve
  çekimserlik ayrı bir ölçek ayarı ister; BGE-M3 bugünkü puanlamayla çalışır.
- Kaynak: BGE-M3 ve multilingual-e5-large aynı XLM-RoBERTa-large gövdesini paylaşır; bellek, disk ve süre
  neredeyse aynıdır. Qwen3-Embedding-0.6B sorguda yaklaşık üç kat yavaş, int8'de kalite kaybı büyük (fp32 ile kosinüs
  en düşük 0,921) ve Türkçe parçaları ortalama yüzde 46 daha çok tokena böler (219 ve 150).
- İşletim: BGE-M3'ün resmî ONNX grafiği havuzlamayı ve normalleştirmeyi içerir, önek gerektirmez (önek unutma hatası
  olmaz), 8192 token bağlam kabul eder (fikstürdeki en uzun parça 375 token).

## Sonuçlar

- Bellek: int8 model yüklenince ölçüm süreci yaklaşık 1,4 GB RSS'e çıktı ve metin başına çalıştırmada gömme
  sırasında artmadı (macOS ölçümü; XLM-R tokenizer'ı tek başına yaklaşık 0,4 GB). NER modeli aynı süreçte açılırsa
  worker-py için yaklaşık 2,5 GB ayrılmalıdır. 8 GB sunucuda PostgreSQL, web ve Coolify ile birlikte sığar ama paylaşımlı bütçe dardır;
  hedef sunucuda `eval/embed/olc.py --threads 2` ile yeniden ölçülür.
- Sorgu gecikmesi M4'te p95 yaklaşık 13 ms. Ampere çekirdeğinde ve 2 iş parçacığında daha yavaş olacaktır; kaç kat
  olduğu ölçülmedi, hedef sunucu ölçümü 1,5 sn arama bütçesindeki payı gösterecek.
- Toplu gömme M4'te 4 iş parçacığıyla saniyede yaklaşık 16 parçadır. CAX21'de 2 iş parçacığıyla bunun belirgin
  altında kalacağı için tam corpus'un ilk gömmesi günler sürebilir. Plan 5.5 ilk dolum için yalnız anonimleştirilmiş
  metinle yurt dışı GPU seçeneğini ADR şartına bağlar; gerekirse ayrı ADR yazılır. Sonraki günlük güncellemeler
  işçide akar.
- Parçaya kayıt başlığı eklemek (`"<başlık>\n<parça>"`) BGE-M3 int8 ile rag-50'de vektör kolunun isabet@1'ini
  %82,0'dan %94,9'a, hibrit isabet@1'i %92,3'ten %97,4'e çıkardı; sentetik sette fark yok. Üretim bugün yalnız
  `masked_text` parçasını gömer (ADR-0026); başlığı eklemek `embed.chunks` okuma kuralını değiştirir ve başlığın
  maskeleme durumu netleşmeden yapılmaz. Ayrı istek konusudur.
- Geri dönüş: model değişirse `chunks.embedding_model` farklı olduğu için eski vektörler kullanılmaz
  (`packages/casuist/src/vector.ts`), `nlp.reconcile` parçaları yeni modelle yeniden kuyruğa alır. Karar yeniden
  ölçümle değiştirilebilir.
- Açık: 300 soruluk `eval/embed` seti (plan 6.7), hedef sunucuda ölçüm, sorgu gömme HTTP servisi (web
  `KAZUIST_EMBED_URL`; casuist'in sıradaki işi; aynı süreçte tek model kopyası paylaşılmalı, ikinci kopya yaklaşık
  1,4 GB daha ister), başlık ekleme kararı.

## Uygulama

- casuist (bu ADR ile aynı PR): `nlp/embedder.py` adayları revizyon ve lisansla sabitler, öntanım `batch_size = 1`;
  `nlp/model_check.py` kurulum denetimi; `eval/embed/hazirla.py`, `olc.py`, `hibrit.ts`, `set-sentetik.json` ve
  raporlar.
- altyapi: `docs/istekler/altyapi-embed-model-birimi.md` (`--extra ner-runtime`, `/models/embed` salt okunur birim,
  kurulum denetimi, ortam değişkenleri).
- mimar: `.env.example` açıklaması "no candidate is measured yet" yerine bu ADR'ye atıf yapacak biçimde
  güncellenir; ADR dizini satırı bu PR'da eklendi.

## Durum

Kabul edildi (Tarık İsmet Alkan, 15 Kasım 2026). Onay, değişkenlerin üretimde verilmesine ancak altyapi birimi kurulup hedef sunucuda
ölçüm alındıktan sonra izin verir.
