---
kaynak: crossref
alan_adlari: [api.crossref.org]
hiz_rps: 0.5
lisans_dayanagi: "Crossref üstveri (olgusal künye; Crossref kullanım şartları)"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# Crossref

Plan 6.1: DOI künyeleri, resmî REST API, haftalık. Yalnız tekil DOI sorgusu (`/works/<doi>`). Tarık onayı: bekliyor.

## Kullanım koşulları ve lisans

Crossref üstverisi API üzerinden herkese açıktır; bu çalışmada Crossref'in lisans ve kullanım metni okunmadı, olgusal
künye (yazar, başlık, DOI, yıl) için "Crossref kullanım şartları" dayanağı yazıldı ve DOĞRULANMADI. Üretimden önce
hukuk-uyum ajanı şartları teyit etmelidir. Kibar havuz (polite pool) için e-posta parametresi URL'e yazılmaz; yalnız
User-Agent'taki bot sayfası iletişim yolunu verir (gizlilik: kişisel veri sorgu dizesine girmez).

## robots.txt (2026-10-19)

`/robots.txt` HTTP 404 (JSON "route-not-found"): dosya yok, kısıtlama yok. API herkese açık makine arayüzüdür.

## Hız

0,5 istek/sn. Geliştirmede 2 istek (robots, tekil DOI 10.1038/nature12373).

## Tarık'tan

Onay: bu dosyada `tarik_onayi: onaylandi`.
