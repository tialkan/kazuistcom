---
kaynak: rekabet
alan_adlari: [www.rekabet.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî yayın; Kurul kararları kurumun kendi sitesinde kamuya açık yayımlanır"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# Rekabet Kurumu Kurul kararları

Plan 6.1: karar arama, PDF'ten metin, haftalık. Liste: `https://www.rekabet.gov.tr/tr/SonkurulKararlari`; her karar
için `/tr/SonKurulKarari/<guid>`. Tarık onayı: bekliyor.

## Kullanım koşulları

Altbilgide "Rekabet Kurumu © Her Hakkı Saklıdır." yazar; ayrı bir kullanım koşulları sayfası bulunamadı. Otomatik erişim
ve yeniden kullanım hakkında yazılı hüküm DOĞRULANMADI. Karar metni kurumun kamuya açık yayınıdır ve resmî karardır;
sitenin telif bildirimi kararların kendisine mi, sayfa düzenine mi uygulanıyor belirsizdir: Tarık ve hukuk-uyum ajanı
onay verirken bunu netleştirmelidir.

## robots.txt (2026-10-19)

`/robots.txt` HTTP 200 ve `text/html` döndürüyor; gövde sitenin normal HTML şablonudur (robots dizesi yok). Dosya yok
sayılır (kısıtlama yok). Kod bu durumu "kısıtlama yok" okur; kurumun niyeti belirsiz olduğundan Tarık onayında bilerek
kabul edilmelidir.

## Hız ve protokol

0,5 istek/sn, haftalık. Protokol gerekmez. Geliştirmede 5 istek: robots, bir hatalı yol (302 hata sayfası), ana sayfa
(1,9 MB), bir karar sayfası ve liste. Fikstürler: liste (ilk 4 karar), bir karar özeti sayfası.

## PDF notu (doğrulanamadı)

Tam karar PDF'lerinin adres düzeni bu çalışmada doğrulanamadı (karar özet sayfalarında PDF bağlantısı görünmedi; kaynak
"Kurul Kararı Arama" `/tr/Kararlar` altında). Bağlayıcı PDF adresini parametre olarak alır (`pdfUrl`), PDF'i metin
katmanından çıkarır (`pypdf`); metin katmanı yoksa kayıt reddedilir, OCR bu aşamada yok. PDF testi, testin kendi
ürettiği sentetik bir PDF ile yapılır; gerçek bir Kurul kararı PDF'i çekilmedi.

## Tarık'tan

Robots yokluğunun ve telif bildiriminin kabulü; onay: bu dosyada `tarik_onayi: onaylandi`.
