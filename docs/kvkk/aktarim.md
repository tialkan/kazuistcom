# Yurt dışı aktarım envanteri ve kararları

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19 (taslak 1). Uyum garantisi vermez.

Dayanak: 6698 sayılı Kanun m.9 (7499 sayılı Kanunla değişik, 2/3/2024; metin mevzuat.gov.tr'den okundu).
m.9'un yapısı: (1) yeterlilik kararı; (4) uygun güvenceler, bunlardan (c) Kurul'un ilan ettiği standart
sözleşme; (5) standart sözleşme imzadan itibaren beş iş günü içinde Kurum'a bildirilir; (6) arızi
aktarım halleri, (a) bendi riskler hakkında bilgilendirme kaydıyla açık rıza. Usul: Kişisel Verilerin
Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik [DOĞRULANACAK: RG 10/7/2024,
32598; plan 11'den alındı, resmigazete.gov.tr'den teyit edilecek].

Kaynak tablo: plan 5.5. Bugün (2026-10-19) sağlayıcı seçimlerinin çoğu kesinleşmedi; satırlar seçimle güncellenir.

| Bileşen | Kişisel veri | Konum | Mekanizma | Karar ve yapılacak |
|---|---|---|---|---|
| Uygulama, veri tabanı, depo, yedek | Var (envanter 1-25) | Türkiye | Aktarım yok | Sağlayıcı sözleşmesinde Türkiye'de veri merkezi ve veri işleme eki aranır |
| Cloudflare | DNS only iken yok | Yurt dışı | Yok | Proxy açılırsa IP ve istek verisi aktarılır; açılmadan önce bu tablo ve ADR-0004 güncellenir |
| YZ sağlayıcısı, platform modu (Anthropic) | Hedef: yok. Maskeli sorgu ve anonim corpus | ABD veya küresel | Maskeleme (plan 8.5); kalan risk için m.9/4-c standart sözleşme | Tarık, Kurul'un standart sözleşmesinin değiştirilmemiş metnini Anthropic'e sunar; imzalanırsa beş iş günü içinde Kurum'a bildirim. İmzalanmazsa maskelemenin yeterliliği yeniden değerlendirilir; açık rıza düzenli akışa dayanak yapılmaz (m.9/6 arızi olma şartı) |
| YZ sağlayıcısı, BYOK istemci modu | Kullanıcı kendi cihazından kendi hesabına gönderir | Kullanıcının seçimi | Kazuist aktarım yapmaz | Aydınlatma ve YZ politikasında bilgilendirme; Gemini ücretsiz katman uyarısı (plan 8.4) |
| YZ sağlayıcısı, BYOK aktarma modu | Yalnız maskeli metin, sunucudan geçer, saklanmaz | Kullanıcının seçimi | Maskeleme; kullanıcıya açık uyarı | consents.kind = yz_aktarim kaydı |
| E-posta gönderimi | E-posta adresi, ad, bildirim içeriği | Tercihen Türkiye | Türkiye'de ise aktarım yok; AB bölgesinde ise m.9/4-c | Sağlayıcı seçilmedi [Tarık]. AB seçilirse ADR, standart sözleşme, beş iş günü bildirim |
| iyzico | Ödeme verisi | Türkiye | Aktarım yok | Üye işyeri sözleşmesi |
| e-Arşiv entegratörü | Fatura verisi | Türkiye [DOĞRULANACAK: seçilecek entegratör] | Aktarım yok | |
| Apple (iOS satın alma) | İşlem kimlikleri | Yurt dışı | Kullanıcının Apple ile kendi ilişkisi | Aydınlatmada belirtilir |
| Apple APNs, Web Push | Cihaz belirteci veya uç nokta; bildirim metni | Yurt dışı | [DOĞRULANACAK: hukuki değerlendirme] | Bildirim metninde kişisel veri ve içerik özeti gönderilmez (istek dosyası) |
| Google ve Apple ile giriş | Kullanıcı kendi hesabıyla kimlik doğrular | Yurt dışı | Kullanıcının seçimi | Aydınlatmada belirtilir |
| Hata izleme, uptime, analitik | Teknik veri | Kendi sunucumuz | Aktarım yok | |
| GitHub | Kod; üretim verisi yok | Yurt dışı | Kişisel veri yok | Örnek veri sahte (packages/db/src/seed.ts) |
| Embedding toplu işi | Anonim corpus | Gerekirse yurt dışı GPU | Anonim veri kişisel veri değildir | Anonimleştirme kalite eşiği (eval/anon) geçilmeden gönderilmez; ADR |

## Kararlar (Tarık onayı)

1. Kişisel veri içeren her yeni yurt dışı bileşen bu tablo güncellenmeden canlıya alınmaz.
2. Standart sözleşme imzalanırsa Kurum'a bildirim beş iş günü içinde yapılır; yöntem
   [DOĞRULANACAK: kvkk.gov.tr güncel bildirim usulü]. Bu ajan hiçbir bildirim göndermez.
3. Arızi aktarım (m.9/6) düzenli veri akışına dayanak yapılmaz.
