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

- Bağlayıcı `https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=<no>&MevzuatTur=<tür>&MevzuatTertip=<tertip>` adresini çeker.
  Bu adres ve sayfanın düz metin düzeni bu ağdan DOĞRULANMADI. Ayrıştırıcı düz metindeki "MADDE n -", "Ek Madde",
  "Geçici Madde" başlıklarına ve "(Değişik: g/a/yyyy-NNNN/n md.)" notlarına göre çalışır; test fikstürü bu yüzden
  SENTETİK bir kanun metnidir (gerçek bir kanundan alınmadı). Canlı düzen farklıysa yalnız `html_to_text` ve
  `parse_articles` uyarlanır.
- Sürüm anlık görüntüsü: madde metni değişince eski sürüm `validTo = yeni validFrom - 1 gün` ile kapanır. Geriye dönük
  sürüm zinciri (RG değişiklik kanunlarından) bu bağlayıcıda kurulmaz, editör onaylı ayrı iştir (plan 6.6).

## Tarık'tan

Üretim öncesi: kullanım bildirimi metni okunup hukuk-uyum ajanına verilmeli; Tarık bu dosyada `tarik_onayi: onaylandi`
yapılmasını açıkça onaylamalı; canlı düzen bir ağdan doğrulanmalı.
