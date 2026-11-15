# Hetzner ile Standart Sözleşme 2: imza ve Kurum'a bildirim kontrol listesi

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-15 (taslak 1). Uyum garantisi vermez; hukukçu görüşünün yerine geçmez.
Bu ajan hiçbir sözleşme imzalamaz, Hetzner'a yazmaz ve Kurum'a bildirim göndermez; aşağıdaki her gönderim ve imza
Tarık'ındır.

Neden: ADR-0030 "Sonuçlar ve koşullar" madde 1 ve ADR-0033 ön koşul 1; ADR-0038 madde 8 dar çekirdekli yayında da
hesap açıldığı için koşulun aynen geçerli olduğunu yazar. Bu adım tamamlanmadan üretimde kişisel veri işlenmez, DNS
geçişi yapılmaz. Ayrıntılı değerlendirme: `aktarim.md`.

## 1. Dayanak (birincil kaynaktan, 15 Kasım 2026 okuması)

| Kaynak | Ne diyor | Nereden okundu |
|---|---|---|
| 6698 sayılı Kanun m.9/4-(c) | Yeterlilik kararı yoksa, Kurul'un ilan ettiği standart sözleşme uygun güvencedir (m.5 veya m.6 şartından biri ve ilgili kişinin aktarılan ülkede hak arama imkânı ile birlikte) | mevzuat.gov.tr, MevzuatMetin/1.5.6698.pdf |
| 6698 m.9/5 | "Standart sözleşme, imzalanmasından itibaren beş iş günü içinde veri sorumlusu veya veri işleyen tarafından Kuruma bildirilir." | Aynı PDF |
| 6698 m.18/1-(d) ve m.18/2 | m.9/5 bildirimini yapmayan veri sorumlusu veya veri işleyene 50.000 TL'den 1.000.000 TL'ye kadar idari para cezası (7499 sayılı Kanunla eklendi, 2/3/2024) | Aynı PDF. Tutarlar kanun metnindekidir [DOĞRULANACAK: 2026 için yeniden değerlenmiş tutar, Kurum duyurusundan] |
| Yönetmelik (RG 10/7/2024, 32598) m.14/3 | Standart sözleşme hiçbir değişiklik yapılmadan kullanılır; yabancı dilde de akdedilirse Türkçe metin esas alınır | resmigazete.gov.tr/eskiler/2024/07/20240710-2.htm |
| Yönetmelik m.14/4 | Taraflarca veya temsile ve imzaya yetkili kişilerce imzalanması zorunlu | Aynı |
| Yönetmelik m.14/5 | İmzaların tamamlanmasından itibaren beş iş günü içinde fiziken, KEP adresiyle ya da Kurul'un belirlediği diğer yöntemlerle bildirilir; bildirimi kimin yapacağı belirlenmemişse veri aktaran bildirir | Aynı |
| Yönetmelik m.14/6 | Bildirime imzalayanların yetkisini gösteren belgeler ve yabancı dildeki belgelerin noter onaylı çevirileri eklenir | Aynı |
| Yönetmelik m.14/8 | Taraf bilgileri veya sözleşme içeriği değişirse ya da sözleşme sona ererse aynı usulle yeniden bildirilir | Aynı |
| Standart Sözleşme 2 (Veri Sorumlusundan Veri İşleyene) | 18 madde ve Ek I (aktarımın detayları), Ek II (teknik ve idari tedbirler), Ek III (alt veri işleyenler). Madde 8'de iki seçenek (özel veya genel yetkilendirme, süre taraflarca yazılır); Madde 10(a) ikinci paragraf ve Madde 16 (bildirimi kimin yapacağı) tarafların tercihine bağlı; Madde 17 Türk hukuku, Madde 18 Türk mahkemeleri | kvkk.gov.tr/Icerik/7929/Standart-Sozlesmeler, PDF b531d656-9cea-4cdb-84ce-1ab92198c9b1.pdf (13 sayfa, tamamı okundu) |
| Standart Sözleşme Bildirim Kılavuzu | Modülde hesap, yetkili kişi, taraf ve sözleşme ekleme ve "Kuruma Gönder" adımları (aşağıda bölüm 5) | standartsozlesme.kvkk.gov.tr/sharedFolder/kullanim-kilavuzu.pdf (1-38. sayfalar okundu) |
| Hetzner veri koruma sayfası | "We do not create or sign individual Data Processing Agreement (DPA)s." AV sözleşmesi hesapta onay kutusuyla kurulur; veri koruma soruları müşteri hesabından talep veya data-protection@hetzner.com | docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner |
| Hetzner künyesi | Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany; Amtsgericht Ansbach HRB 6089; Tel. +49 (0)9831 505-0; info@hetzner.com | hetzner.com/legal/legal-notice |

Taraf rolleri: Kulular veri sorumlusu ve veri aktaran, Hetzner Online GmbH veri işleyen ve veri alıcısı. Bu yüzden
Standart Sözleşme 2 kullanılır (Standart Sözleşme 1, 3 ve 4 değil).

## 2. Ana risk: Hetzner imzalar mı

Hetzner'ın resmî sayfası bireysel sözleşme imzalamadığını söylüyor; Standart Sözleşme 2 iki tarafın imzasını ister ve
değiştirilemez. Bu yüzden ilk adım Hetzner'a yazılı sormaktır (bölüm 3). Olası sonuçlar:

1. Hetzner değiştirilmemiş metni imzalar: bölüm 4 ve 5 uygulanır.
2. Hetzner imzalamaz veya metni değiştirmek ister: değiştirilmiş metin m.9/4-(c) güvencesi sağlamaz (m.14/3, m.14/7).
   Üretimde kişisel veri işlenmez; Tarık, `aktarim.md` "Hetzner: durum ve risk" bölümündeki yollardan birini seçer
   (yazılı taahhütname ve Kurul izni, ya da kişisel veriyi Türkiye'de tutan yeni bir barındırma kararı ve yeni ADR).
   Açık rıza düzenli barındırmaya dayanak yapılmaz (m.9/6 arızi olma şartı).
3. Hetzner yanıt vermez: 2 ile aynı; süre sınırı Tarık'ın yayın planına göre belirlenir.

## 3. Adım 0: Hetzner'a yazılı soru (Tarık gönderir)

Kime: data-protection@hetzner.com veya Hetzner müşteri hesabından veri koruma talebi (Hetzner sayfası ikisini de
veriyor) [DOĞRULANACAK: müşteri hesabındaki talep menüsünün adı, gönderim anında].

Ekler: Kurul'un Standart Sözleşme 2 Türkçe PDF'i (kvkk.gov.tr bağlantısı yukarıda) ve bir İngilizce çalışma çevirisi
(çeviriyi Tarık hazırlatır; Türkçe metin esastır, m.14/3). Ek I ve Ek II taslakları (bölüm 4) da eklenebilir.

Taslak e-posta (İngilizce, Hetzner'ın çalışma dili olduğu için; gönderen ve imza alanları Tarık'ındır):

> Subject: Turkish data protection law (KVKK): request to sign Standard Contract 2 (controller to processor)
>
> Customer number: {{HETZNER_MUSTERI_NO}}
>
> Dear Hetzner data protection team,
>
> Kulular Bilişim Teknolojileri Ltd. Şti. (Ankara, Türkiye) intends to host the production systems of its service
> on Hetzner Cloud servers in Germany. Under Article 9 of the Turkish Personal Data Protection Law No. 6698 and
> Article 14 of the Turkish Regulation on the Transfer of Personal Data Abroad (Official Gazette 10 July 2024,
> No. 32598), a transfer of personal data from Türkiye to a processor abroad requires the standard contract published
> by the Turkish Personal Data Protection Board, signed by both parties without any modification. We understand from
> your documentation that Hetzner does not sign individual DPAs; this request is not an individual DPA but the
> Board's fixed template, which we may not alter.
>
> We would therefore like to ask:
>
> 1. Will Hetzner Online GmbH sign the attached "Standard Contract 2 (Data Controller to Data Processor)" in its
>    unmodified Turkish text (a convenience English translation is attached; the Turkish text prevails by law)?
> 2. If yes, who will sign on behalf of Hetzner Online GmbH, and can you provide a document showing the signatory's
>    authority (for example a current commercial register extract and, if applicable, a power of attorney)?
> 3. Please confirm the contact point (name, title, contact details) to be entered in the contract, and whether your
>    technical and organisational measures (annex to your data processing agreement) and your sub-processor list
>    (hetzner.com/AV/subunternehmer.pdf) may be attached as Annex II and Annex III.
> 4. Clause 8 offers prior specific or general authorisation for sub-processors with a notice period to be agreed.
>    Which option and notice period are compatible with your existing data processing agreement?
>
> Under Turkish law we must notify the Turkish authority within five business days after both signatures are
> complete, so we would appreciate knowing your signing process and expected timing in advance.
>
> Kind regards,
> {{IMZA_YETKILISI_AD_UNVAN}}
> Kulular Bilişim Teknolojileri Ltd. Şti.

## 4. İmzalanacak belge (Tarık imzalar, Hetzner imzalar)

Belge: Kurul'un Standart Sözleşme 2 metni, kelimesi kelimesine. Yalnız metnin kendisinin bıraktığı boşluklar
doldurulur ve köşeli parantezli seçenekler seçilir; başka hiçbir ekleme, çıkarma veya değişiklik yapılmaz (m.14/3).

### 4.1 Seçimler (Tarık karar verir)

| Yer | Seçenekler | Öneri ve gerekçe |
|---|---|---|
| Madde 8 alt veri işleyen | 1. Özel yetkilendirme veya 2. Genel yetkilendirme; ikisinde de "[Süreyi belirtin]" | Genel yetkilendirme: Hetzner bir alt işleyen listesiyle çalışıyor. Süre: {{ALT_ISLEYEN_BILDIRIM_SURESI}} (Hetzner'ın AV sözleşmesindeki bildirim süresiyle çelişmeyecek değer; Hetzner yanıtından sonra yazılır). Seçilmeyen seçenek metinden çıkarılır [DOĞRULANACAK: seçilmeyen seçeneğin metinden çıkarılmasının mı yoksa işaretlenmesinin mi beklendiği; ALO 198 veya standartsozlesme@kvkk.gov.tr] |
| Madde 10(a) ikinci paragraf (bağımsız uyuşmazlık çözüm kuruluşu) | Konur veya konmaz | Konmaması: tercihe bağlı bir ek yükümlülüktür; karar Tarık'ın |
| Madde 16 (bildirimi kim yapar) | "Veri aktaran" veya "Veri alıcısı"; madde tamamen konmayabilir | "Veri aktaran" yazılarak konması: Kulular Türkiye'dedir ve modüle e-Devlet ile girebilir. Madde konmazsa da bildirim yine veri aktaranındır (Yönetmelik m.14/5) |

### 4.2 Ek I taslağı (aktarımın detayları; envanter.md'den)

| Ek I başlığı | Taslak içerik |
|---|---|
| Veri aktaranın faaliyetleri | Kazuist hukuk araştırma ve öğrenme platformunun işletilmesi: kullanıcı hesabı ve girişi, kaydedilen içerik, yazma araçları, KVKK başvuruları ve kaldırma talepleri, yargı kararlarının toplanması ve anonimleştirilmesi; kredi satışı açıldığında satış kayıtları |
| Veri alıcısının faaliyetleri | Bulut sunucu barındırma (Hetzner Cloud, Almanya) ve seçilirse yedek depolama (Hetzner Storage Box); veriyi yalnız veri aktaranın talimatıyla barındırır ve depolar |
| İlgili kişi grupları | Kullanıcılar; siteyi ziyaret edenler (oturum ve IP bilgisi); KVKK başvurusu ve kaldırma talebi yapanlar; yayımlanmış yargı kararlarında adı geçen üçüncü kişiler (anonimleştirme öncesi ham metin); Kulular'ın yönetici ve editörleri |
| Aktarılan kişisel veri kategorileri | Kimlik, iletişim, işlem güvenliği, müşteri işlem (kredi satışı açıldığında), kullanıcı içeriği, eğitim bilgisi, pazarlama izni, hukuki işlem (başvuru ve talepler), ham karar metinlerindeki üçüncü kişi verileri (envanter.md satır 1-18, 21-26, 29) |
| Aktarılan özel nitelikli veri kategorileri | Kullanıcıdan istenmez. Ham karar metinlerinde sağlık, ceza mahkûmiyeti ve güvenlik tedbirleri gibi veriler bulunabilir; anonimleştirmeden önce sunucuda işlenir (envanter.md satır 26, T4 kararı açık) [DOĞRULANACAK: hukukçu; m.6 şartı ve Standart Sözleşme 2 madde 7.7] |
| Aktarımın hukuki sebebi | m.5/2-(c), (ç), (e), (f); pazarlama izni için m.5/1; ham karar metinleri için [DOĞRULANACAK: hukukçu, m.6/3] |
| Aktarım sıklığı | Sürekli (barındırma) |
| İşleme faaliyetinin niteliği | Barındırma, depolama, yedekleme |
| Amaçlar | Hizmetin sunulması, güvenliği ve sürekliliği |
| Saklama süresi | Veri kategorisine göre envanter.md "Önerilen saklama" sütunu; sözleşme bitince veri aktaranın tercihine göre iade veya yok etme (Standart Sözleşme 2 madde 7.4) |
| Alt veri işleyene aktarımlarda konu, nitelik ve süre | Hetzner alt işleyen listesine göre [DOĞRULANACAK: hetzner.com/AV/subunternehmer.pdf okunmadı; seçilen konumlar için hangi alt işleyenlerin veriye eriştiği] |
| Alıcılar veya alıcı grupları | Hetzner Online GmbH; Ek III'teki alt işleyenler |
| Veri aktaranın VERBİS bilgileri | {{VERBIS_BILGISI}} (kayıt yükümlülüğü yoksa boş kalır; yukumlulukler.md satır 3) |

Ek II (teknik ve idari tedbirler): Hetzner'ın AV sözleşmesi ekindeki tedbirler ve Kulular'ın kendi tedbirleri (TLS,
veri tabanının internete kapalı olması ve yalnız özel ağdan erişim, iki adımlı doğrulama anahtarlarının şifreli
saklanması, yönetici işlemlerinin denetim kaydı, en az yetki). Özel nitelikli veri için ayrıca Kurul'un belirlediği
yeterli önlemler yazılır [DOĞRULANACAK: güncel Kurul kararı, kvkk.gov.tr]. Metin altyapi ajanının runbook'larıyla
karşılaştırılmadan imzaya gönderilmez.

Ek III (alt veri işleyenler): Hetzner'ın listesi; her biri için ad, adres, irtibat ve işleme detayı.

### 4.3 İmza bloğu

| Alan | Veri aktaran | Veri alıcısı |
|---|---|---|
| Unvan | Kulular Bilişim Teknolojileri Limited Şirketi | Hetzner Online GmbH |
| Adres | Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara | Industriestr. 25, 91710 Gunzenhausen, Germany |
| İrtibat noktasının adı soyadı, unvanı ve iletişim bilgileri | {{IRTIBAT_KISISI_AD_UNVAN_ILETISIM}} | Hetzner'ın bildireceği kişi (bölüm 3 soru 3) |
| İmzalayanın adı soyadı ve unvanı | {{IMZA_YETKILISI_AD_UNVAN}} (imza sirkülerindeki yetkili) | Hetzner'ın yetkilisi |
| İmza ve tarih | Islak imza veya güvenli elektronik imza [DOĞRULANACAK: modülün güvenli elektronik imzalı PDF'i kabul edip etmediği; kılavuz yalnız "taranıp PDF hâlinde" diyor] | Aynı |

"İmzaların tamamlandığı tarih" ikinci (son) imzanın tarihidir; modülde zorunlu alandır ve beş iş günü buradan
sayılır. Bu tarih kaydedilir: {{SS2_IMZA_TARIHI}}.

## 5. Bildirim (Tarık gönderir, Kurum'a)

### 5.1 Süre

- Son gün: imzaların tamamlandığı tarihten itibaren beşinci iş günü (6698 m.9/5, Yönetmelik m.14/5). Hafta sonu ve
  resmî tatiller iş günü sayılmaz [DOĞRULANACAK: arife yarım günlerinin sayımı; ALO 198 veya
  standartsozlesme@kvkk.gov.tr].
- Öneri: modül hesabı, yetkili kişi ve Hetzner tarafı imzadan önce kurulur (5.3 adım 1-6); imza tamamlanınca aynı gün
  veya ertesi iş günü yalnız sözleşme yüklenip gönderilir.
- Bildirimi yapmamanın yaptırımı: m.18/1-(d) (bölüm 1).

### 5.2 Hazırlanacak dosyalar

| # | Dosya | Biçim | Not |
|---|---|---|---|
| 1 | İmzalı Standart Sözleşme 2 (ekleriyle tek dosya) | Yalnız PDF, tek dosya (kılavuz s.32) | Taranmış imzalı nüsha |
| 2 | Kulular imza yetkisi: imza sirküleri ve yetkiyi gösteren Ticaret Sicili Gazetesi | Ek dosya: jpeg, jpg, png, Word, Excel veya PDF (kılavuz s.31-32) | Yönetmelik m.14/6 |
| 3 | Hetzner imza yetkisi: güncel ticaret sicili kaydı (Amtsgericht Ansbach HRB 6089) ve gerekiyorsa vekâletname | Ek dosya | Almanca veya İngilizce ise noter onaylı Türkçe çevirisi de eklenir (m.14/6) [DOĞRULANACAK: yabancı belgenin noterde çevrilmesi için apostil gerekip gerekmediği; notere sorulur] |
| 4 | Sözleşmenin İngilizce çalışma çevirisi imzalı belgeye dahilse | Ek dosya | [DOĞRULANACAK: Türkçe metin esas olduğunda İngilizce nüshanın da noter onaylı çeviri gerektirip gerektirmediği] |
| 5 | Modüldeki yetkili kişinin yetki belgesi | Yalnız PDF (kılavuz s.14-15) | Yetkili kişinin Kulular adına modüle sözleşme yüklemeye yetkili olduğunu gösteren belge; Tarık şirket müdürüyse imza sirküleri yeterli olabilir [DOĞRULANACAK: Kurum'un kabul ettiği belge türü] |

### 5.3 Standart Sözleşme Bildirim Modülü adımları (kılavuza göre)

Adres: https://standartsozlesme.kvkk.gov.tr/ . Yardım: ALO 198 ve standartsozlesme@kvkk.gov.tr (kılavuz s.2).

1. "HESAP OLUŞTUR": uyarıyı okuyup "TAMAM"; "Bildirimde Bulunan Ünvan/İsim" Kulular Bilişim Teknolojileri Limited
   Şirketi; telefon başında sıfır olmadan; e-posta; doğrulama yöntemi telefon veya e-posta. Parola e-postayla gelir.
2. "OTURUM AÇ" ve e-postayla gelen giriş doğrulama kodu.
3. Sol menü "Hesap Bilgileri": Yerleşim Yeri "Yurtiçinde Yerleşik", Vergi Kimlik No {{VKN}}, unvan, açık adres,
   website https://kazuist.com veya şirket sitesi. Onaydan sonra yerleşim yeri ve VKN değiştirilemez.
4. Sol menü "Yetkili Kişiler" > "Kişi Ekle": uyruk T.C., T.C. kimlik numarası (Tarık modüle kendisi yazar; depoya ve
   sohbete yazılmaz), ad soyad, görev veya unvan, e-posta, telefon, yetki belgesi PDF (5.2 satır 5).
5. Çıkış; "YETKİLİ KİŞİ GİRİŞ" > "E-DEVLET İLE GİRİŞ"; veri sorumlusu olarak Kulular seçilir.
6. Sol menü "Taraflar" > "Taraf Ekle": Taraf Türü "Yurtdışında Yerleşik", ülke Almanya, unvan Hetzner Online GmbH,
   adres Industriestr. 25, 91710 Gunzenhausen, Germany, website https://www.hetzner.com, telefon 4998315050, e-posta
   (Hetzner'ın bildirdiği irtibat adresi; yoksa data-protection@hetzner.com). Sözleşmeye bağlanan tarafın bilgileri
   adres ve website dışında sonradan değiştirilemez.
7. Sol menü "Sözleşmeler" > "Sözleşme Ekle": 1. Taraf "Aktaran", rol Veri Sorumlusu; 2. Taraf Hetzner, rol Veri
   İşleyen; dosya açıklaması (en çok 200 karakter); sözleşme dosyası (5.2 satır 1); imzaların tamamlandığı tarih
   gg.aa.yyyy; ek dosyalar (5.2 satır 2-4); "Kaydet".
8. Listede yeşil uçak simgesi "Kuruma Gönder" > "Onayla". Gönderimden sonra açıklama, dosya ve tarih
   düzenlenemez; yalnız değişiklik ve sonlandırma bildirimi yapılabilir.
9. Durum "Kuruma Gönderildi" ve "Kuruma Bildirim Tarihi" görünür. Bu ekranın görüntüsü kanıt olarak saklanır;
   tarih kaydedilir: {{SS2_BILDIRIM_TARIHI}}.

Modül dışı yollar (Yönetmelik m.14/5): Kulular'ın KEP adresinden ({{KEP}}) Kurum'un KEP adresine
[DOĞRULANACAK: Kurum KEP adresi, kvkk.gov.tr iletişim sayfasından] veya fiziki olarak Kurum adresine (Nasuh Akar
Mahallesi 1407. Sok. No:4, 06520 Çankaya/Ankara; kvkk.gov.tr sayfa altbilgisi, 15 Kasım 2026). Fiziki yolda
teslim tarihinin belgelenmesi gerekir; modül önerilir.

## 6. Bildirimden sonra

1. `aktarim.md` Hetzner satırına imza ve bildirim tarihleri yazılır; ekran görüntüsü ve imzalı PDF depoya değil
   Kulular'ın belge arşivine konur.
2. `content/hukuki/tr/aydinlatma.md` 5. bölümdeki [DOĞRULANACAK] işareti kapatılır; metin yeniden onaya sunulur.
3. Değişiklik bildirimi (m.14/8; Standart Sözleşme 2 madde 7.8(c) ve 8): Ek I'deki alıcılar, Ek III'teki alt
   işleyenler veya taraf bilgileri değişirse modülde "Sözleşme Değişiklik Bildirimi" yapılır. Yeni bir Hetzner ürünü
   veya konumu (örneğin Storage Box ya da Helsinki) Ek I'de yoksa önce Ek I güncellenir.
4. Sözleşme biterse "Sözleşme Sonlandırma Bildirimi" yapılır.
5. Hetzner AV sözleşmesi (https://accounts.hetzner.com/account/dpa, onay kutusu) ayrı bir adımdır ve yine yapılır;
   Standart Sözleşme 2'nin yerine geçmez, Standart Sözleşme 2 de onun yerine geçmez.

## 7. Tarık'ın yapacakları (özet)

| # | Ne | Kime veya nerede | Ne zaman |
|---|---|---|---|
| 1 | Bölüm 3'teki e-postayı göndermek (Türkçe Standart Sözleşme 2 ve İngilizce çalışma çevirisiyle) | data-protection@hetzner.com veya Hetzner müşteri hesabından talep | Şimdi; üretim sunucusu siparişinden önce |
| 2 | Madde 8, 10(a) ve 16 seçimlerini yapmak; Ek I, II, III'ü onaylamak | Bu dosya bölüm 4 | Hetzner yanıtından sonra |
| 3 | Modül hesabını, yetkili kişiyi ve Hetzner tarafını kurmak | https://standartsozlesme.kvkk.gov.tr/ | İmzadan önce |
| 4 | Sözleşmeyi Kulular adına imzalamak ve Hetzner'a imzaya göndermek | Hetzner'ın bildirdiği yol | Hetzner kabul ederse |
| 5 | İmza yetki belgelerini ve noter onaylı çevirileri hazırlamak | Noter | İmzayla aynı hafta |
| 6 | Sözleşmeyi Kurum'a bildirmek | Modül (bölüm 5.3 adım 7-9), KEP veya fiziki | İmzaların tamamlanmasından itibaren en geç beşinci iş günü; öneri aynı gün |
| 7 | İmza ve bildirim tarihlerini hukuk-uyum'a iletmek | aktarim.md, aydinlatma.md güncellemesi | Bildirim günü |
| 8 | Hetzner imzalamazsa üretimde kişisel veri işlememek ve yol seçmek | aktarim.md bölümü, yeni ADR | Hetzner yanıtından sonra |
