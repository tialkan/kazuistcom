# Görsel varlıklar: ölçü, kabul ölçütü, çizen ve taslak istemleri

Kaynak: ADR-0034 (seçenek B, Tarık İsmet Alkan, 12 Kasım 2026), plan 12 madde 7 ve 14, review.md P4,
webtasarim.md 18, 19, 20, 25, 32, 116, 120, 130. Tasarım yönü: docs/tasarim/yon.md.

Bu dosya her görsel varlık için ölçüyü, biçimi, kabul ölçütünü, son dosyayı kimin çizeceğini ve yalnız taslak aşaması
için Midjourney istemini yazar. Ayrıca her varlığın araç, istem, tarih ve çizen kaydını tutar (ADR-0034, lisans ve
koşul riskleri madde 5).

## 1. Bağlayıcı kurallar

1. Ürüne YZ çıktısı girmez. Midjourney yalnız yön, kompozisyon ve renk araması ile çizer brifingi içindir. Taslak
   görsel depoya, `apps/web/public` altına ya da herhangi bir ürün yüzeyine (site, iOS, e-posta, paylaşım kartı,
   sunum) girmez.
2. Çizer taslağı kopyalamaz, üzerinden geçmez ve iz sürmez; taslağı yalnız yön örneği olarak görür. Taslağa
   bağlılığın telif değerlendirmesi hukuk-uyum ajanınındır (ADR-0034, seçenek B eksileri).
3. Hiçbir ajan Midjourney'e erişmez, tarayıcı otomasyonuyla istem göndermez. İstemleri Tarık kendi oturumunda elle
   yapıştırır (review.md P4).
4. Midjourney kullanım koşulları birincil kaynaktan okunmadı (ADR-0034 madde 1: koşullar sayfası otomatik istemciye
   HTTP 403 döndü). İlk taslaktan önce Tarık resmî koşul sayfasını okur ve aşağıdaki kayıt tablosuna okuma tarihini
   yazar. Özetlerde bildirilen ama doğrulanmamış üç nokta üretimden önce özellikle okunur: şirket geliri eşiğine bağlı
   plan şartı, üretimlerin varsayılan olarak herkese açık görünmesi (Stealth kipi) ve Midjourney'in istem ve çıktılar
   üzerinde sakladığı kullanım hakkı. Stealth kipi yoksa Kalemcik ve avatar taslakları yayından önce dışarıda
   görülebilir.
5. İstemlerde sanatçı adı, tanınmış karakter, film ya da oyun adı, marka, kurum amblemi, baro ya da bakanlık logosu,
   bayrak, gerçek kişi ve "... tarzında" kalıbı yoktur. Aşağıdaki istemler bu kurala göre yazıldı; değiştirilirken de
   uyulur.
6. Renkler yalnız belirteçlerdendir (`packages/ui/src/tokens.css`). Vurgu rengi (lâl) azdır; ikinci marka rengi yoktur.

   | Ad | Belirteç | Değer |
   |---|---|---|
   | Kâğıt | `--kz-color-bg` | `#fbf8f1` |
   | Yüzey | `--kz-color-surface` | `#fffdf8` |
   | Soluk yüzey | `--kz-color-surface-muted` | `#f2ede2` |
   | Mürekkep | `--kz-color-text` | `#1c1b19` |
   | İkincil metin | `--kz-color-text-muted` | `#57524a` |
   | Çizgi | `--kz-color-border` | `#d6cfbf` |
   | Lâl (tek vurgu) | `--kz-color-accent` | `#a1351f` |

7. Açık ve koyu zemin: ürün tek temalıdır (K-15), ama simge koyu tarayıcı sekmesinde, iOS ana ekranında ve paylaşım
   önizlemesinde koyu zeminde de görünür. Her varlık `#ffffff` ve `#202124` zeminlerde denetlenir.
8. Erişilebilirlik: anlam taşıyan görselin alternatif metni `packages/i18n` sözlüğündedir; süs görselinde `alt=""`
   ya da `aria-hidden`; renk tek başına bilgi taşımaz (plan 12 madde 12).
9. Teslim: SVG (kare `viewBox`, gömülü raster yok, metin yok, betik yok, dış bağlantı yok), katmanlı kaynak dosya,
   çizerin "teslim edilen dosyalarda YZ çıktısı kullanılmadı" yazılı beyanı ve mali hakların Kulular'a devrini ayrı
   ayrı gösteren yazılı sözleşme. Sözleşme metnini ve hangi hakların sayılacağını hukuk-uyum hazırlar.

## 2. Ortak çizgi dili (çizer brifingi)

Kazuist'in yönü kâğıt ve mürekkeptir: klasik şerh sayfasında metin ortada, kaynak notu kenarda lâl mürekkeple durur.
Çizimler bu sayfanın kenarına mürekkeple çizilmiş gibi durur (webtasarim.md 19: tek el, tek çizgi dili; 20: tek set,
aynı çizgi kalınlığı).

- Çizgi: tek kalınlık, yuvarlak uç ve yuvarlak birleşim. Avatar ve Kalemcik için 100 birimlik çizim alanında
  3 birim; piktogramlar için 20 birimlik ızgarada 1,75 birim.
- Dolgu: düz renk; gradyan, gölge, doku, parlama, cam efekti yok (webtasarim.md 27).
- Biçim: sade ve geometrik, ama mekanik değil; elle çizilmiş hissi çizgi kalınlığının tutarlılığından gelir, titrek
  çizgiden değil.
- Yüz: iki nokta göz, tek çizgi ağız. Kalemcik'in yüz dili avatarlarla aynıdır.
- Metin ve harf yok (paylaşım kartı hariç; o tipografiktir).

## 3. Durum özeti

| # | Varlık | Yol | Ölçü | Biçim | Son dosyayı çizen | Midjourney | Durum (2026-11-12) |
|---|---|---|---|---|---|---|---|
| 1 | Favicon | `apps/web/src/app/favicon.ico` | 16, 32, 48 px | ICO, PNG girdili | Elle vektör (icon.svg'den üretilir) | Kullanılmaz | Bağlandı |
| 2 | SVG simge | `apps/web/src/app/icon.svg` | 32 birim kare | SVG | Elle vektör | Kullanılmaz | Bağlandı |
| 3 | Apple simgesi | `apps/web/src/app/apple-icon.png` | 180 x 180 | PNG, opak | Elle vektör (icon.svg'den) | Kullanılmaz | Bağlandı |
| 4 | Manifest simgeleri | `apps/web/public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apps/web/src/app/manifest.ts` | 192, 512 px | PNG | Elle vektör (icon.svg'den) | Kullanılmaz | Bağlandı |
| 5 | OpenGraph kartı | `apps/web/src/app/opengraph-image.tsx` | 1200 x 630 | PNG, next/og | Tipografi (kod) | Kullanılmaz | Bağlandı |
| 6 | Meslek avatarları | `apps/web/public/avatar/<id>-{a,b,n}.svg` | 24 dosya, en az 108 px | SVG | Çizer | Yalnız taslak | Çizer bekleniyor; yer tutucu kesik çizgili daire |
| 7 | Kalemcik yüzleri | `apps/web/src/app/kalemcik/_bilesen/KalemcikYuzu.tsx` | 4 ifade, 100 x 130 birim | SVG, TSX'e aktarılır | Çizer | Yalnız taslak | Kodla çizili yer tutucu |
| 8 | Kart piktogramları | `apps/web/src/app/pratik/_bilesen/Isaretler.tsx` ve konu seti | 20 x 20 | SVG, TSX'e aktarılır | Çizer | Yalnız taslak | 3 durum işareti kodla çizili; konu seti yok |

## 4. Varlıklar

### 4.1 Favicon

- Yol: `apps/web/src/app/favicon.ico` (Next.js dosya kuralı; `<link rel="icon" sizes="48x48">` üretir).
- Ölçü ve biçim: 16, 32 ve 48 px PNG girdili ICO; her girdi 8 bit RGBA (Turbopack paletli PNG girdisini çözemiyor).
- Dosya sınırı: 15 KB. Şu an 1,2 KB.
- Kaynak: `apps/web/src/app/icon.svg`. Üretim komutu, depo kökünden:
  `NODE_PATH=<sharp içeren dizin> node docs/tasarim/simge-uret.mjs docs/tasarim/gorsel/simgeler-onizleme.png`
- Kabul ölçütü:
  1. 16 px'te K harfi ve kenardaki lâl şerh ayrı seçilir.
  2. Beyaz ve koyu sekme zemininde okunur (önizleme: `docs/tasarim/gorsel/simgeler-onizleme.png`).
  3. Yalnız belirteç renkleri; dosya sınırı aşılmaz (test: `apps/web/src/app/(kabuk)/_marka/marka.test.ts`).
- Çizen: elle vektör (4.2 ile aynı çizim). Midjourney kullanılmaz: çıktısı raster'dır ve 16 px'te keskin kenar
  vermez (ADR-0034).

### 4.2 SVG simge (marka işareti)

- Yol: `apps/web/src/app/icon.svg` (`<link rel="icon" type="image/svg+xml" sizes="any">`).
- Ölçü ve biçim: `viewBox="0 0 32 32"`, düz SVG, 2 KB altında. Bütün raster simgelerin ve paylaşım kartındaki
  işaretin tek kaynağıdır.
- Çizim: kâğıt zemin üzerinde mürekkep K; sağında okuma sütununu kenardan ayıran ince ikincil metin renginde çizgi;
  kenarda K'nın üst koluyla aynı hizada lâl şerh. Ürünün imza öğesi olan kenar şerhinin (plan 12 madde 3) en küçük
  hâlidir: cümle solda, kaynağı aynı hizada sağ kenarda. Koordinatlar 16 px'te piksele oturacak şekilde çift sayıdır.
- Kabul ölçütü: kare; `<text>`, `<image>`, `<script>`, `data:` ve dış bağlantı yok; yalnız belirteç renkleri;
  16, 32, 48, 180 ve 512 px'te ve iki zeminde okunur (test ve önizleme).
- Çizen: on-yuz ajanı, 2026-11-12, koordinatları metin düzenleyicide elle yazarak. Görüntü üreten bir model
  kullanılmadı. Ajan bir yapay zekâ kod asistanıdır; işaret marka olarak tescil edilecekse Tarık'ın onayı ve
  gerekirse bir tasarımcının yeniden çizimi gerekir (bkz. 6. bölüm).
- Midjourney: kullanılmaz.

### 4.3 Apple simgesi

- Yol: `apps/web/src/app/apple-icon.png` (`<link rel="apple-touch-icon" sizes="180x180">`).
- Ölçü ve biçim: 180 x 180 PNG, opak kâğıt zemin. iOS köşeleri kendisi yuvarlar; çizim bu yüzden yüzde 88'e
  küçültülüp ortalanır.
- Dosya sınırı: 40 KB. Şu an 1,0 KB.
- Kabul ölçütü: saydam piksel yok; köşe yuvarlaması K'ya ve şerhe değmez; iOS ana ekranında koyu ve açık duvar
  kâğıdında okunur (cihazda elle denetim, Tarık).
- Çizen: elle vektör (4.2'den üretilir). Midjourney kullanılmaz.

### 4.4 Manifest simgeleri

- Yollar: `apps/web/public/icon-192.png` ve `icon-512.png` (amaç `any`), `apps/web/public/icon-maskable-512.png`
  (amaç `maskable`); bildirim: `apps/web/src/app/manifest.ts` (`/manifest.webmanifest`).
- Ölçü ve biçim: 192 ve 512 px PNG. Maskelenebilir simgede çizim yüzde 80'e küçültülür; böylece Android'in yüzde 40
  yarıçaplı güvenli dairesinde kalır.
- Manifest: ad ve kısa ad `ortak.marka`, açıklama `ortak.amac`, dil `tr`, `display: standalone` (iOS'ta Web Push
  ana ekrana eklenmiş uygulama ister; plan 10.5/6), arka plan ve tema rengi kâğıt `#fbf8f1`.
- Dosya sınırı: her biri 40 KB. Şu an 0,9 ile 3,0 KB.
- Kabul ölçütü: dosyalar var ve bildirilen ölçüdedir; manifest renkleri belirteçlere eşittir (test).
- Çizen: elle vektör (4.2'den üretilir). Midjourney kullanılmaz.

### 4.5 OpenGraph kartı

- Yol: `apps/web/src/app/opengraph-image.tsx`; çizim `apps/web/src/app/(kabuk)/_marka/paylasimKarti.tsx`,
  sabitler `apps/web/src/app/(kabuk)/_marka/marka.ts`. Next.js her sayfaya `og:image` ve `twitter:image`
  ekler; rota derlemede bir kez üretilir (statik).
- Ölçü ve biçim: 1200 x 630 PNG, yalnız tipografi (ADR-0034 seçenek B; docs/istekler/seo-p6-og-gorseli.md).
- Dosya sınırı: 300 KB. Şu an 56 KB. Önizleme: `docs/tasarim/gorsel/paylasim-karti.png`.
- İçerik: sol üstte işaret ve "Kazuist"; okuma sütununda amaç cümlesi virgüllerden bölünmüş üç satır
  (`ortak.amac`, birebir); her satırın hizasında, ince çizgiyle ayrılmış kenarda lâl çizgili bir not: "Araştırma
  zamanı", "Atıf ağı", "Yazma zamanı" (`ortak.gezinme.sekme`); altta `kazuist.com` (`ortak.paylasim.alanAdi`).
  Rakam, sayı iddiası, kurum logosu ve fotoğraf yok.
- Yazı tipleri: sitenin alt kümeli yazı tiplerinin sabit ağırlıklı TTF kopyaları
  (`apps/web/src/app/(kabuk)/_marka/yazi/`, OFL, NOTICE.txt). next/og WOFF2 okumadığı için
  `docs/tasarim/og-yazi.py` ile `apps/web/public/fonts` altındaki dosyalardan türetildi; alt küme aynıdır.
- Alternatif metin: `ortak.paylasim.kartAlt` ile amaç cümlesi, 120 karakter altında (test).
- Kabul ölçütü: Türkçe harfler (ğ, ı, ş, ö, ü, İ) doğru çizilir; metin kontrastı AA üstü (mürekkep kâğıt üzerinde
  16,4:1, ikincil metin 7,3:1); satır taşmaz; Facebook ve LinkedIn paylaşım denetleyicisinde önizleme görünür
  (Tarık, yayından sonra).
- Çizen: kod, tipografi. Midjourney kullanılmaz.
- Not: `twitter.card` hâlâ `summary` (seo'nun `temelMetadata` dosyası); büyük önizleme için seo ajanı
  `summary_large_image` yapar.

### 4.6 Meslek avatarları

- Yol: `apps/web/public/avatar/<id>-a.svg`, `<id>-b.svg`, `<id>-n.svg`. Kimlikler ve görünüm adları
  `apps/web/src/server/auth/professions.ts` ve `packages/i18n/tr/hesap.json` (`meslekler`,
  `sayfa.hedef.avatarlar`) ile aynıdır. `public/avatar` hiçbir ajanın yolunda değildir; orkestra sahibini atar.
- Görünümler (plan 10.1/2, SRS FR-02 uyarlaması): `a` ve `b` aynı mesleğin iki farklı görünümü (öneri: biri kadın,
  biri erkek), `n` cinsiyet belirtmeyen görünüm. Seçim zorunlu değildir.
- Ölçü ve biçim: `viewBox="0 0 216 216"` kare SVG; en az 108 px gösterimde tam ayrıntı, kabuktaki 36 px daire
  içinde (`kabuk-hedefim__avatar`) yüz ve meslek göstergesi seçilir. Omuzdan yukarı büst, daire kırpmaya göre
  ortalanmış; zemin kâğıt ya da saydam.
- Dosya sınırı: her biri 12 KB.
- Kabul ölçütü:
  1. 24 dosyanın hepsi tek çizgi dilinde (2. bölüm); yan yana dizildiğinde tek elden çıktığı görülür.
  2. Ten, saç ve yüz özellikleri set boyunca çeşitlidir; hiçbir meslek tek bir görünüşe bağlanmaz.
  3. Cübbe, yaka ve rozet gibi resmî kıyafet ayrıntıları ilgili yönetmelikten doğrulanır; tahmin edilmez. Resmî
     amblem, baro ya da bakanlık logosu, bayrak ve ay yıldız çizilmez.
  4. 36 px'te ve iki zeminde okunur; alternatif metin meslek adı ve görünüm adıdır (i18n'de var).
- Çizen: çizer. Midjourney yalnız taslak.

| Kimlik | Meslek | Önerilen gösterge |
|---|---|---|
| `avukat` | Avukat | Cübbe yakası ve kolda dosya |
| `hakim` | Hâkim | Cübbe ve önünde kapalı dosya |
| `savci` | Savcı | Cübbe ve elde iddianame sayfası |
| `noter` | Noter | Mühür ve onay defteri |
| `akademisyen` | Akademisyen | Açık kitap ve not kâğıtları |
| `hukuk_ogrencisi` | Hukuk öğrencisi | Sırt çantası askısı ve kanun kitabı |
| `hukuk_musaviri` | Hukuk müşaviri | Dizüstü bilgisayar ve sözleşme sayfası |
| `diger` | Diğer | Kâğıt ve dolma kalem (Kalemcik'e benzemeyen) |

Midjourney taslak istemi (şablon; `{gorunum}` ve `{gosterge}` tablodan doldurulur):

```text
flat vector avatar illustration, head and shoulders portrait centered for a circular crop, {gorunum}, {gosterge}, single uniform line weight with rounded line caps, flat colour fills, limited palette of warm off-white #fbf8f1, near-black ink #1c1b19, warm grey #57524a and one small accent of brick red #a1351f, calm friendly expression with dot eyes and a single line mouth, plain warm off-white background, generous margin --ar 1:1 --style raw --no text, letters, logo, emblem, flag, badge, gradient, shadow, photo, 3d render, texture
```

| `{gorunum}` | Değer |
|---|---|
| `a` | `a woman` |
| `b` | `a man` |
| `n` | `a person with no gender cues, short neutral hair, plain clothing` |

Örnek (`avukat-n`): `{gosterge}` yerine `wearing a plain black legal robe, holding a closed file folder`.

### 4.7 Kalemcik yüzleri

- Yol: çizerden gelen SVG'ler yazma ajanı tarafından `apps/web/src/app/kalemcik/_bilesen/KalemcikYuzu.tsx`
  bileşenine aktarılır (dosya yazma ajanınındır). Renkler CSS değişkeniyle (`var(--kz-color-...)`) verilir.
- İfadeler ve tonlar (`content/kalemcik.yaml`, `packages/i18n/tr/kalemcik.json` `kalemcik.yuz`):

  | İfade | Ton | Alternatif metin |
  |---|---|---|
  | `gulen` | `iyi` (iyi gidiyor) | Kalemcik gülümsüyor |
  | `dusunceli` | `son7` (son 7 gün) | Kalemcik düşünceli |
  | `uzgun` | `yazilmadi` (yazılmadı) | Kalemcik üzgün |
  | `kutlama` | `hedef` (hedefe ulaşıldı) | Kalemcik kutluyor |

  Plan 12 madde 8 beşinci olarak "nötr" ruh hâlini sayar; `content/kalemcik.yaml` dört ton tanımlar. Nötr ton için
  ayrı yüz gerekip gerekmediği yazma ajanına açık sorudur; gerekirse beşinci ifade "sakin" olarak aynı ölçüde çizilir.
- Ölçü ve biçim: `viewBox="0 0 100 130"` (mevcut bileşenle aynı), 72 ve 96 px gösterim; her ifade 8 KB altında SVG.
- Karakter: altıgen kesitli kurşun kalem gövdesi, üstte silgi ve metal bilezik, altta açılmış uç ve grafit; yüz
  gövdenin üst yarısında; kol ve bacak yok. Dört ifadede gövde aynı kalır, yalnız göz, kaş ve ağız değişir;
  kutlamada kenarda en fazla üç kısa lâl çizgi.
- Kabul ölçütü:
  1. Üzgün ifade suçlayıcı ya da baskıcı değildir (plan 12 madde 8): ağlama, kızgın kaş, ter damlası yok.
  2. İfade, yanındaki metin olmadan da 72 px'te ayırt edilir; ama anlam yalnız yüze bırakılmaz (ton metni yanında).
  3. Tanınmış bir kalem karakterine ya da maskota benzemez; tescil düşünülüyorsa benzerlik araması yapılır
     (ADR-0034 madde 3).
  4. Avatarlarla aynı çizgi dili.
- Çizen: çizer. Midjourney yalnız taslak.

Midjourney taslak istemi:

```text
character turnaround sheet of an original friendly pencil character, hexagonal wooden pencil body with eraser and metal ferrule on top and a sharpened graphite tip at the bottom, simple face on the upper body with dot eyes and a single line mouth, no arms, no legs, four expressions side by side: gentle smile, thoughtful, mildly sad but calm, celebrating with three short accent strokes, single uniform line weight with rounded caps, flat fills in warm off-white #fbf8f1, near-black ink #1c1b19, warm grey #57524a, one brick red accent #a1351f, plain off-white background --ar 3:2 --style raw --no text, letters, logo, gradient, shadow, 3d render, tears, angry eyebrows
```

### 4.8 Kart piktogramları

İki takım vardır; ikisi de aynı ızgara ve çizgi kalınlığındadır (webtasarim.md 20).

- Yol: `apps/web/src/app/pratik/_bilesen/Isaretler.tsx` ve yeni konu seti için pratik ajanının belirleyeceği bileşen
  (dosyalar pratik ajanınındır; çizerden gelen SVG'leri o aktarır).
- Ölçü ve biçim: `viewBox="0 0 20 20"`, 20 x 20 px gösterim, 1,75 birim çizgi, yalnız `currentColor` (renk
  bileşenden gelir); her biri 1,5 KB altında. `aria-hidden="true"`; anlam yanındaki metindedir.

A. Durum işaretleri (mevcut, kodla çizili). Biçim anlamı korunur, çünkü sonuç renge bağlı değildir (FR-58):

| İşaret | Biçim |
|---|---|
| Doğru | Dolu daire içinde onay çizgisi |
| Yanlış | Kesikli kare içinde çarpı |
| Seçili | Halka içinde dolu nokta |

B. HMGS konu piktogramları (plan 10.6/5; konular `apps/web/src/app/pratik/_alan/hmgs-alanlari.ts`, 20 alan).
"Usul" alanlarında ana motifin sağ altına küçük bir adım oku eklenir; böylece maddi hukuk ve usulü aynı biçimle
eşleşir.

| Kimlik | Konu | Önerilen motif |
|---|---|---|
| `anayasa-hukuku` | Anayasa Hukuku | Üç sütunlu cephe |
| `anayasa-yargisi` | Anayasa Yargısı | Üç sütunlu cephe önünde kapalı dosya |
| `idare-hukuku` | İdare Hukuku | Mühürlü resmî evrak |
| `idari-yargilama-usulu` | İdari Yargılama Usulü | Mühürlü evrak ve adım oku |
| `medeni-hukuk` | Medeni Hukuk | Ev çatısı ve kapı |
| `borclar-hukuku` | Borçlar Hukuku | İki imza çizgili sözleşme sayfası |
| `ticaret-hukuku` | Ticaret Hukuku | Dükkân tentesi |
| `hukuk-yargilama-usulu` | Hukuk Yargılama Usulü | Terazi ve adım oku |
| `icra-ve-iflas-hukuku` | İcra ve İflas Hukuku | Üzerinde etiket asılı kutu |
| `ceza-hukuku` | Ceza Hukuku | Parmaklıklı pencere |
| `ceza-yargilama-usulu` | Ceza Yargılama Usulü | Parmaklıklı pencere ve adım oku |
| `is-ve-sosyal-guvenlik-hukuku` | İş ve Sosyal Güvenlik Hukuku | Dişli çark ve kalkan |
| `vergi-hukuku` | Vergi Hukuku | Yüzde işaretli makbuz |
| `vergi-usul-hukuku` | Vergi Usul Hukuku | Makbuz ve adım oku |
| `avukatlik-hukuku` | Avukatlık Hukuku | Cübbe yakası |
| `hukuk-felsefesi-ve-sosyolojisi` | Hukuk Felsefesi ve Sosyolojisi | Terazi |
| `turk-hukuk-tarihi` | Türk Hukuk Tarihi | Rulo belge (tomar) |
| `milletlerarasi-hukuk` | Milletlerarası Hukuk | Meridyenli küre |
| `milletlerarasi-ozel-hukuk` | Milletlerarası Özel Hukuk | Küre ve iki karşılıklı ok |
| `genel-kamu-hukuku` | Genel Kamu Hukuku | Kubbe |

- Kabul ölçütü: 20 px'te ve 2 kat büyütmede ayırt edilir; iki motif birbirine karışmaz (terazi yalnız iki yerde,
  biri adım oklu); hepsi aynı çizgi kalınlığı ve uç biçiminde; kurum amblemi ve dinî ya da siyasi simge yok.
- Çizen: çizer. Midjourney yalnız taslak (çıktısı 20 px ızgarada kullanılamaz; yalnız motif araması içindir).

Midjourney taslak istemi:

```text
sheet of twenty minimal line icons on a square grid for law study topics: three column facade, sealed official document, house roof with door, contract page with two signature lines, shop awning, balance scale, box with a hanging tag, barred window, gear with a shield, receipt with a percent sign, robe collar, rolled scroll, globe with meridians, dome, each drawn with one uniform stroke weight and rounded caps, no fills, near-black ink #1c1b19 on warm off-white #fbf8f1 --ar 4:3 --style raw --no text, letters, numbers, logo, emblem, flag, gradient, shadow, 3d render
```

## 5. Kayıt (ADR-0034 madde 5)

Her taslak oturumu ve her teslim bir satırdır. Aynı bilgi hukuk-uyum tarafından `docs/ip/arka-plan-kaydi.md`
dosyasına da işlenir (ADR-0019).

| Varlık | Araç | İstem | Tarih | Kişi | Son dosyayı çizen | Hak ve lisans | Depo yolu |
|---|---|---|---|---|---|---|---|
| SVG simge (4.2) | Metin düzenleyici, elle SVG koordinatı | Yok | 2026-11-12 | on-yuz ajanı (Tarık'ın oturumunda) | on-yuz ajanı | Kulular; tescil öncesi değerlendirme hukuk-uyum | `apps/web/src/app/icon.svg` |
| Favicon, Apple, manifest (4.1, 4.3, 4.4) | sharp, `docs/tasarim/simge-uret.mjs` | Yok | 2026-11-12 | on-yuz ajanı | icon.svg'den dönüştürme | icon.svg ile aynı | 4.1, 4.3, 4.4'teki yollar |
| OpenGraph kartı (4.5) | next/og, sitenin yazı tipleri | Yok | 2026-11-12 | on-yuz ajanı | Kod, tipografi | Kod Kulular; yazı tipleri OFL 1.1 | `apps/web/src/app/opengraph-image.tsx` |
| Midjourney koşullarının okunması | Tarayıcı | Yok | Bekliyor | Tarık | Yok | Yok | Yok |
| Avatar taslakları (4.6) | Midjourney | 4.6 şablonu | Bekliyor | Tarık | Yok (taslak ürüne girmez) | Midjourney koşulları | Depoya girmez |
| Kalemcik taslakları (4.7) | Midjourney | 4.7 istemi | Bekliyor | Tarık | Yok (taslak ürüne girmez) | Midjourney koşulları | Depoya girmez |
| Piktogram taslakları (4.8) | Midjourney | 4.8 istemi | Bekliyor | Tarık | Yok (taslak ürüne girmez) | Midjourney koşulları | Depoya girmez |
| Avatar, Kalemcik, piktogram son dosyaları | Çizerin aracı | Yok | Bekliyor | Çizer | Çizer | Yazılı devir sözleşmesi ve YZ kullanılmadı beyanı | 4.6, 4.7, 4.8'deki yollar |

## 6. Açık konular

1. Marka işareti (4.2) bir yapay zekâ kod asistanının elle yazdığı vektördür; görüntü üreten model kullanılmadı.
   Marka tescili (plan 18.1 madde 6, TÜRKPATENT) işareti de kapsayacaksa Tarık işareti onaylar ya da bir
   tasarımcıya yeniden çizdirir; telif ve tescil değerlendirmesi hukuk-uyumundur.
2. Çizer seçimi, bütçe ve teslim takvimi (plan 18.1 madde 12). Çizer gelene kadar avatar yeri kesik çizgili boş daire,
   Kalemcik ve piktogramlar kodla çizili yer tutucudur (plan 12 madde 7).
3. `public/avatar` yolunun sahibi (orkestra) ve avatar dosyalarını hesap ekranına bağlayacak ajan (kimlik).
4. Kalemcik için nötr ton yüzü (4.7).
5. `twitter.card` değeri `summary_large_image` olmalı (seo).
