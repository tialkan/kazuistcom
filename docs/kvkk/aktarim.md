# Yurt dışı aktarım envanteri ve kararları

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-12 (taslak 2, review.md P5 madde 3 ve 4). Uyum garantisi vermez.
Bu ajan hiçbir sözleşme imzalamaz, hiçbir kuruma bildirim göndermez.

## Dayanak (birincil kaynaktan, 12 Kasım 2026)

- 6698 sayılı Kanun m.9 (7499 sayılı Kanunla değişik, 2/3/2024), mevzuat.gov.tr PDF'i:
  - (1) yeterlilik kararı varsa ve m.5 veya m.6 şartlarından biri varsa aktarım yapılabilir; (2) yeterlilik kararını
    Kurul verir ve Resmî Gazete'de yayımlanır.
  - (4) yeterlilik kararı yoksa, m.5 veya m.6 şartlarından biri ve ilgili kişinin aktarılan ülkede haklarını kullanma
    ve etkili kanun yollarına başvurma imkânı bulunmak kaydıyla uygun güvencelerden biriyle: (a) kamu kurumları
    arası anlaşma ve Kurul izni, (b) bağlayıcı şirket kuralları, (c) Kurul'un ilan ettiği standart sözleşme,
    (ç) yazılı taahhütname ve Kurul izni.
  - (5) standart sözleşme imzadan itibaren beş iş günü içinde veri sorumlusu veya veri işleyen tarafından Kurum'a
    bildirilir.
  - (6) yeterlilik kararı ve uygun güvence yoksa yalnız arızi olmak kaydıyla (a) ilâ (f) halleri; (a) muhtemel
    riskler hakkında bilgilendirilmiş açık rıza.
- Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik, RG 10/7/2024, 32598
  (resmigazete.gov.tr özgün metni): m.14 standart sözleşme metni değiştirilmeden kullanılır (3); taraflarca veya
  yetkililerce imzalanır (4); imzaların tamamlanmasından itibaren beş iş günü içinde Kurum'a bildirilir, bildirimi
  kimin yapacağı kararlaştırılmamışsa veri aktaran yapar (5); bildirime imza yetkisi belgeleri ve yabancı dildeki
  belgelerin noter onaylı Türkçe çevirisi eklenir (6); bilgiler değişirse veya sözleşme sona ererse yeniden
  bildirilir (8). m.16/1 arızi aktarımı "düzenli olmayan, tek veya birkaç seferlik ve olağan faaliyet akışında
  bulunmayan" diye tanımlar.
- Kurul'un dört standart sözleşmesi (kvkk.gov.tr/Icerik/7929): Standart Sözleşme 1 veri sorumlusundan veri
  sorumlusuna, 2 veri sorumlusundan veri işleyene, 3 veri işleyenden veri işleyene, 4 veri işleyenden veri
  sorumlusuna. Kulular veri sorumlusu, Hetzner veri işleyendir: Standart Sözleşme 2.
- Bildirim yolları (kvkk.gov.tr/Icerik/8043, 25 Ekim 2024): Standart Sözleşme Bildirim Modülü
  (https://standartsozlesme.kvkk.gov.tr/), fiziki olarak veya KEP ile.
- Yeterlilik kararı: 12 Kasım 2026 aramasında Kurul'un herhangi bir ülke için yayımladığı yeterlilik kararı
  bulunamadı [DOĞRULANACAK: kvkk.gov.tr ve Resmî Gazete'den; bulunmaması olumsuz bir doğrulama değildir].

## Envanter

Kaynak tablo: plan 5.5; konum ADR-0030 ve ADR-0033'e göre düzeltildi. Önceki taslaktaki "Uygulama, veri tabanı,
depo, yedek: Türkiye, aktarım yok" satırı yanlıştır ve kaldırıldı.

| Bileşen | Kişisel veri | Konum | Mekanizma | Karar ve yapılacak |
|---|---|---|---|---|
| Uygulama, veri tabanı, dosya deposu (Hetzner Online GmbH, veri işleyen) | Var: envanter satır 1-18, 21-26 | Almanya (Falkenstein veya Nürnberg; Helsinki yedek, Finlandiya), ADR-0030 madde 2 | m.9/4-(c), Standart Sözleşme 2 | Yayının ön koşulu (ADR-0033 ön koşul 1). Aşağıdaki "Hetzner" bölümü |
| Yedek deposu | Var: bütün veri tabanı | Seçilmedi (review.md T9) | Seçime göre | Türkiye'de ise aktarım yok; AB'de ise ayrı Standart Sözleşme 2 ve bildirim. Aynı sunucudaki yedek yedek sayılmaz (ADR-0033 ön koşul 4) |
| Cloudflare | DNS only iken yok | Yurt dışı | Yok | Proxy açılırsa IP ve istek verisi aktarılır; açılmadan önce bu tablo ve ADR-0004 güncellenir |
| YZ sağlayıcısı, platform modu (OpenRouter, Inc., ADR-0025; istek başına data_collection deny ve zdr true) | Hedef: yok. Maskeli sorgu, maskeli kılavuz metni ve anonim corpus | ABD; uç model sağlayıcısı küresel | Maskeleme (plan 8.5); kalan risk için m.9/4-(c) Standart Sözleşme 2 önerilir | Tarık, Standart Sözleşme 2'nin değiştirilmemiş metnini OpenRouter'a sunar; imzalanırsa beş iş günü içinde bildirim. İmzalanmazsa maskelemenin yeterliliği yeniden değerlendirilir; açık rıza düzenli akışa dayanak yapılmaz (m.9/6 ve Yönetmelik m.16/1 arızi olma şartı) |
| YZ sağlayıcısı, platform yedeği (Anthropic doğrudan) | Hedef: yok | ABD veya küresel | Maskeleme | Yalnız OpenRouter kesintisinde; API girdi ve çıktıları 30 gün içinde silinir (privacy.claude.com, 22 Ekim 2026 okuması) |
| YZ sağlayıcısı, BYOK istemci modu | Kullanıcı kendi cihazından kendi hesabına gönderir | Kullanıcının seçimi | Kazuist aktarım yapmaz | Aydınlatma ve YZ politikasında bilgilendirme. BYOK arayüzü henüz yok (review.md P8) |
| YZ sağlayıcısı, BYOK aktarma modu | Yalnız maskeli metin, sunucudan geçer, saklanmaz | Kullanıcının seçimi | Maskeleme; kullanıcıya açık uyarı | consents.kind = yz_aktarim kaydı (ara/_sunucu/ozet.ts denetler) |
| E-posta gönderimi | E-posta adresi, ad, bildirim içeriği, sipariş PDF'leri (ad soyad, e-posta, tutar) | Seçilmedi (review.md T9) | Türkiye'de ise aktarım yok; yurt dışında ise Standart Sözleşme 2 | Sağlayıcı seçimi Tarık'ta. Sipariş PDF'i kişisel veri taşıdığı için yurt dışı sağlayıcıda dayanak şarttır |
| iyzico | Ödeme verisi | Türkiye | Aktarım yok | Üye işyeri sözleşmesi |
| e-Arşiv entegratörü | Fatura verisi | Seçilmedi | Türkiye'de ise aktarım yok | Gelir İdaresi'nin izin verdiği entegratör listesinden seçilir |
| Apple (iOS satın alma, Apple ile giriş, APNs) | İşlem kimlikleri; hesap kimliği; cihaz belirteci | Yurt dışı | Kullanıcının Apple ile kendi ilişkisi; APNs için bildirim metni genel | [DOĞRULANACAK: Kazuist'in APNs'e cihaz belirteci göndermesinin m.9 anlamında aktarım sayılıp sayılmadığı; hukukçu değerlendirmesi]. iOS uygulaması henüz yok |
| Web Push (tarayıcı itme hizmetleri) | Uç nokta adresi; bildirim metni genel | Yurt dışı | Apple ile aynı soru | Bildirim metninde kişisel veri ve içerik özeti gönderilmez |
| Google ile giriş | Kullanıcı kendi hesabıyla kimlik doğrular | Yurt dışı | Kullanıcının seçimi | Aydınlatmada belirtilir |
| Hata izleme, uptime, analitik | Teknik veri | Kendi sunucumuz (Hetzner) | Uygulama satırıyla aynı | Bugün hiçbiri kurulu değil (review.md P2 madde 6) |
| GitHub | Kod; üretim verisi yok | Yurt dışı | Kişisel veri yok | Örnek veri sahte |
| Embedding toplu işi | Anonim corpus | Gerekirse yurt dışı GPU | Anonim veri kişisel veri değildir | Anonimleştirme kalite eşiği (eval/anon) geçilmeden gönderilmez; ADR |
| Ham karar metni (anonimleştirme öncesi) | Üçüncü kişi verileri, m.6 verisi olabilir | Hetzner (ADR-0033 tek sunucu) | Uygulama satırıyla aynı | K-11 ve ADR-0011 bunun Türkiye'de olmasını istiyor; Tarık kararı T4 açık. Karar 1 seçilirse bu satır Standart Sözleşme 2 kapsamına yazılır |

## Hetzner: durum ve risk

Okunan resmî sayfalar (12 Kasım 2026):

- docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner: veri işleme sözleşmesi müşteri hesabında
  https://accounts.hetzner.com/account/dpa adresinden onay kutusuyla kurulur; Hetzner bireysel sözleşme hazırlamaz
  veya imzalamaz. Veri merkezleri: Almanya (Falkenstein, Nürnberg), Finlandiya (Helsinki), ABD (Ashburn, Hillsboro),
  Singapur. Alt işleyen listesi: https://www.hetzner.com/AV/subunternehmer.pdf (okunmadı).
- docs.hetzner.com/general/others/certificates: ISO/IEC 27001:2022 belgesi; sayfada belge numarası, geçerlilik tarihi
  ve kapsamdaki tüzel kişi yazmıyor. BSI C5 Tip 2 raporu (17 Kasım 2025 tarihli, 1 Şubat ile 31 Ağustos 2025 dönemi)
  Gunzenhausen, Nürnberg, Falkenstein ve Helsinki'yi kapsar.

Risk: Standart Sözleşme 2 iki tarafın imzasını ister (Yönetmelik m.14/4) ve değiştirilemez (m.14/3). Hetzner'ın
sayfası bireysel sözleşme imzalamadığını söylüyor; Kurul'un Türkçe standart sözleşmesini imzalayıp imzalamayacağı
bilinmiyor. İmza alınamazsa kalan m.9 yolları:

1. m.9/4-(ç) yazılı taahhütname ve Kurul izni: taahhütname de aktarım tarafları arasında yazılı olarak yapılır
   (Yönetmelik m.15/1), yani yine Hetzner'ın katılımı gerekir; ayrıca Kurul izni beklenir.
2. m.9/6 arızi aktarım: barındırma düzenli ve olağan faaliyet akışındadır; arızi sayılmaz. Açık rıza bu yüzden
   dayanak olamaz.
3. Kişisel veriyi Türkiye'de bir sunucuda tutmak: ADR-0030 ve ADR-0033'ü değiştirir, yeni ADR gerekir.

Bu yüzden ADR-0033 ön koşul 1 sağlanmadan DNS geçişi yapılmamalı ve hesap, ödeme ve formlar açılmamalıdır.

## Kararlar (Tarık onayı)

1. Kişisel veri içeren her yeni yurt dışı bileşen bu tablo güncellenmeden canlıya alınmaz.
2. Standart sözleşme imzalanırsa Kurum'a bildirim beş iş günü içinde Standart Sözleşme Bildirim Modülü, KEP veya
   fiziki yolla yapılır; bildirimi kimin yapacağı sözleşmede yazılı değilse Kulular yapar. Bu ajan hiçbir bildirim
   göndermez.
3. Arızi aktarım (m.9/6) düzenli veri akışına dayanak yapılmaz.
