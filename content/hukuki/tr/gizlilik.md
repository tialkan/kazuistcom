---
title: Gizlilik politikası
slug: gizlilik
route: /hukuki/gizlilik
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Barındırma Almanya'daki Hetzner veri merkezine
> (ADR-0030 madde 2, ADR-0033) göre yazıldı; kodda olmayan virüs taraması iddiası çıkarıldı; mali kayıt saklama
> süresi TTK m.82 ve VUK m.253 metinlerinden (mevzuat.gov.tr, 12 Kasım 2026) yazıldı. Dar çekirdekli ilk yayına
> göre (ADR-0038 madde 8) pratik ilerlemesi çıkarıldı, BYOK anahtarının tarayıcıda tutulması eklendi; kredi satışı
> kapalı olduğu için satış kayıtlarının saklanması "satış açıldığında" diye yazıldı.

Bu politika, Kazuist'in kişisel verileri nasıl koruduğunu anlatır. Yasal bilgilendirme
[aydınlatma metnindedir](/hukuki/aydinlatma); bu sayfa onu tamamlar.

## 1. İlkeler

- Kazuist'in uygulaması, veri tabanı ve dosya deposu Hetzner Online GmbH'nin Almanya'daki veri merkezinde
  çalışır. Bu yurt dışı aktarımın dayanağı [aydınlatma metninin](/hukuki/aydinlatma) 5. bölümündedir.
- Reklam yoktur; verileriniz satılmaz ve reklam amacıyla paylaşılmaz.
- Üçüncü taraf izleme betiği kullanılmaz. Analitik şu anda etkin değildir; etkinleştirilirse yalnız onayınızla
  ve kendi sunucumuzda çalışır.
- Yapay zekâ sağlayıcısına yalnız anonim veya maskelenmiş metin gider. Platform modunda istek Kazuist sunucusundan
  OpenRouter'a, veri toplamayan ve sıfır veri saklama koşulunu sağlayan uç noktalara gider. İçerik kayıtlara (log)
  yazılmaz; yalnız işlem türü, model, token sayısı, süre ve maliyet gibi meta veri tutulur.
- Kendi OpenRouter anahtarınızı kullanırsanız anahtar yalnız tarayıcınızda tutulur: varsayılan olarak oturum
  deposunda (sekmeyi kapatınca silinir), "Bu cihazda hatırla" seçeneğini seçerseniz tarayıcının yerel deposunda.
  Anahtar Kazuist sunucusuna gönderilmez; maskelenmiş metin tarayıcınızdan doğrudan OpenRouter'a gider ve her
  istekte veri toplayan sağlayıcılar dışarıda bırakılır.
- Bazı veriler yalnız tarayıcınızda kalır: rehber işaretleri, kendi YZ anahtarınız ve /tespit sayfasına
  yapıştırdığınız metin sunucumuza gönderilmez. Ayrıntı: [Çerez politikası](/hukuki/cerezler).

## 2. Güvenlik

Bağlantılar TLS ile şifrelenir. Oturum çerezleri HttpOnly, Secure ve SameSite=Lax ayarlıdır. Veri tabanı
internete kapalıdır. Yüklenen kılavuz dosyaları tür denetimi ve 20 MB boyut sınırından geçer, bellekte okunur
ve diske yazılmaz. İki adımlı doğrulama anahtarları şifreli tutulur. Yönetici işlemleri denetim kaydına yazılır.
Kişisel veri ihlalinde ilgili kişilere ve Kişisel Verileri Koruma Kurulu'na en kısa sürede bildirim yapılır
(KVKK m.12/5).

## 3. Saklama ve silme

Hesap verileri hesabınız açık olduğu sürece tutulur. Hesabınızı web'den (iOS uygulaması yayımlandığında iOS'tan da) silebilirsiniz; silme talebinden sonra 14 gün içinde vazgeçebilirsiniz, süre bitince hesap verileri silinir.

Bazı kayıtlar kanuni süre boyunca saklanır. Kredi satışı henüz açılmamıştır; aşağıdaki satış kayıtları satış
açıldığında oluşur:

- Mesafeli sözleşme kayıtları en az üç yıl (Mesafeli Sözleşmeler Yönetmeliği m.20/1).
- Fatura ve ticari defterlere dayanak olan satış kayıtları, ilgili oldukları takvim yılının bitiminden itibaren
  on yıl (6102 sayılı Türk Ticaret Kanunu m.82/5 ve 6). Vergi mevzuatındaki beş yıllık süre (213 sayılı Vergi Usul
  Kanunu m.253) bu sürenin içinde kalır.

Hesap silindiğinde onay, sipariş ve denetim kayıtlarında kimliğiniz yerine tek yönlü özet kalır.

Kullanılmamış satın alınmış krediniz varsa silme ekranında uyarı ve iade talebi seçeneği gösterilir.

Tarayıcınızda tutulan kendi YZ anahtarınızı "Kendi YZ anahtarınız" sayfasındaki (/hesap/yz-anahtari) "Anahtarı
sil" düğmesiyle veya tarayıcı verilerinizi silerek kaldırabilirsiniz. Anahtar bizde olmadığı için hesabınızı
silmek onu tarayıcınızdan kaldırmaz; OpenRouter hesabınızdaki anahtarı OpenRouter'da ayrıca iptal edebilirsiniz.

## 4. Verilerinizi indirme

Hesap sayfasından (/hesap/verilerim) verilerinizi JSON ve CSV olarak indirebilirsiniz.

## 5. Yargı kararlarındaki kişisel veriler

Kazuist, resmî kaynaklarda yayımlanmış kararları anonimleştirerek sunar. Taraf, vekil, tanık, bilirkişi,
ilk derece hâkimi ve savcı adları; kimlik numarası, adres, telefon, IBAN, plaka gibi tanımlayıcılar
maskelenir. Kişi adları arama dizinine ve öneri listelerine girmez. Sağlık, ceza mahkûmiyeti gibi özel
nitelikli veriler genelleştirilir. Anonimleştirme otomatik bir işlemdir ve hata yapabilir. Bir kararda sizinle
ilgili bilgi gördüyseniz [kaldırma talebi](/hukuki/kaldirma) gönderebilirsiniz.

## 6. Çocuklar

Kazuist hukuk öğrencileri, akademisyenler ve meslek adayları için tasarlanmıştır; 18 yaşından küçüklere
yönelik değildir. Hesap açarak ve kullanım koşullarını kabul ederek 18 yaşını doldurduğunuzu beyan edersiniz.

## 7. Değişiklikler

Bu politika değişirse sürüm tarihi güncellenir; esaslı değişiklikler e-postayla bildirilir.

## 8. İletişim

teknoloji@kulular.com. Künye: [Hukuki uyarı ve künye](/hukuki/uyari).
