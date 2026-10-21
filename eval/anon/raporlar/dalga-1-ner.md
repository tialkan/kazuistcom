# Anonimleştirme Dalga 1: NER adaylarının karşılaştırması ve seçimi

- Tarih: 2026-10-21
- Motor: `anon-0.2.0+ekE-2026.10.0+ner.<aday>@<revizyon>` (ör. `ner.akdeniz27@99995f7`)
- Setler: `eval/anon/sentetik/` (50 belge, 430 kişi adı, Dalga 1 başlangıç seti) ve `eval/anon/zor/` (35 elle
  yazılmış belge, 69 kişi adı; `build_hard.py`)
- Ham sonuç: `dalga-1-ner.json` (tüm yapılandırmalar, varsayılan iş parçacığı), `dalga-1-ner-tek-is-parcacigi.json`
  (tek iş parçacığı), `dalga-1-ner-ham-span.json` (normalizasyon kapalı denetim ölçümü)
- Komutlar (services/worker-py içinden, `uv sync --extra ner` sonrası):
  - `uv run python ../../eval/anon/export_ner.py` (ONNX'e çevirme ve eşdeğerlik)
  - `uv run python ../../eval/anon/compare_ner.py --out ../../eval/anon/raporlar/dalga-1-ner.json`
  - `uv run python ../../eval/anon/compare_ner.py --threads 1 --only ... --out ...tek-is-parcacigi.json`
  - `uv run python ../../eval/anon/compare_ner.py --raw-spans --only ... --out ...ham-span.json`
- Makine: Apple M4 (10 mantıksal çekirdek), macOS 27, Python 3.12.15, onnxruntime 1.31.0, yalnız
  CPUExecutionProvider. Ağ kapalı (`HF_HUB_OFFLINE=1`); hiçbir metin ağa gönderilmedi, rapora ve loga yazılmadı.

## Önemli uyarı: bu ölçüm yayın kapısının kanıtı DEĞİLDİR

Sentetik set de zor set de kural katmanını yazan ajan tarafından üretildi. Zor set, Dalga 1 raporunda kural
katmanının kaçırdığı bilinen kalıplardan yola çıkılarak elle yazıldı; 35 belge ve 69 addan ibarettir, zorluk
türü başına 1 ile 18 örnek vardır ve istatistiksel güven taşımaz. Bu sonuçlar adayları birbirine göre sıralamak
ve hattın uçtan uca çalıştığını göstermek içindir. 15.3/2 eşikleri (kişi adı %99,5, T.C. kimlik, IBAN, telefon,
e-posta %100, kesinlik %95) yalnız 200 gerçek kararlık, katmanlı ve %20'si çift etiketli setle (plan 6.7)
kanıtlanır. O ölçüm yapılana kadar kapı geçmedi sayılır.

Kurallar bu sete göre ayarlanmadı: kural katmanı (`roles.py`, `structural.py`, `sensitive.py`) bu dalgada
değişmedi. Model çıktısına uygulanan normalizasyon (aşağıda) sonradan eklendi; kazanan yapılandırmada yakalamayı
ve kesinliği değiştirmediği ham span denetimiyle gösterildi (Tablo 5).

## Adaylar, sürümler ve lisanslar

| Aday | Hugging Face, revizyon | Lisans | Durum | ONNX boyutu | Torch ile ONNX eşdeğerliği |
|---|---|---|---|---:|---|
| Hushmark BERTurk Span 112M | lokomotifai/hushmark-berturk-112m, 49ed759 | Apache-2.0 (taban dbmdz BERTurk MIT) | ölçüldü | 427 MB | 402 paragrafta span uyumu %100, en büyük skor farkı 7,0e-6 (referans yükleyiciye karşı) |
| akdeniz27 | akdeniz27/bert-base-turkish-cased-ner, 99995f7 | MIT | ölçüldü, kazanan | 420 MB | 50 belgede en büyük logit farkı 4,5e-5; transformers boru hattına karşı span uyumu %99,1 (sözcük gruplama farkı) |
| GLiNER multi v2.1 | urchade/gliner_multi-v2.1, 443d26d | Apache-2.0 (omurga mdeberta-v3-base MIT) | ölçüldü | 1104 MB | 20 belgede span uyumu %100, en büyük skor farkı 2,0e-5 |
| savasy | savasy/bert-base-turkish-ner-cased | model kartında yok | indirilmedi | | lisans netleşene kadar bekliyor (docs/kararlar.md, 2026-10-20) |

İndirme: dosyalar sabit revizyondan, depo dışına (`~/.cache/kazuist-ner/src/<aday>`) indirildi; büyük dosyaların
sha256 değeri Hugging Face API'sinin yayımladığı değerle, Hushmark'ın tüm dosyaları ayrıca kendi `SHA256SUMS`
dosyasıyla doğrulandı. Pickle içeren `pytorch_model.bin` dosyaları indirilmedi; yalnız safetensors kullanıldı.
GLiNER omurgasının (microsoft/mdeberta-v3-base, MIT) yalnız tokenizer ve yapılandırma dosyaları indirildi.

### Hushmark yükleyici kodunun incelemesi

`hushmark_berturk.py` (sha256 db73264e...) çalıştırılmadan önce okundu. İçe aktardıkları: hashlib, json, random,
re, torch, transformers, safetensors. Ağ çağrısı, alt süreç, dosya silme, `eval` veya `exec`, pickle yükleme
yok; `load_artifact` varsayılan olarak `local_files_only=True` ve `use_safetensors=True` kullanıyor. `example.py`
`snapshot_download` ile ağa çıktığı için çalıştırılmadı. Kod zararsız bulundu ve yalnız dışa aktarmada eşdeğerlik
referansı olarak, `sys.path`'e eklenmeden dosya yolundan yüklendi. Çalışma zamanı bu kodu hiç yüklemez: span
başlığı Kazuist'in kendi modülüyle yeniden kuruldu ve kodlayıcıyla tek ONNX grafiğine çevrildi
(`export_ner.py`). Model kartının kendisi bu sürümü "private challenger, production-adopted değil" olarak
tanımlıyor ve ONNX eşdeğerlik raporu olmadığını söylüyordu; yukarıdaki eşdeğerlik ölçümü bu boşluğu kapatır.

### ONNX ve çalışma zamanı

- Hushmark ve akdeniz27: onnxruntime, tokenizers ve numpy ile çalışır; torch gerekmez. Uzun metin, Hushmark
  için 256, akdeniz27 için 512 alt sözcüklük pencerelere bölünür; pencereler örtüşür ve her birim yalnız
  ortasında kaldığı pencereden alınır (`windows()`, birim testli). akdeniz27 birden çok pencereye yayılan metinde (aynı
  iki cümlenin 80 tekrarı) tespit sayısını tam korudu.
- GLiNER: gliner paketinin ONNX çalışma zamanı; gliner paketi torch'u bağımlılık olarak getirir.

## Sonuçlar

Tanımlar `measure.py` ile aynıdır: yakalama, altın span'ın bütün karakterleri maskelendiyse sayılır; kesinlik,
tahmin bir altın span'la kesişiyorsa doğru sayılır. "ner:" satırları modelin tek başına çıktısıdır (kural katmanı
yok, mikro değerler anlamsız olduğu için verilmedi); "rules+" satırları tam hattır.

### Tablo 1: kişi adı ve genel kesinlik

| Yapılandırma | Sentetik kişi yakalama | Sentetik kişi kesinlik | Sentetik mikro kesinlik | Zor kişi yakalama | Zor kişi kesinlik | Zor mikro kesinlik |
|---|---:|---:|---:|---:|---:|---:|
| `rules` | 97,21% (418/430) | 100,00% | 100,00% | 13,04% (9/69) | 100,00% | 100,00% |
| `ner:hushmark-berturk-112m` | 91,40% (393/430) | 100,00% | - | 79,71% (55/69) | 98,18% | - |
| `ner:akdeniz27` | 100,00% (430/430) | 100,00% | - | 98,55% (68/69) | 100,00% | - |
| `ner:gliner-multi-v2.1` | 63,49% (273/430) | 100,00% | - | 85,51% (59/69) | 95,24% | - |
| `rules+hushmark-berturk-112m` | 100,00% (430/430) | 100,00% | 98,19% | 86,96% (60/69) | 98,36% | 98,41% |
| **`rules+akdeniz27`** | **100,00% (430/430)** | **100,00%** | **100,00%** | **98,55% (68/69)** | **100,00%** | **100,00%** |
| `rules+gliner-multi-v2.1` | 97,21% (418/430) | 100,00% | 98,30% | 94,20% (65/69) | 97,06% | 94,52% |
| `rules+hushmark-berturk-112m+akdeniz27` | 100,00% (430/430) | 100,00% | 98,19% | 98,55% (68/69) | 98,57% | 98,61% |
| `rules+hushmark-berturk-112m+gliner-multi-v2.1` | 100,00% (430/430) | 100,00% | 96,58% | 97,10% (67/69) | 95,65% | 93,15% |
| `rules+akdeniz27+gliner-multi-v2.1` | 100,00% (430/430) | 100,00% | 98,33% | 100,00% (69/69) | 97,18% | 94,67% |
| `rules+hushmark-berturk-112m+akdeniz27+gliner-multi-v2.1` | 100,00% (430/430) | 100,00% | 96,58% | 100,00% (69/69) | 95,77% | 93,33% |

Kural katmanı + akdeniz27 sentetik sette 15.3/2 eşiklerinin tamamını geçiyor (yalnız bilgi; kapı kanıtı değil):
kişi %100, T.C. kimlik, IBAN, telefon, e-posta %100, mikro kesinlik %100. Zor sette kişi %98,55 ile %99,5
eşiğinin altında.

### Tablo 2: modelin tek başına varlık türleri (sentetik set)

| Aday | PERSON | ADDRESS | DOB | HEALTH | CRIMINAL | Doğru / tahmin (tahmin türüne göre) |
|---|---:|---:|---:|---:|---:|---|
| `hushmark-berturk-112m` | 91,40% (393/430) | 100,00% (25/25) | 100,00% (26/26) | 30,77% (4/13) | 0,00% (0/13) | ADDRESS 25/25, CRIMINAL 0/13, DOB 26/26, HEALTH 4/4, PERSON 401/401 |
| `akdeniz27` | 100,00% (430/430) | yok | yok | yok | yok | PERSON 439/439 |
| `gliner-multi-v2.1` | 63,49% (273/430) | 0,00% (0/25) | 100,00% (26/26) | yok | yok | ADDRESS 50/50, DOB 37/49, PERSON 276/276 |

akdeniz27 yalnız PER/ORG/LOC tanır; ORG (tüzel kişi) ve LOC (il, ilçe) Ek E gereği açık kaldığından atılır.
Adres, doğum tarihi ve KVKK m.6 bilgileri kazanan yapılandırmada kural katmanından gelir.

### Tablo 3: gecikme ve bellek (sentetik set, belge ortalaması 763 karakter)

| Yapılandırma | Ort. ms/belge | p95 ms/belge | CPU ms/belge | ms/1000 karakter | Tek iş parçacığı ms/1000 karakter | Yükleme sn | RSS artışı MB | Tepe RSS MB | Editör kuyruğu/belge |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `rules` | 1,5 | 2,7 | 1,4 | 2,0 | 1,6 | 0,00 | 0 | 26 | 1,04 |
| `ner:hushmark-berturk-112m` | 66,6 | 105,2 | 306,3 | 87,3 | - | 1,14 | 411 | 725 | - |
| `ner:akdeniz27` | 44,4 | 78,1 | 194,4 | 58,2 | - | 0,30 | 624 | 680 | - |
| `ner:gliner-multi-v2.1` | 134,6 | 230,7 | 583,4 | 176,3 | - | 7,09 | 471 | 1930 | - |
| `rules+hushmark-berturk-112m` | 54,9 | 88,9 | 269,7 | 71,9 | 126,0 | 0,34 | 640 | 877 | 1,28 |
| **`rules+akdeniz27`** | **36,0** | **52,0** | **178,3** | **47,1** | **92,1** | **0,30** | **624** | **681** | **0,50** |
| `rules+gliner-multi-v2.1` | 272,7 | 540,3 | 741,7 | 357,2 | 227,8 | 4,51 | 578 | 1594 | 1,48 |
| `rules+hushmark-berturk-112m+akdeniz27` | 121,4 | 195,2 | 602,6 | 159,1 | 182,5 | 0,72 | 1063 | 1255 | 0,76 |
| `rules+hushmark-berturk-112m+gliner-multi-v2.1` | 261,2 | 521,9 | 1102,5 | 342,2 | - | 4,55 | 1212 | 1716 | 1,72 |
| `rules+akdeniz27+gliner-multi-v2.1` | 177,8 | 300,7 | 855,7 | 233,0 | - | 9,62 | 877 | 1674 | 0,96 |
| `rules+hushmark-berturk-112m+akdeniz27+gliner-multi-v2.1` | 214,5 | 348,3 | 1111,6 | 281,0 | - | 4,88 | 1109 | 2284 | 1,22 |

Gecikme ölçümü paylaşılan bir geliştirme makinesinde yapıldı; ölçüm sırasında başka süreçler çalışıyordu ve yük
ortalaması 9 ile 31 arasındaydı (`uptime`; bu koşunun JSON'unda alan yok, betik artık
`load_average_1_5_15` kaydediyor). Sayılar mutlak değil, karşılaştırma amaçlıdır: örneğin `rules+gliner-multi-v2.1`
aynı gün önceki iki koşuda 93 ve 98 ms/belge ölçüldü, bu koşuda 273. Sıralama (akdeniz27 en hızlı, GLiNER en
yavaş) bütün koşularda aynı kaldı. "RSS artışı" `ps` ile ölçülen anlık değerdir ve tembel sayfa eşlemesi
yüzünden oynaktır; "Tepe RSS" daha güvenilirdir. "Editör kuyruğu/belge" eşiğin (0,8) altındaki tespit sayısıdır.

Kaba boyutlama (tek iş parçacığı, bu makine): kural katmanı + akdeniz27 1000 karakter başına yaklaşık 92 ms;
20.000 karakterlik bir karar çekirdek başına yaklaşık 1,8 saniye. Türkiye'deki sunucunun CPU'sunda
`compare_ner.py --threads <n>` ile yeniden ölçülmelidir.

### Tablo 4: zor sette zorluk türüne göre kişi adı yakalama

| Zorluk | Altın | `rules` | `rules+akdeniz27` | `rules+hushmark-berturk-112m` | `rules+gliner-multi-v2.1` | `rules+akdeniz27+gliner-multi-v2.1` |
|---|---:|---:|---:|---:|---:|---:|
| akrabalik (sanığın annesi, davacının eşi) | 4 | 0 | 4 | 4 | 4 | 4 |
| baba-adi (Ali oğlu, Hatice'den olma) | 3 | 1 | 3 | 1 | 1 | 3 |
| bas-harf (A.K., M.Ö.) | 2 | 0 | 2 | 2 | 2 | 2 |
| buyuk-harf (müvekkil SERKAN DUMANLI) | 12 | 4 | 12 | 9 | 9 | 12 |
| ek (Erdoğdu'nun, Yalçınkaya'ya) | 16 | 0 | 16 | 16 | 16 | 16 |
| imza (Başkan, Üye, Kâtip satırları) | 3 | 2 | 3 | 2 | 3 | 3 |
| ipucusuz (Olay günü X ile Y) | 18 | 0 | 18 | 18 | 18 | 18 |
| kucuk-harf (OCR) | 2 | 0 | 2 | 2 | 2 | 2 |
| liste (Tanıklar X, Y ve Z) | 9 | 2 | 9 | 8 | 9 | 9 |
| meslek (sosyal çalışma uzmanı, zabıt kâtibi, icra müdürü) | 11 | 0 | 11 | 11 | 10 | 11 |
| ortak-sozcuk (Deniz Yıldız, Umut Barış) | 2 | 2 | 2 | 2 | 2 | 2 |
| soyad-once (YILMAZTÜRK Selçuk) | 3 | 0 | 3 | 3 | 2 | 3 |
| tek-ad (Ayşe, Cem) | 4 | 0 | 4 | 0 | 4 | 4 |
| tire (Yılmazer-Demirtaş) | 1 | 0 | 0 | 0 | 1 | 1 |
| uc-sozcuk (Mehmet Ali Gündoğar) | 2 | 0 | 2 | 2 | 2 | 2 |
| yabanci (Maria Schneider, John O'Neil) | 2 | 0 | 2 | 2 | 2 | 2 |

Bir belge birden çok etiket taşıyabildiği için satırlar toplamı 69'dan büyüktür. Olumsuz örneklerde (kişi adı
taşıyan yer adları: Mehmet Akif Ersoy Mahallesi, Fatih Sultan Mehmet Köprüsü, Atatürk Bulvarı; kurum ve şirket
adları; adsız rol sözcükleri) kazanan yapılandırma hiçbir yanlış kişi tespiti üretmedi.

### Tablo 5: normalizasyon denetimi (normalize / ham model çıktısı)

| Yapılandırma | Sentetik kişi yakalanan | Zor kişi yakalanan | Zor kişi kesinlik |
|---|---|---|---|
| `rules+akdeniz27` | 430 / 430 | 68 / 68 | 100,00% / 100,00% |
| `rules+hushmark-berturk-112m` | 430 / 430 | 60 / 59 | 98,36% / 100,00% |
| `rules+gliner-multi-v2.1` | 418 / 418 | 65 / 65 | 97,06% / 92,96% |
| `rules+hushmark-berturk-112m+akdeniz27` | 430 / 430 | 68 / 68 | 98,57% / 100,00% |
| `rules+akdeniz27+gliner-multi-v2.1` | 430 / 430 | 69 / 69 | 97,18% / 93,24% |

Normalizasyon (`anonymizer/ner.py`, `normalize_spans`): model PERSON span'ı satır sonunda, virgül, noktalı virgül,
eğik çizgide ve "ve", "ile", "veya" bağlaçlarında bölünür; baştaki unvan ve rol sözcükleri (Av., Dr., Davacı,
Tanık, Vekili...) ve sondaki ticaret unvanı sözcükleri (İnşaat, Ltd. Şti....) ayıklanır. Gerekçesi Türkçe adların
ve Ek E'nin özelliğidir, bir test setinin değil: bir ad satır sonunu ve bağlacı aşmaz, unvan adın parçası
değildir, ticaret unvanındaki ad `[Şahıs İşletmesi]` kuralına gider. Hushmark'ın "Av. Cem Tunçel\nDAVALI : Burak
Tezcan İnşaat" gibi iki kişiyi ve başlığı tek span yapan çıktısı yüzünden eklendi. Bir ad karakterini asla
açmadığı, iki setteki her altın kişi span'ı üzerinde birim testle doğrulanır
(`test_normalisation_never_unmasks_a_gold_name`). Geliştirme sırasında bu denetimle iki hata bulundu ve
düzeltildi: kenar kırpma baş harfin sondaki noktasını ve modelin ".K." olarak verdiği ikinci baş harfin baştaki
noktasını siliyordu ("A.K." içinde maskesiz bir "." kalıyordu). Tablo 5'te kazanan yapılandırmada sonuç
değişmiyor. Hushmark'ta zor sette bir ad fazla yakalanıyor: birleşik span bölününce
"Sarıgül" soyadı ayrı anahtar olup belgenin başka yerine yayılıyor; aynı bölme bir "SUÇ" başlığını tek başına
kişi parçası olarak bırakıp kesinliği düşürüyor.

## Kazanan: kural katmanı + akdeniz27

`KAZUIST_NER_BACKEND=akdeniz27`. Gerekçe:

1. Yakalama: tek modelli birleşimler içinde zor sette en yüksek (68/69), sentetik sette tam (430/430). Kural
   katmanının bilinen boşluklarının (rol sözcüğü olmayan, tamamı büyük harfli, akrabalık ve meslek sözcüğünden
   sonraki adlar) tamamını kapattı.
2. Kesinlik: iki sette de %100; olumsuz örneklerde yanlış kişi yok. Diğer adayların hepsi en az bir sette
   kesinlik kaybettiriyor (Hushmark'ın CRIMINAL, GLiNER'in DOB tespitleri).
3. Maliyet: en hızlı ve en az bellekli NER (tepe RSS yaklaşık 680 MB); yalnız onnxruntime, tokenizers ve numpy
   ister, torch gerekmez. Editör kuyruğu yükünü kural katmanına göre yarıya indirdi (sentetik sette 52 yerine 25 tespit):
   kural katmanının 0,72 puanlı 27 soyadı eşleşmesini model yüksek puanla doğruluyor; kalanlar m.6 sözlüğünün
   CRIMINAL ve UNION tespitleri.
4. Lisans: MIT. Eğitim verisi model kartına göre gözden geçirilmiş Türkçe NER veri kümesidir (haber metni);
   sentetik değildir ama hukuk metni de değildir.

Neden birleşim seçilmedi:

- `rules+akdeniz27+gliner-multi-v2.1` zor sette 69/69 yakalıyor, ama tek ek kazanım tek örnekli tireli ad. Bedeli:
  zor sette kişi kesinliği %97,18 ve mikro kesinlik %94,67 (%95 eşiğinin altında), sentetik sette olay
  tarihlerini doğum tarihi sanan 12 yanlış DOB tespiti (Ek E'ye göre olay tarihleri açık kalmalı), yaklaşık 5 kat
  gecikme, 2,5 kat bellek ve torch bağımlılığı. Gerçek sette yeniden değerlendirilmeli.
- `rules+hushmark-berturk-112m+akdeniz27` akdeniz27'ye kişi adında bir şey katmıyor, kesinliği düşürüyor, gecikmeyi
  yaklaşık 3 katına çıkarıyor. Hushmark'ın KVKK m.6 tespitleri (HEALTH 4/13) kural sözlüğünün gerisinde.

## Aday bazında hata analizi

### akdeniz27

- Tek kaçak (zor-024): "Ayşe Yılmazer-Demirtaş" iki span olarak geliyor ("Ayşe Yılmazer", "Demirtaş"); yalnız
  tire maskesiz kalıyor. Katı ölçüt bunu kaçak sayar; bilgi sızmaz ama aynı kişi iki etiket alır.
- Baş harfler: "A.K." iki span ("A" ve ".K.") olarak geliyor; tamamı maskeli, ama aynı kişi iki etiket alıyor
  ("[Sanık 1][Sanık 2]"). Bitişik ad parçalarını birleştiren bir kural zor sete göre ayar olacağı için
  eklenmedi; gerçek sette sıklığı ölçülmeli.
- Tek ad, baba ve ana adı, küçük harfli (OCR) adlar yakalandı. Bunlar her biri 2 ila 4 örnektir.

### Hushmark BERTurk Span 112M

- Span'ı satır sonu ve bağlaç üzerinden birden çok kişiye yayıyor ("Kemal Sarıgül ile Hakan Ertürk" tek span);
  normalizasyon olmadan iki kişi tek etiket alır ve "DAVALI :" gibi başlıklar maskelenir.
- Tek adları (tek-ad 0/4) ve baba ve ana adını (1/3) kaçırıyor; rol sözcüğünden sonraki tek soyadını
  ("Sanık Akbulut") tek başına kaçırıyor (kural katmanının yayılımı yakalıyor).
- Uzun bağlamda kayıp: aynı iki cümle 7 kez tekrarlandığında (168 alt sözcük, tek pencere) tespitlerin bir kısmı,
  10 tekrarda "Kemal Sarıgül ile Hakan Ertürk" tamamen düşüyor. Referans yükleyici aynı sonucu veriyor; bu
  pencerelemenin değil modelin özelliğidir. Gerçek kararlar uzundur; bu risk gerçek sette ölçülmeli.
- KVKK m.6: HEALTH 13'te 4. CRIMINAL'de 13 tahminin hiçbiri altınla kesişmiyor; hepsi "kasıtlı suçtan mahkûmiyet"
  ifadesi ve altın yalnız komşu "adli sicil kaydında" ifadesini işaretliyor. İçerik olarak sabıka bilgisidir ve
  altın dar olabilir; altın sonradan değiştirilmedi. Skorlar 0,64 ile 0,80 arasında olduğu için bu tespitler
  editör kuyruğunu büyütüyor (1,28 belge başına).

### GLiNER multi v2.1

- Sentetik sette kişi adında zayıf (tek başına %63,49); kural katmanına eklenince sentetik sette kazanç yok.
  Tokenizer'ın doğru çalıştığı ayrıca denetlendi (sentencepiece yavaş tokenizer ile hızlı tokenizer aynı çıktı);
  eşik model kartındaki 0,5 olarak bırakıldı, sete göre ayarlanmadı.
- DOB: sentetik sette 49 tahminin 12'si altınla kesişmiyor (olay ve işlem tarihleri).
- En ağır aday: tepe RSS 1,6 ile 2,3 GB, en yüksek gecikme, torch gerektirir. Tireli adı bütün yakalayan tek aday.

## Bağlama

- `KAZUIST_NER_BACKEND`: aday anahtarı veya `+` ile birleşim. Boşsa yalnız kural katmanı (`ner.none`). Verilip
  model ya da bağımlılık yoksa yükleme hata verir ve işçi başlamaz (`core/main.py`), sessizce zayıf moda düşmez.
- `KAZUIST_NER_DIR` (varsayılan `~/.cache/kazuist-ner`), `KAZUIST_NER_THREADS` (onnxruntime iş parçacığı).
  `KAZUIST_NER_QUANTIZED=1` int8 modeli seçer; bu dalgada ölçülmedi ve kullanılmamalı.
- Sürüm: model revizyonu `anonymizationVersion`'a girer (`ner.akdeniz27@99995f7`); model veya normalizasyon
  değişince kayıtlar yeniden işlenir (plan 6.4/7).
- Ağır bağımlılıklar `ner` extra'sında kalır; CI hafif ortamda koşar, model testleri model yoksa atlanır. Üretim
  imajı için torch'suz `ner-runtime` extra'sı istendi (`docs/istekler/anonimlestirme-ner-calisma-zamani.md`).

## Sınırlar

- Kapı kanıtı değildir (yukarıdaki uyarı). Gerçek kararlarda imza blokları, uzun belgeler, OCR bozulmaları,
  tablo biçimli başlıklar ve kaynağında kısmen anonim metinler bu setlerde temsil edilmiyor.
- akdeniz27 hukuk metniyle eğitilmedi; Hushmark yalnız sentetik veriyle eğitildi; GLiNER'in eğitim verisi model
  kartına göre urchade/pile-mistral-v0.1'dir (Türkçe hukuk metni değil). Üçünün de gerçek Türkçe kararlarda başarısı bilinmiyor.
- Zor set küçük ve yazarı kural katmanının yazarıdır; zorluk türü başına örnek sayısı karar vermeye yetmez.
- Gecikme paylaşılan makinede ölçüldü (yük ortalaması 9 ile 31); sunucuda yeniden ölçülmeli. int8 nicemleme
  ölçülmedi.
- Kural katmanının sentetik setteki 12 kaçağı ("Sosyal çalışma uzmanı" sonrası adlar) bilerek kural ekleyerek
  kapatılmadı; NER bunları yakalıyor.

## Sonraki adım

1. ADR-0022 onayıyla 200 gerçek kararlık setin (mahkeme ve tür bazında katmanlı, %20'si çift etiketli)
   etiketlenmesi ve aynı betiklerle ölçüm; kazanan bu sette yeniden doğrulanır.
2. Modellerin Türkiye'deki sunucuya kurulması (manifest sha256 doğrulamasıyla) ve gecikmenin orada ölçülmesi.
3. Gerçek sette kaçak analizi; bitişik ad parçaları (tire, baş harf) ve Hushmark'ın uzun bağlam kaybı için
   karar orada verilir (Dalga 3).
