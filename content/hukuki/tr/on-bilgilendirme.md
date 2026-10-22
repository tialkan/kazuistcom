---
title: Ön bilgilendirme formu
slug: on-bilgilendirme
route: /hukuki/on-bilgilendirme
lang: tr
binding: true
version: 2026-10-22.1
date: 2026-10-22
status: taslak
consent_kind: on_bilgilendirme
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 22 Ekim 2026.

Gösterim kuralları (odeme ajanı için): Bu form ödeme yükümlülüğü altına girmeden hemen önce, en az 12 punto
eşdeğerinde ve okunaklı gösterilir (Mesafeli Sözleşmeler Yön. m.6). "Ön bilgilendirme formunu okudum ve
onaylıyorum" kutusu işaretlenmeden ödeme düğmesi açılmaz; teyit sağlanmazsa sözleşme kurulmamış sayılır
(m.7). Form ve sözleşme PDF olarak e-postayla kalıcı veri saklayıcısında gönderilir. `{{...}}` alanları
sipariş anında sunucu tarafından doldurulur.

## 1. Satıcı

Unvan: Kulular Bilişim Teknolojileri Ltd. Şti. MERSİS: 0591095454600001. Adres: Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara. Telefon: {{TELEFON}}.
E-posta: kulularteknoloji@gmail.com. KEP: {{KEP}}.

## 2. Hizmetin temel nitelikleri

Ürün: {{URUN_ADI}} ({{URUN_TURU}}: kredi paketi veya abonelik). İçerik: {{URUN_ACIKLAMASI}}; paket için
{{KREDI}} kredi, abonelik için her ay {{AYLIK_KREDI}} kredi yüklemesi ve plan özellikleri. Hizmet
elektronik ortamda kazuist.com ve iOS uygulaması üzerinden sunulur.

## 3. Fiyat

Toplam bedel (KDV dahil): {{TUTAR_TL}} TL. Kupon indirimi: {{INDIRIM}}. Abonelikte bu bedel her
{{ODEME_DONEMI}} tahsil edilir. Ek ücret yoktur.

## 4. Ödeme ve ifa

Ödeme iyzico ödeme formuyla (3D Secure) banka kartı veya kredi kartıyla alınır; kart bilgisi Kazuist'e gelmez.
Krediler ödeme doğrulandıktan sonra hesabınıza anında yüklenir.

## 5. Cayma hakkı

Hizmet sözleşmelerinde cayma süresi sözleşmenin kurulduğu günden itibaren 14 gündür (Mesafeli Sözleşmeler
Yön. m.9). Elektronik ortamda anında ifa edilen hizmetlerde ve tüketicinin onayıyla cayma süresi içinde
ifasına başlanan hizmetlerde cayma hakkı kullanılamaz (m.15/1-ğ ve h).

Kazuist'in uygulaması: kredi paketinden 14 gün içinde hiç kredi kullanmadıysanız tam iade yapılır. İlk kredi
kullanımıyla ifa başlar ve cayma hakkınız sona erer. Bunu ayrı kutuyla onaylarsınız:

[ ] "Kredi kullanmaya başladığımda hizmetin ifasının başlayacağını ve cayma hakkımı kaybedeceğimi kabul ediyorum." (consent_kind: cayma_istisnasi)

Cayma bildirimi: hesap sayfasındaki iade talebi bağlantısı veya kulularteknoloji@gmail.com. İade, aynı ödeme aracına,
tek seferde ve masrafsız olarak, cayma bildiriminin bize ulaştığı tarihten itibaren 14 gün içinde yapılır
(Mesafeli Sözleşmeler Yön. m.12/3 ve 12/4, RG 23/8/2022, 31932 ile değişik).

## 6. Abonelik ve fesih

Abonelik belirsiz sürelidir; hesap sayfasından tek adımda fesih edilir. Kurallar:
[İade, iptal ve kredi kuralları](https://kazuist.com/hukuki/iade-ve-kredi).

## 7. Şikâyet ve uyuşmazlık

Şikâyetler kulularteknoloji@gmail.com adresine iletilebilir. Değeri yürürlükteki parasal sınırın altındaki uyuşmazlıklarda
tüketici hakem heyetine başvuru zorunludur (6502 sayılı Kanun m.68/1); sınırın üzerindeki uyuşmazlıklarda
tüketici mahkemesi görevlidir (m.73) ve dava açılmadan önce arabulucuya başvurulmuş olması dava şartıdır
(m.73/A). Parasal sınır her yıl yeniden değerlenir; güncel tutar Ticaret Bakanlığı duyurusundan izlenir. Başvuru e-Devlet üzerinden Tüketici Bilgi Sistemi'yle de yapılabilir
[DOĞRULANACAK: başvuru adresi https://tuketici.ticaret.gov.tr, Ticaret Bakanlığı sitesinden].

## 8. Teknik

Hizmetin çalışması için güncel bir tarayıcı veya iOS {{IOS_SURUM}} ve üzeri gerekir.
