---
title: Ön bilgilendirme formu
slug: on-bilgilendirme
route: /hukuki/on-bilgilendirme
lang: tr
binding: true
version: 2026-10-19.1
date: 2026-10-19
status: taslak
consent_kind: on_bilgilendirme
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 19 Ekim 2026.

Gösterim kuralları (odeme ajanı için): Bu form ödeme yükümlülüğü altına girmeden hemen önce, en az 12 punto
eşdeğerinde ve okunaklı gösterilir (Mesafeli Sözleşmeler Yön. m.6). "Ön bilgilendirme formunu okudum ve
onaylıyorum" kutusu işaretlenmeden ödeme düğmesi açılmaz; teyit sağlanmazsa sözleşme kurulmamış sayılır
(m.7). Form ve sözleşme PDF olarak e-postayla kalıcı veri saklayıcısında gönderilir. `{{...}}` alanları
sipariş anında sunucu tarafından doldurulur.

## 1. Satıcı

Unvan: Kulular Bilişim Teknolojileri Ltd. Şti. MERSİS: {{MERSIS}}. Adres: {{ADRES}}. Telefon: {{TELEFON}}.
E-posta: {{DESTEK_EPOSTA}}. KEP: {{KEP}}.

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

Cayma bildirimi: hesap sayfasındaki iade talebi bağlantısı veya {{DESTEK_EPOSTA}}. İade, aynı ödeme aracına
14 gün içinde yapılır [DOĞRULANACAK: Mesafeli Sözleşmeler Yön. iade süresi maddesi].

## 6. Abonelik ve fesih

Abonelik belirsiz sürelidir; hesap sayfasından tek adımda fesih edilir. Kurallar:
[İade, iptal ve kredi kuralları](/hukuki/iade-ve-kredi).

## 7. Şikâyet ve uyuşmazlık

Şikâyetler {{DESTEK_EPOSTA}} adresine iletilebilir. Uyuşmazlıklarda Ticaret Bakanlığı'nca her yıl ilan edilen
parasal sınırlar içinde tüketicinin yerleşim yerindeki veya işlemin yapıldığı yerdeki tüketici hakem
heyetine, sınırın üzerinde tüketici mahkemesine başvurulabilir [DOĞRULANACAK: 6502 sayılı Kanun m.68 ve m.73
güncel metni; arabuluculuk şartı]. Başvuru e-Devlet üzerinden Tüketici Bilgi Sistemi'yle de yapılabilir
[DOĞRULANACAK: https://tuketici.ticaret.gov.tr].

## 8. Teknik

Hizmetin çalışması için güncel bir tarayıcı veya iOS {{IOS_SURUM}} ve üzeri gerekir.
