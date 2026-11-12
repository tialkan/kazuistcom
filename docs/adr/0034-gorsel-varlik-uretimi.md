# ADR-0034: Görsel varlık üretimi

- Tarih: 2026-11-12
- Durum: Önerildi, Tarık onayı bekliyor (karar verilmedi)
- İlgili kararlar: K-15, ADR-0015, ADR-0019; plan 12 madde 7 ve 14; webtasarim.md 18, 19, 32; review.md T3, P4

## Bağlam

Plan 12 madde 7: "Görseller: YZ ile üretilmiş görsel yok (wt.32). Meslek avatarları, Kalemcik ve kart piktogramları tek
çizerden, tek çizgi diliyle (wt.19). Çizer işi teslim edene kadar yalın yer tutucular kullanılır; YZ görseli
kullanılmaz." K-15 ve ADR-0015 aynı yasağı taşır ("YZ ile üretilmiş görsel ve emoji yok"). Bağlayıcı rehber
webtasarim.md'nin girişi "hiçbir yeri yapay zekâ üretimi hissi vermeyecek" der; madde 19 "İllüstrasyon gerekiyorsa tek
elden, tek çizgi diliyle", madde 32 "Yapay zekâ ile üretilmiş görsel, portre, illüstrasyon kullanma" der.

Depoda favicon, simge, OpenGraph görseli ve avatar yoktur; Kalemcik yüzleri (`KalemcikYuzu.tsx`) ve kart piktogramları
(`Isaretler.tsx`) şimdilik kodla çizilidir. Gereken varlıkların listesi review.md P4 tablosundadır: favicon, SVG simge,
Apple simgesi, manifest simgeleri, OpenGraph kartı, 8 meslek için 3 görünümlü 24 avatar, 4 Kalemcik ifadesi, kart
piktogramları.

Tarık bu varlıkları Midjourney ile üretmek istiyor (review.md T3). Bu istek plan 12 madde 7 ile çelişir; bu ADR
seçenekleri ve riskleri yazar, karar vermez.

## Seçenekler

### A. YZ serbest

Midjourney çıktısı doğrudan ürün görseli olur (avatar, Kalemcik, OpenGraph kartı).

- Değişen: K-15, ADR-0015, plan 12 madde 7; webtasarim.md 32'den bilinçli sapma kaydı; on-yuz ajan tanımındaki
  "YZ görseli yok" cümlesi.
- Artı: hızlı ve ucuz; çizer aramaya gerek yok; yayın tarihine etkisi en az.
- Eksi: aşağıdaki lisans ve telif risklerinin hepsi doğrudan ürüne geçer; 24 avatar ve 4 ifadede tek çizgi dilini
  tutturmak zordur; webtasarim.md 32'nin uyardığı el, yazı ve ışık hataları; /tespit sayfası metindeki yapay zekâ izini
  denetleyen bir ürün olduğu için ürünün kendi görsellerinin YZ üretimi olması güven çelişkisi doğurur.

### B. YZ yalnız taslak, son hali çizer yapar

Midjourney yön, kompozisyon ve renk araması için kullanılır; ürüne giren son dosyalar bir çizerin (ya da ekipten bir
kişinin) elden veya vektör olarak yeniden çizdiği işlerdir.

- Değişen: plan 12 madde 7'deki "YZ görseli kullanılmaz" cümlesi "ürüne YZ çıktısı girmez, taslak aşamasında
  kullanılabilir" diye daralır; webtasarim.md 19 (tek el) korunur.
- Artı: tek çizgi dili ve vektör çıktı; son dosyanın insan eseri olması telif ve marka konumunu güçlendirir; taslak
  aşaması çizere verilecek brifingi hızlandırır.
- Eksi: çizer maliyeti ve süresi; çizerin YZ taslağına ne ölçüde bağlı kaldığı telif değerlendirmesini etkiler
  (hukuk-uyum değerlendirir); Midjourney koşulları taslak aşamasında da geçerlidir.

### C. Mevcut kural

YZ görseli yok; varlıklar tek çizerden; çizer teslim edene kadar kodla çizili yalın yer tutucular kalır.

- Değişen: hiçbir şey.
- Artı: plan, ADR-0015 ve webtasarim.md ile tam uyum; telif ve koşul riski yok.
- Eksi: çizer bulunması, maliyet ve süre; P4 çizere bağlı kalır ve tek seferde yayının (ADR-0033) tarihine etki edebilir.

Her üç seçenekte de favicon, SVG simge ve manifest simgeleri gibi küçük, keskin kenarlı varlıklar elde vektör çizilir;
Midjourney çıktısı raster'dır ve küçük boyutta okunurluğu zayıftır. OpenGraph kartı görselsiz, yalnız tipografiyle
de yapılabilir.

## Lisans ve koşul riskleri

1. Midjourney kullanım koşulları birincil kaynaktan okunamadı: `docs.midjourney.com` koşullar sayfası 12 Kasım 2026'da
   otomatik istemciye HTTP 403 döndü ve aşılmaya çalışılmadı. Aşağıdaki dört madde üçüncü taraf özetlerinden alındı,
   doğrulanmadı; karar öncesi Tarık ya da hukuk-uyum resmî sayfadan okuyup tarihli olarak kaydeder:
   - Sahiplik: önceki yıl brüt geliri 1 milyon ABD dolarını aşan şirketler ve çalışanları, ürettikleri varlıklara sahip
     olmak için Pro ya da Mega plana abone olmalıdır. Kulular'ın bu eşiğe göre durumu bilinmiyor.
   - Görünürlük: üretimler varsayılan olarak herkese açık görünür; Stealth kipi yalnız Pro ve Mega planlarda ve "en iyi
     çaba" taahhüdüyledir. Yayından önce marka görsellerinin dışarıda görünmesi istenmiyorsa bu belirleyicidir.
   - Midjourney'in istemler ve çıktılar üzerinde kendi kullanım hakkını sakladığı bildiriliyor.
   - Otomatik araç yasağı: koşulların hizmete otomatik araçla erişmeyi ve üretmeyi yasakladığı bildiriliyor. Bu yüzden
     hiçbir ajan Midjourney'i tarayıcı otomasyonuyla kullanmaz; istemleri Tarık kendi oturumunda elle girer (review.md P4).
2. Telif: FSEK (5846) m.1/B (a) eseri "Sahibinin hususiyetini taşıyan" fikir ve sanat mahsulü, (b) eser sahibini "Eseri
   meydana getiren" kişi olarak tanımlar (mevzuat.gov.tr metni, 12 Kasım 2026'da okundu). Yalnız istemle üretilmiş bir
   görselin bu tanıma girip girmediği ve Kulular'ın üzerinde münhasır hak ileri sürüp süremeyeceği bu ADR'de
   yargılanmaz; hukuk-uyum değerlendirir. Belirsizliğin pratik sonucu: başkaları aynı ya da çok benzer görseli
   kullanabilir ve Kulular bunu engelleyemeyebilir.
3. Marka: Kalemcik ve simge marka olarak tescil edilecekse (marka durumu açık, review.md 1. bölüm), YZ çıktısının üçüncü
   kişilerin eserlerine ya da markalarına benzerliği tescil ve kullanım riski doğurur; seçenek A ve B'de benzerlik
   araması yapılır.
4. Üçüncü kişi hakları: istemlerde sanatçı adı, tanınmış karakter ya da başka bir ürünün görsel kimliği kullanılmaz.
5. Kayıt: hangi seçenek seçilirse seçilsin her varlık için araç, istem, tarih, kişi ve son dosyanın kim tarafından
   çizildiği `docs/tasarim/gorsel-istemleri.md` dosyasına ve ADR-0019 gereği arka plan IP kaydına
   (`docs/ip/arka-plan-kaydi.md`) yazılır.

## Mimarın notu (bağlayıcı değil)

Riski en az olan ve plana en yakın yol B'dir: Midjourney yalnız taslak ve brifing için, ürüne giren dosyalar çizerden;
favicon ve simgeler elde vektör; OpenGraph kartı tipografik. Karar Tarık'ındır (T3).

## Uygulama (karardan sonra)

- A ya da B seçilirse: orkestra plan 12 madde 7'yi, mimar ADR-0015'in Durum satırını ve `.claude/agents/on-yuz.md`
  cümlesini günceller; hukuk-uyum koşul ve telif değerlendirmesini yazar.
- Her seçenekte: on-yuz `docs/tasarim/gorsel-istemleri.md` dosyasına varlık başına boyut, kabul ölçütü ve (A ya da B'de)
  istem yazar; üretimi Tarık yapar.

## Onay kaydı

Tarık'ın Midjourney isteği review.md T3 olarak kaydedildi. Bu ADR karar içermez; Tarık seçeneklerden birini açıkça
seçene kadar plan 12 madde 7 ve ADR-0015 geçerlidir.
