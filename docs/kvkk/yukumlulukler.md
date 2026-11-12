# Kayıt yükümlülükleri kontrol listesi (ETBİS, VERBİS, İYS, e-Arşiv ve diğerleri)

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-12 (taslak 2, review.md P5). Uyum garantisi vermez.
Bu ajan hiçbir kuruma başvuru yapmaz; başvurular Tarık tarafından yapılır.
Adresler kurumun resmî alan adındadır; gönderim öncesi adresin güncelliği tarayıcıda kontrol edilir.
Yayın tek seferdir (ADR-0033): hesap, ödeme ve formlar ilk gün açılacağı için aşağıdaki "Yayından önce" satırlarının
hepsi DNS geçişinden önce tamamlanır.

| # | Yükümlülük | Dayanak (okunan kaynak) | Kazuist için durum | Ne zaman | Resmî adres | Sahibi |
|---|---|---|---|---|---|---|
| 1 | ETBİS kaydı | Ticaret Bakanlığı elektronik ticaret SSS (ticaret.gov.tr/ic-ticaret/sikca-sorulan-sorular/elektronik-ticaret, 12 Kasım 2026): kendi elektronik ticaret ortamında faaliyet gösteren hizmet sağlayıcılar faaliyete başlamadan önce ETBİS'e kaydolur; satışa başlamamış olmak yükümlülüğü kaldırmaz. Düzenleme: Elektronik Ticaret Bilgi Sistemi ve Bildirim Yükümlülükleri Hakkında Tebliğ [DOĞRULANACAK: Tebliğin güncel madde numarası]. Kayda uymamanın yaptırımı 6563 m.12/1-(d) (aynı SSS). ETBİS tanımı 6563 m.2/1-(ı) (mevzuat.gov.tr, okundu) | kazuist.com kredi paketi sattığı için gerekir | Yayından önce | https://www.eticaret.gov.tr [DOĞRULANACAK: ETBİS giriş adresi, e-Devlet ile giriş] | Tarık |
| 2 | 6563 bilgi verme | 6563 m.3/1 (a) ilâ (d), m.4 (mevzuat.gov.tr, okundu) | Ön bilgilendirme formunun 5. bölümü ve künye bunu karşılamak için yazıldı | Yayından önce | | hukuk-uyum (metin), odeme (gösterim) |
| 3 | VERBİS kaydı | 6698 m.16/2 (mevzuat.gov.tr, okundu). Kurul istisnaları (kvkk.gov.tr/Icerik/8388, 1 Ekim 2025): 2018/87 ve 2023/1154 sayılı kararlarla ana faaliyeti özel nitelikli veri işleme olmayanlarda yıllık çalışan sayısı 50'den az ve yıllık mali bilanço toplamı 100 milyon TL'den az olanlar istisna; 2025/1572 sayılı kararla ana faaliyeti özel nitelikli veri işleme olanlarda eşik 10 çalışan ve 10 milyon TL | Kulular'ın çalışan sayısı ve bilançosu bilinmiyor (Tarık). Ana faaliyet: corpus m.6 verisi içerebilir ama maskelenir veya genelleştirilir; ana faaliyetin özel nitelikli veri işleme sayılıp sayılmayacağı hukukçu değerlendirmesiyle kesinleşir | Yayından önce karar; kayıt gerekiyorsa veri işlemeye başlamadan önce (m.16/2) | https://verbis.kvkk.gov.tr | Tarık |
| 4 | Yurt dışı aktarım standart sözleşme bildirimi | 6698 m.9/5; Yönetmelik (RG 10/7/2024, 32598) m.14/5-6 | Hetzner ile Standart Sözleşme 2 (aktarim.md). Bu yapılmadan yayın yok | İmzadan sonra beş iş günü | https://standartsozlesme.kvkk.gov.tr/ veya KEP | Tarık |
| 5 | Hetzner veri işleme sözleşmesi (AV) | docs.hetzner.com veri koruma sayfası (okundu) | Hesapta onay kutusuyla kurulur | Sunucu siparişiyle | https://accounts.hetzner.com/account/dpa | Tarık |
| 6 | İYS kaydı | Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (RG 15/7/2015, 29417) m.5/2 "Ticari elektronik ileti göndermek isteyen gerçek ve tüzel kişiler İYS'ye kaydolur" ve m.7/11 İYS dışında alınan onayların üç iş günü içinde İYS'ye kaydı; m.13/2 kayıtların üç yıl saklanması (değişiklik RG 4/1/2020, 30998, Resmî Gazete sayfa görüntüsünden okundu). m.6/2: devam eden abonelik, tahsilat, teslimat gibi bildirimler onaysız gönderilebilir ama mal veya hizmet tanıtamaz (RG 15/7/2015 özgün metni) | Yalnız kampanya ve indirim e-postası gönderilecekse (plan 10.8). Bilgilendirme iletileri (ödeme, fesih, Kalemcik hatırlatması) ticari ileti değildir ve tanıtım içermemelidir | İlk ticari iletiden önce | https://iys.org.tr | Tarık, kimlik (consents.acik_riza_pazarlama) |
| 7 | e-Arşiv fatura | VUK 509 Sıra No.lu Genel Tebliğ [DOĞRULANACAK: internet satışı kapsamı ve eşikler, mali müşavirle] | İnternet satışı; entegratör seçilmedi (review.md T9). Kod bugün faturayı "fatura_bekliyor" uyarısıyla bırakıyor | İlk satıştan önce | https://ebelge.gib.gov.tr | Tarık, mali müşavir |
| 8 | Saklama süreleri | TTK m.82/5-6 on yıl; VUK m.253 beş yıl (mevzuat.gov.tr, okundu) | envanter.md önerileri | Yayından önce onay | | Tarık, mali müşavir |
| 9 | iyzico üye işyeri, canlı hesap | Sözleşme | Sandbox açık; canlı anahtar Tarık onayıyla | Yayından önce | https://www.iyzico.com | Tarık |
| 10 | TÜRKPATENT marka başvurusu "Kazuist" | 6769 sayılı Sınai Mülkiyet Kanunu [DOĞRULANACAK: ilgili madde] | Sınıflar değerlendirilir: 9, 41, 42; 45. sınıf Kazuist hukuki hizmet sunmadığı için ayrıca değerlendirilir. Logo ve simge çizerden geldiğinde (ADR-0034) benzerlik araması | Yayından önce önerilir | https://epats.turkpatent.gov.tr | Tarık |
| 11 | Apple Developer kuruluş üyeliği | Apple Developer Program License Agreement | D-U-N-S numarası gerekir | iOS gönderiminden önce | https://developer.apple.com/programs/enroll/ | Tarık |
| 12 | Alan adı | Kayıt sözleşmesi | kazuist.com bitiş 24.02.2027 (plan 11); otomatik yenileme ve transfer kilidi açık mı | Yayından önce kontrol | https://www.turkticaret.net | Tarık |
| 13 | Veri ihlali bildirimi | 6698 m.12/5 (okundu: "en kısa sürede"); Kurul'un 72 saat kararı docs/runbook/ihlal.md'de 24.01.2019, 2019/10 diye yazılı [DOĞRULANACAK: kvkk.gov.tr karar metni] | Olay olursa | Olayda | https://www.kvkk.gov.tr | Tarık |
| 14 | 6493 sayılı Kanun izlemesi | plan 4.1/5 | Kapalı devre kredi; sınırlı ağ değerlendirmesi ve bildirim eşiği izlenir [DOĞRULANACAK: TCMB rehberi] | Sürekli | https://www.tcmb.gov.tr | Tarık, mali müşavir |

## Künye bilgileri (Tarık'tan, ticaret sicilinden)

- Onaylı: unvan, MERSİS, Ankara Ticaret Sicili 550123, adres (2026-10-20); e-posta ve telefon (2026-10-23).
- Eksik: vergi dairesi, VKN, KEP adresi.
- Kaynak: https://www.ticaretsicil.gov.tr (Türkiye Ticaret Sicili Gazetesi) ve https://mersis.ticaret.gov.tr
