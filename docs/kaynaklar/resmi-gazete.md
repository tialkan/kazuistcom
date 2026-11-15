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

## Yeniden doğrulama (2026-11-15)

- `www.resmigazete.gov.tr` bugün mevzuat.gov.tr ile aynı davranışı gösteriyor: TLS tamam (sertifika `*.tccb.gov.tr`), HTTP
  isteğine 20 sn içinde cevap yok (curl, Python urllib, elle TLS soketi; `KazuistBot/1.0`). 19 Ekim'de aynı kaynak cevap
  vermişti (robots.txt ve fihrist sayfası alındı). `core.cli probe resmi-gazete`: robots.txt okunamadığı için çekim
  reddedildi (güvenli yön), örnek kayıt 0, hata oranı 1,0. Bu bir CAPTCHA değil; nedeni belirlenemedi, aşma denenmedi.
- Başka bir ağdan bir okuma aracıyla (özetleyici, ham HTML değil) 14 Kasım 2026 sayısının fihristi görüldü: sayı 33430,
  bölümler YASAMA, YÜRÜTME VE İDARE, İLÂN; kategoriler KANUN (1), CUMHURBAŞKANI KARARLARI (13), YÖNETMELİKLER (2), GENELGE (1);
  girdi bağlantıları `20261114-N.htm|pdf` (N 1..17); tam sayı PDF'i `20261114.pdf`. Düzen 19 Ekim fikstürüyle uyumlu.
  Bulgu: "CUMHURBAŞKANI KARARLARI" kategorisi `MEVZUAT_CATEGORIES` içinde yok (listede "CUMHURBAŞKANLIĞI KARARNAMESİ" var);
  bazı Cumhurbaşkanı kararları yönetmelik ve ek kararları değiştirdiği için mevzuat tetiklemesine eklenip eklenmeyeceği
  editör kararıdır, bu çalışmada eklenmedi.
- Dolayısıyla ayrıştırıcı bugün canlı baytlara karşı yeniden doğrulanamadı. Elde olan doğrulama 19 Ekim fikstürüdür
  (33402 sayılı sayı, 55 girdi, windows-1254). Düzen değişikliği kontrolü için günlük ilk başarılı çekimde `ParseError`
  sayacı hata oranına girer (breaker) ve eşiği aşarsa kaynak durur.
- Zamanlayıcı fihristi 07:00'den sonra ister (sayı çıkmadan istenmesin diye); mevzuat da açık değilse çalışmaz.

## Tarık'tan

Onay: bu dosyada `tarik_onayi: onaylandi`.
