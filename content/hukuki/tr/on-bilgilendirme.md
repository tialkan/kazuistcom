---
title: Ön bilgilendirme formu
slug: on-bilgilendirme
route: /hukuki/on-bilgilendirme
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
consent_kind: on_bilgilendirme
pdf: true
pdf_fields: [AYLIK_KREDI, INDIRIM, KREDI, ODEME_DONEMI, TUTAR_TL, URUN_ACIKLAMASI, URUN_ADI, URUN_TURU]
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Kredi satışı ilk yayında kapalıdır (ADR-0038,
> apps/web/src/server/billing/acik.ts `odemeAcik`): bu form satış açılana kadar ödeme adımında gösterilmez ve
> yayımlanmaz; satış açılmadan önce yeniden onaya sunulur. Form gövdesi bu sürümde değişmedi. 6563 sayılı Kanun m.3/1 bilgileri (sözleşmenin
> kurulma adımları, veri girişi hataları, sözleşme metninin saklanması, gizlilik kuralları) eklendi; mevzuat.gov.tr
> metninden 12 Kasım 2026'da okundu. iOS sürüm alanı çıkarıldı: bu form yalnız web satışında kullanılır, iOS
> satın alımları Apple üzerinden yürür. Ön bilgiye `pdf` ve `pdf_fields` alanları eklendi; on-yuz ön bilgi
> ayrıştırıcısı listeyi okuyor (docs/istekler/hukuk-uyum-p5-tutarlilik.md madde 1).

Gösterim kuralları (odeme ajanı için): Bu form ödeme yükümlülüğü altına girmeden hemen önce, en az 12 punto
eşdeğerinde ve okunaklı gösterilir (Mesafeli Sözleşmeler Yön. m.6). "Ön bilgilendirme formunu okudum ve
onaylıyorum" kutusu işaretlenmeden ödeme düğmesi açılmaz; teyit sağlanmazsa sözleşme kurulmamış sayılır
(m.7). Form ve sözleşme PDF olarak e-postayla kalıcı veri saklayıcısında gönderilir. Ön bilgideki
`pdf_fields` alanları sipariş anında sunucu tarafından doldurulur.

## 1. Satıcı

Unvan: Kulular Bilişim Teknolojileri Ltd. Şti. MERSİS: 0591095454600001. Adres: Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara. Telefon: +90 505 781 48 46.
E-posta: teknoloji@kulular.com. KEP: {{KEP}}.

## 2. Hizmetin temel nitelikleri

Ürün: {{URUN_ADI}} ({{URUN_TURU}}). İçerik: {{URUN_ACIKLAMASI}} Paket için {{KREDI}} kredi; daha önce başlatılmış
bir abonelikte her ay {{AYLIK_KREDI}} kredi yüklemesi. Kredi yalnız Kazuist'in yapay zekâ işlemlerinde kullanılır;
Kazuist'in bütün özellikleri kredisiz de ücretsiz açıktır. Hizmet elektronik ortamda kazuist.com üzerinden sunulur.

## 3. Fiyat

Toplam bedel (KDV dahil): {{TUTAR_TL}} TL. Kupon indirimi: {{INDIRIM}}. Ödeme dönemi: {{ODEME_DONEMI}}.
Ek ücret yoktur.

## 4. Ödeme ve ifa

Ödeme iyzico ödeme formuyla (3D Secure) banka kartı veya kredi kartıyla alınır; kart bilgisi Kazuist'e gelmez.
Krediler ödeme doğrulandıktan sonra hesabınıza anında yüklenir.

## 5. Sözleşmenin kurulması ve kayıtlar

1. Ödeme sayfasında seçtiğiniz ürünü ve toplam bedeli görürsünüz.
2. Bu formu ve mesafeli satış sözleşmesini okuyup onay kutularını işaretlersiniz.
3. iyzico ödeme formunda kart bilgilerinizi girer, bankanızın 3D Secure doğrulamasını tamamlarsınız.
4. Ödeme sunucumuzca doğrulanınca sipariş teyit edilir ve onayladığınız metinler e-postanıza gönderilir.

Veri girişi hataları: ödemeyi başlatmadan önce ürün ve tutarı bu sayfada görürsünüz; yanlışsa sayfadan çıkıp
ürünü yeniden seçebilirsiniz. Kart bilgilerindeki hatalar iyzico formunda düzeltilir.

Sözleşme metni: onayladığınız form ve sözleşme sipariş anındaki hâliyle saklanır ve PDF olarak e-postanıza
gönderilir. Bir kopyasını teknoloji@kulular.com adresinden isteyebilirsiniz. Kişisel verileriniz
[aydınlatma metnine](https://kazuist.com/hukuki/aydinlatma) ve
[gizlilik politikasına](https://kazuist.com/hukuki/gizlilik) göre işlenir.

## 6. Cayma hakkı

Hizmet sözleşmelerinde cayma süresi sözleşmenin kurulduğu günden itibaren 14 gündür (Mesafeli Sözleşmeler
Yön. m.9). Elektronik ortamda anında ifa edilen hizmetlerde ve tüketicinin onayıyla cayma süresi içinde
ifasına başlanan hizmetlerde cayma hakkı kullanılamaz (m.15/1-ğ ve h).

Kazuist'in uygulaması: kredi paketinden 14 gün içinde hiç kredi kullanmadıysanız tam iade yapılır. İlk kredi
kullanımıyla ifa başlar ve cayma hakkınız sona erer. Bunu ayrı kutuyla onaylarsınız:

[ ] "Kredi kullanmaya başladığımda hizmetin ifasının başlayacağını ve cayma hakkımı kaybedeceğimi kabul ediyorum." (consent_kind: cayma_istisnasi)

Cayma bildirimi: hesabınızda kayıtlı e-posta adresinizden teknoloji@kulular.com adresine yazmanız yeterlidir. İade, aynı ödeme aracına,
tek seferde ve masrafsız olarak, cayma bildiriminin bize ulaştığı tarihten itibaren 14 gün içinde yapılır
(Mesafeli Sözleşmeler Yön. m.12/3 ve 12/4, RG 23/8/2022, 31932 ile değişik).

## 7. Abonelik

Kazuist yeni abonelik satmaz. Daha önce başlatılmış bir abonelik hesap sayfasından tek adımda feshedilir. Kurallar:
[İade, iptal ve kredi kuralları](https://kazuist.com/hukuki/iade-ve-kredi).

## 8. Şikâyet ve uyuşmazlık

Şikâyetler teknoloji@kulular.com adresine iletilebilir. Değeri yürürlükteki parasal sınırın altındaki uyuşmazlıklarda
tüketici hakem heyetine başvuru zorunludur (6502 sayılı Kanun m.68/1); sınırın üzerindeki uyuşmazlıklarda
tüketici mahkemesi görevlidir (m.73) ve dava açılmadan önce arabulucuya başvurulmuş olması dava şartıdır
(m.73/A). Parasal sınır her yıl yeniden değerlenir; güncel tutar Ticaret Bakanlığı duyurusundan izlenir. Tüketici hakem heyetine başvuru
e-Devlet kapısı üzerinden Tüketici Bilgi Sistemi (TÜBİS) ile de yapılabilir.

## 9. Teknik

Hizmetin çalışması için güncel bir web tarayıcısı gerekir. Kazuist iOS uygulamasından yapılan satın alımlar Apple
üzerinden yürür ve bu formun konusu değildir.
