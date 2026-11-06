# ADR-0030: Barındırma sağlayıcısı Hetzner

- Tarih: 2026-11-06
- Durum: Kabul edildi, 6 Kasım 2026 kullanıcı kararı
- İlgili kararlar: K-03, K-04; plan 5.4, 5.5, 11; ADR-0021

## Bağlam

K-03, siteyarat.md akışını (GitHub, Coolify, Cloudflare DNS) korurken sağlayıcı olarak Hetzner yerine Türkiye'de kurulu bir şirketin Türkiye'deki veri merkezini seçmişti. Gerekçe SRS 10.3'teki "veri Türkiye'de kalır" ilkesi ve KVKK m.9 kapsamındaki yurt dışı aktarım yükümlülükleriydi.

19 Ekim ve 2 Kasım araştırmalarında (docs/runbook/vps-secimi.md) hiçbir Türkiye adayı ölçütlerin tamamını resmî kaynakta karşılamadı; Radore hazır paketleri plan 5.5 boyutunu tutmadı, özel teklif ve yazılı teyit gerekiyordu. Dalga 1 kapısının staging maddesi bu yüzden açık kaldı.

Kullanıcı 6 Kasım 2026'da plan kurallarının bu konuda katı olmadığını ve Hetzner'da ısrarcı olduğunu açıkça bildirdi. Kullanıcının Hetzner hesabında hâlihazırda bir proje ve tek bir sunucu vardır (kulular-uretim-01, CX23, Helsinki); bu sunucu Kazuist için ayrılmamıştır ve boyutu yetersizdir.

## Karar

1. K-03 değişir: Kazuist'in staging ve üretim sunucuları Hetzner Cloud'da (Hetzner Online GmbH) barındırılır. siteyarat.md akışı (GitHub, Coolify, Cloudflare DNS only) aynen korunur.
2. Konum AB içinde seçilir (Falkenstein veya Nürnberg, Almanya; Helsinki yedek seçenek). AB dışı Hetzner konumları kullanılmaz.
3. Staging hemen açılabilir: yalnız anonim veya sentetik veri, gerçek kişi verisi yok (plan 5.4). Önerilen boyut en az 16 GB RAM, tercihen 32 GB (CX53 veya CCX33); son fiyat sipariş günü Hetzner sayfasından okunur.
4. Üretim sunucuları plan 5.5'teki iki sunucu düzenini korur; VPS-2 (PostgreSQL) yalnız Hetzner özel ağından erişilir. Yedek ikinci bir konumda veya Hetzner Storage Box'ta tutulur.
5. kulular-uretim-01 sunucusuna Kazuist kurulmaz ve dokunulmaz.

## Sonuçlar ve koşullar

Bu karar kişisel verinin Türkiye dışına aktarılması demektir; plan 0. bölümdeki 6. değişmez kural ("Kişisel veri Türkiye dışına çıkmaz") üretim için bu ADR ile değişir. Üretimde gerçek kişi verisi işlenmeden önce şu koşullar karşılanır:

1. KVKK m.9 aktarım dayanağı belirlenir. Kurul'un yayımladığı standart sözleşmenin Hetzner ile değiştirilmeden imzalanması ve imzadan sonra 5 iş günü içinde Kurul'a bildirilmesi birincil yoldur; Hetzner'ın bu sözleşmeyi imzalayıp imzalamayacağı doğrulanmadı. İmza alınamazsa kullanılabilecek diğer m.9 yolları hukuk-uyum tarafından birincil kaynaktan değerlendirilir. Bu adım tamamlanmadan üretimde kişisel veri işlenmez.
2. Hetzner'ın veri işleme sözleşmesi (AV-Vertrag) imzalanır; ISO 27001 belgesi ve veri merkezi konumu Hetzner'ın resmî sayfasından doğrulanıp kaydedilir.
3. Aydınlatma metni, aktarım envanteri (plan 5.5) ve VERBİS kaydı yurt dışı barındırmayı yansıtacak biçimde güncellenir; hukuki metinlerin yayımı ayrı onay kapısındadır.
4. SRS 10.3 ile çelişkide bu ADR geçerlidir.

Staging bu koşullara bağlı değildir; gerçek kişi verisi staging'e taşınmaz.

## Uygulama

- Orkestra plan.md K-03, 0. bölüm 6. kural ve 5.5'i günceller.
- altyapi: docs/runbook/vps-secimi.md ve coolify.md Hetzner'a göre güncellenir; staging kurulumu kullanıcı sunucuyu açıp erişim bilgisini ~/Desktop/kazuist-staging.txt dosyasına yazdıktan sonra başlar. Sunucu satın alma ve ödeme kullanıcıdadır.
- hukuk-uyum: koşul 1 ile 3 için iş açılır.

## Onay kaydı

Kullanıcı 6 Kasım 2026'da Hetzner kararını açıkça verdi. Bu onay üretimde kişisel veri işlenmesine, hukuki metinlerin yayımına veya sunucu satın alımına izin değildir.
