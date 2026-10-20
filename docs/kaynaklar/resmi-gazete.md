---
kaynak: resmi-gazete
alan_adlari: [www.resmigazete.gov.tr, resmigazete.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî metin (FSEK m.31); Resmî Gazete fihristi"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# Resmî Gazete fihristi

Plan 6.1: günlük fihrist ayrıştırma; etkilenen mevzuatı yeniden çekme tetikleyicisi. Tarık onayı: bekliyor.

## Kullanım koşulları

Kullanım koşulları sayfası bu çalışmada okunmadı; DOĞRULANMADI. Metinler resmî metindir (FSEK m.31). Fihristin kendisi
yalnız başlık ve bağlantı listesidir; kayıt olarak depolanmaz, yalnız ham HTML arşivlenir ve mevzuat yeniden çekimini
tetikler. Üretimden önce hukuk-uyum ajanı koşulları incelemelidir.

## robots.txt (2026-10-19, HTTP 200)

Dört grup: `Googlebot`, `Bingbot`, `Slurp`, `Yandex`. Her birinde yalnız `Noindex:` satırları (eski PDF ve ilan yolları).
`User-agent: *` grubu yoktur, `Disallow` yoktur: KazuistBot için kısıtlama yok. Otomatik çekime engel yok.

## Hız ve protokol

0,5 istek/sn. Protokol gerekmez. Günde bir fihrist sayfası (`/eskiler/YYYY/MM/YYYYMMDD.htm`); toplu arşiv taraması yok.

## Teknik durum

Sayfa windows-1254 kodlu eski bir HTML'dir; bölümler (YASAMA, YÜRÜTME VE İDARE, YARGI, İLÂN) ve kategoriler (kalın ve
altı çizili başlıklar) ile girdi bağlantıları (`YYYYMMDD-N.htm|pdf`) ayrıştırılır. Fikstür: 16 Ekim 2026 sayısı
(33402), 55 girdi. Geliştirmede 2 istek yapıldı (robots.txt, ana sayfa; ek olarak fikstür sayfası).

## Tarık'tan

Onay: bu dosyada `tarik_onayi: onaylandi`.
