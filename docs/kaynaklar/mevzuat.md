---
kaynak: mevzuat
alan_adlari: [www.mevzuat.gov.tr, mevzuat.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî metin (FSEK m.31); Mevzuat Bilgi Sistemi"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# Mevzuat Bilgi Sistemi

Plan 6.1: yaklaşık 250 temel mevzuat madde düzeyinde, tüm başlıklar künye düzeyinde. Madde ayrıştırma ve değişiklikte
anlık görüntü (plan 6.6). Tarık onayı: bekliyor.

## Kullanım koşulları

- Ana sayfa altbilgisi "Tüm Hakları Saklıdır" der ve hizmetin bir "Gizlilik, Kullanım ve Telif Hakları" bildirimine
  göre sunulduğunu belirtir. Bildirimin tam metnine bu çalışmada ulaşılamadı. Otomatik erişim ve yeniden kullanım
  hakkında yazılı bir hüküm DOĞRULANMADI.
- Hukuki dayanak: kanun, kararname ve yönetmelik metinleri FSEK m.31 kapsamında telif konusu dışındadır (resmî metin).
  Sitenin derleme ve yerleşim emeği için ayrı bir koşul olabilir; hukuk-uyum ajanı ve Tarık onaylamadan üretimde açılmaz.

## robots.txt (2026-10-19)

- Bu geliştirme ağından `www.mevzuat.gov.tr` ve `mevzuat.gov.tr` 5 denemede de zaman aşımına uğradı (robots.txt ve bir
  kanun sayfası dahil); doğrudan bir yanıt alınamadı.
- İçerik, WebFetch aracıyla okundu (KazuistBot değil, özet olarak): tek grup `User-agent: Googlebot` ve yaklaşık 60
  `Noindex:` satırı (MevzuatMetin PDF yolları, `mevzuat?MevzuatNo=` ve `Metin.Aspx?MevzuatKod=` sorgu sayfaları,
  `anasayfa/MevzuatFihristDetayIframe` yolları). `*` için kısıtlama yok. `Noindex` standart bir yönerge değildir ve
  yalnız Googlebot grubundadır.
- Kod her çalıştırmada robots.txt'yi kendi User-Agent'ıyla okur; okunamazsa çekim reddedilir.

## Hız ve protokol

0,5 istek/sn, gece saatlerinde toplu iş. Protokol gerekmez. Toplu çekme yok: yalnız RG tetiklemeli madde yeniden çekimi ve
seçili temel mevzuat.

## Teknik durum ve doğrulanamayanlar

- Bağlayıcı metni `https://www.mevzuat.gov.tr/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=<tür>&MevzuatNo=<no>&MevzuatTertip=<tertip>`
  adresinden çeker (2026-11-15'te düzeltildi, aşağıya bakın); kayda yazılan ve kullanıcıya gösterilen `sourceUrl` ise
  `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=<no>&MevzuatTur=<tür>&MevzuatTertip=<tertip>` sayfasıdır. Ayrıştırıcı
  düz metindeki "MADDE n -", "Ek Madde", "Geçici Madde" başlıklarına ve "(Değişik: g/a/yyyy-NNNN/n md.)" notlarına göre
  çalışır; test fikstürleri SENTETİKTİR (gerçek bir kanundan alınmadı). Canlı düzen farklıysa yalnız `html_to_text` ve
  `parse_articles` uyarlanır.
- Sürüm anlık görüntüsü: madde metni değişince eski sürüm `validTo = yeni validFrom - 1 gün` ile kapanır. Geriye dönük
  sürüm zinciri (RG değişiklik kanunlarından) bu bağlayıcıda kurulmaz, editör onaylı ayrı iştir (plan 6.6).

## Yeniden doğrulama (2026-11-15)

- Erişim: `www.mevzuat.gov.tr` TLS el sıkışmasını tamamlıyor (sertifika `*.tccb.gov.tr`, TLS 1.2) ama HTTP isteğine
  20 sn içinde TEK BAYT cevap vermiyor. Üç farklı istemciyle denendi (curl, Python urllib ve elle yazılmış TLS soketi),
  `KazuistBot/1.0` ile. `core.cli probe mevzuat` robots.txt okunamadığı için çekimi reddetti (kural gereği güvenli yön).
  Bu, CAPTCHA veya insan denetimi değildir; sessiz bir düşürme (ağ, IP veya WAF). Nedeni belirlenemedi. Kimlik
  değiştirerek, vekil üzerinden veya başka bir ağdan aşma DENENMEDİ ve denenmeyecek. 19 Ekim'deki zaman aşımıyla aynı davranış.
- Bu yüzden ham baytlar bu ağdan hâlâ alınamadı. İçerik, bir okuma aracıyla (özetleyici, ham HTML değil) görüldü:
  `/mevzuat?MevzuatNo=6698&MevzuatTur=1&MevzuatTertip=5` sayfasında madde metni YOK (menü, altbilgi, RG tarihi 07.04.2016
  ve sayısı 29677, `MevzuatMetin/1.5.6698.doc` ve `.pdf` bağlantıları); `/anasayfa/MevzuatFihristDetayIframe?MevzuatTur=1&
  MevzuatNo=6698&MevzuatTertip=5` adresinde ise kanun metni VAR: kalın "MADDE 1-" etiketleri, kalın bölüm ve madde
  başlıkları, "(Değişik:2/3/2024-7499/33 md.)" biçiminde notlar ve dipnot işaretleri.
- Bulgu: önceki bağlayıcı sayfa adresini çekiyordu ve gerçek sayfada hiç madde bulamayıp `ParseError` verecekti.
  Düzeltme: metin iframe adresinden çekiliyor, `sourceUrl` sayfa adresi olarak kalıyor. Notların biçimi mevcut
  düzenli ifadeyle uyumlu (testle doğrulandı, SENTETİK kalın etiketli işaretleme). Gerçek baytlarla doğrulama AÇIK.
- robots.txt: Googlebot grubundaki `Noindex:` satırları arasında `anasayfa/MevzuatFihristDetayIframe` yolu da var (19 Ekim
  kaydı). `Noindex` standart bir yönerge değildir ve yalnız Googlebot grubundadır; kodun robots denetimi onu uygulamaz. Bu
  yolun tam da metnin durduğu yol olması nedeniyle Tarık onayından önce hukuk-uyum ajanı bu yorumu açıkça değerlendirmeli.
- Örnek kayıt sayısı: 0 (erişilemedi). Hata oranı: 1,0 (robots.txt okunamadı).

## Tarık'tan

Üretim öncesi: kullanım bildirimi metni okunup hukuk-uyum ajanına verilmeli; Tarık bu dosyada `tarik_onayi: onaylandi`
yapılmasını açıkça onaylamalı; canlı düzen bir ağdan doğrulanmalı.
