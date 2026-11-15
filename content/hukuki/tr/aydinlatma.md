---
title: Kişisel verilerin işlenmesine ilişkin aydınlatma metni
slug: aydinlatma
route: /hukuki/aydinlatma
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
consent_kind: aydinlatma
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Bu sürüm dar çekirdekli ilk yayını (ADR-0038 madde 8),
> Almanya'daki Hetzner barındırmasını (ADR-0030, ADR-0033), kredi satışının kapalı olmasını
> (apps/web/src/server/billing/acik.ts) ve tarayıcıdan OpenRouter'a giden BYOK akışını (packages/ai-gateway/src/byok)
> yansıtır. Pratik ve Kalemcik üretimde gösterilmediği için pratik ilerlemesi ve yazma projeleri satırları çıkarıldı;
> iOS uygulaması henüz olmadığı için iOS'a özgü satırlar "yayımlandığında" diye yazıldı. Satış kayıtları satırları
> kredi satışı açıldığında geçerli olacak biçimde tutuldu. Yurt dışı aktarım dayanağı (KVKK m.9, Hetzner ile Standart
> Sözleşme 2 ve beş iş günü içinde bildirim, docs/kvkk/hetzner-standart-sozlesme-bildirimi.md) tamamlanmadan bu metin
> yayımlanamaz; aşağıdaki işaretler bu yüzden açıktır.

Bu metin 6698 sayılı Kişisel Verilerin Korunması Kanunu'nun ("KVKK") 10. maddesi ve Aydınlatma
Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ (RG 10/3/2018, 30356)
uyarınca hazırlanmıştır.

## 1. Veri sorumlusu

Kulular Bilişim Teknolojileri Ltd. Şti. ("Kazuist"). MERSİS: 0591095454600001. Adres: Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara.
KEP: {{KEP}}. İletişim: teknoloji@kulular.com.

## 2. Hangi verileri, hangi amaçla ve hangi hukuki sebeple işliyoruz

| Veri | Amaç | Hukuki sebep (KVKK m.5) |
|---|---|---|
| E-posta, ad soyad, profil görseli | Hesap açma, giriş, hizmet bildirimleri | Sözleşmenin kurulması ve ifası (m.5/2-c) |
| Giriş bilgileri: parola özeti, geçiş anahtarı (passkey) açık anahtarı, iki adımlı doğrulama anahtarı (şifreli), Google veya Apple ile girişte sağlayıcı hesap kimliği | Hesap güvenliği | m.5/2-c |
| Oturum bilgisi: IP adresi, tarayıcı bilgisi, giriş yöntemi | Oturum yönetimi, kötüye kullanımın önlenmesi | Meşru menfaat (m.5/2-f) ve hukuki yükümlülük (m.5/2-ç) |
| Günlük ücretsiz özet hakkı için IP adresinin ve hesap kimliğinin anahtarlı tek yönlü özeti | Ücretsiz hakkın ve işlem sınırlarının uygulanması; bir gün sonra silinir | m.5/2-f |
| edu.tr e-posta adresi ve doğrulama kaydı | Öğrenci haklarının tanınması | m.5/2-c |
| Hedef meslek, görünüm, hitap ve bildirim tercihleri | Kişiselleştirme | m.5/2-c |
| Kaydettikleriniz, notlarınız, kılavuzdan çıkarılan kurallar ve alıntılar | İstediğiniz hizmetin sunulması | m.5/2-c |
| Kaynaklı özet ve yazma araçlarına yazdığınız soru ve metin | Özetin ve kural çıkarmanın yapılması; kişisel veriler maskelendikten sonra yapay zekâ sağlayıcısına gider, metin kayda yazılmaz | m.5/2-c |
| Kendi anahtarınızla çıkarılan özetin cümleleri | Cümlelerin kaynakla yeniden doğrulanması; kaydedilmez | m.5/2-c |
| Kredi satışı açıldığında: sipariş, ödeme durumu, fatura, iade talebi, kredi hareketleri, sipariş anındaki ön bilgilendirme formu ve sözleşme metni | Satış, faturalama, iade, kredi defteri, sözleşmenin ispatı | m.5/2-c ve m.5/2-ç |
| Rıza ve onay kayıtları (hangi metnin hangi sürümünü ne zaman onayladığınız) | Onayların ispatı | m.5/2-ç ve m.5/2-e |
| KVKK başvurusu (kimlik numarası şifreli saklanır), kaldırma talebi | Taleplerin sonuçlandırılması | m.5/2-ç ve m.5/2-e |
| Bildirim cihazı bilgisi | Web bildirimleri; iOS uygulaması yayımlandığında iOS bildirimleri | m.5/2-c |
| Analitik ölçüm (etkinleştirilirse; kişisel veri tutmayacak biçimde) | Ürünün iyileştirilmesi | Açık rıza (m.5/1), yalnız çerez tercihinizle |
| Pazarlama iletisi izni | Kampanya ve indirim duyuruları | Açık rıza (m.5/1) |

Kredi satışı henüz açılmamıştır; açıldığında kart bilgileriniz Kazuist'e gelmez, ödeme kuruluşu iyzico tarafından
doğrudan alınır.

Bazı veriler yalnız tarayıcınızda kalır ve bize gönderilmez: rehberlerdeki işaretleriniz ve kendi YZ anahtarınız
(BYOK). Yazım kuralları ve iz denetleyicisine (/tespit) yapıştırdığınız metin tarayıcınızda işlenir, cihazınızdan
çıkmaz. Ayrıntı: [Çerez politikası](/hukuki/cerezler).

Yargı kararlarında geçen üçüncü kişilere ait veriler anonimleştirme politikamızla maskelenir;
bu işleme ilişkin ayrıntı [Gizlilik politikası](/hukuki/gizlilik) ve
[Telif ve kaldırma talebi politikası](/hukuki/kaldirma) sayfalarındadır.

## 3. Toplama yöntemi

Veriler; kayıt, giriş ve hesap formları, ürün içindeki işlemleriniz, Google veya Apple ile giriş seçtiğinizde bu
sağlayıcılar ve çerezler yoluyla elektronik ortamda toplanır. Kredi satışı açıldığında ödeme adımı, iOS uygulaması
yayımlandığında iOS uygulaması da toplama yoluna eklenir.

## 4. Kimlere aktarılır

- Barındırma: Hetzner Online GmbH (Almanya). Kazuist'in uygulaması, veri tabanı ve dosya deposu Almanya'daki bir
  Hetzner veri merkezinde çalışır; bu bir yurt dışı aktarımdır (aşağıda).
- Yedekleme: {{YEDEK_SAGLAYICI_VE_KONUMU}}.
- E-posta gönderim sağlayıcısı {{EPOSTA_SAGLAYICI_VE_KONUMU}}.
- Kanunen yetkili kamu kurumları.
- Kredi satışı açıldığında: ödeme kuruluşu iyzico, e-Arşiv fatura entegratörü ve mali müşavir.
- Google veya Apple ile giriş seçerseniz ilgili sağlayıcı; bildirim açtıysanız tarayıcınızın bildirim hizmeti
  (bildirim metninde kişisel veri ve içerik özeti yer almaz). iOS uygulaması yayımlandığında Apple'ın bildirim ve
  satın alma hizmetleri de bu listeye eklenir.
- Yapay zekâ sağlayıcıları: aşağıdaki iki yoldan yalnız maskelenmiş metin. Ayrıntı:
  [Yapay zekâ politikası](/hukuki/yapay-zeka).

Yapay zekâ sağlayıcısına giden metin:

1. Platform modunda (günlük ücretsiz hakla çıkarılan özet ve yazma araçlarında kural çıkarma) yalnız kişisel
   verilerden arındırılmış (maskelenmiş) metin, Kazuist sunucusundan OpenRouter, Inc. (ABD) üzerinden, veri
   toplamayan ve sıfır veri saklama koşulunu sağlayan uç noktalardaki modele gönderilir; yedek olarak doğrudan
   Anthropic kullanılabilir.
2. Kendi anahtarınızı kullandığınızda (BYOK) sorunuz önce Kazuist sunucusunda maskelenir; maskelenmiş soru ve kaynak
   pasajları tarayıcınıza döner ve tarayıcınız bunları sizin OpenRouter anahtarınızla doğrudan OpenRouter, Inc.'e
   (ABD) gönderir. Bu istekte Kazuist sunucusu OpenRouter'a bağlanmaz ve anahtarınızı görmez.

## 5. Yurt dışına aktarım

Barındırma hizmeti nedeniyle yukarıdaki bütün hesap ve içerik verileri Almanya'daki veri merkezinde işlenir. Bu
aktarım KVKK m.9/4-(c) uyarınca Kişisel Verileri Koruma Kurulu'nun ilan ettiği standart sözleşmeyle (veri
sorumlusundan veri işleyene, Standart Sözleşme 2) yapılır; sözleşme imzaların tamamlanmasından itibaren beş iş günü
içinde Kurum'a bildirilir (KVKK m.9/5). Kazuist, bu sözleşme imzalanıp Kurum'a bildirilmeden hizmette kişisel veri
işlemez [DOĞRULANACAK: Hetzner ile Standart Sözleşme 2'nin imzalandığı ve Kurum'a bildirildiği; imza alınamazsa bu
bölüm başka bir m.9 yoluna göre yeniden yazılır].

Diğer aktarımlar (e-posta sağlayıcısı, yedek deposu, Google, Apple, bildirim hizmetleri) için kullanılan yol,
sağlayıcı seçildikçe bu bölüme yazılır [DOĞRULANACAK: docs/kvkk/aktarim.md tablosundaki açık satırlar].
Yapay zekâ sağlayıcısına kişisel veri gönderilmemesi hedeflenir; metin her modda maskelenerek gönderilir. Kendi
anahtarınızla yapılan isteklerde tarayıcınız, gönderimden önce metinde kimlik numarası, telefon, e-posta, IBAN gibi
bir tanımlayıcının kalıp kalmadığını yeniden denetler; kalmışsa istek gönderilmez. Bu istek sizin OpenRouter hesabınızla
yapıldığı için OpenRouter, IP adresinizi ve hesap bilgilerinizi kendi gizlilik politikasına göre işler.

## 6. Haklarınız (KVKK m.11)

Kişisel verilerinizin işlenip işlenmediğini öğrenme; işlenmişse bilgi talep etme; işlenme amacını ve
amacına uygun kullanılıp kullanılmadığını öğrenme; yurt içinde veya yurt dışında aktarıldığı üçüncü
kişileri bilme; eksik veya yanlış işlenmişse düzeltilmesini isteme; KVKK m.7 şartlarıyla silinmesini
veya yok edilmesini isteme; düzeltme ve silme işlemlerinin aktarılan üçüncü kişilere bildirilmesini
isteme; münhasıran otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve
kanuna aykırı işleme nedeniyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.

Başvurunuzu [başvuru formu](/hukuki/basvuru) ile veya hesabınızdan (/hesap/kvkk) iletebilirsiniz.
Başvurular talebin niteliğine göre en kısa sürede ve en geç otuz gün içinde ücretsiz sonuçlandırılır (KVKK m.13/2).
Başvurunuz reddedilir, cevap yetersiz bulunur veya süresinde cevap verilmezse Kişisel Verileri Koruma Kurulu'na
şikâyette bulunabilirsiniz (KVKK m.14).
