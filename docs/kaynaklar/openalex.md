---
kaynak: openalex
alan_adlari: [api.openalex.org]
hiz_rps: 0.5
lisans_dayanagi: "CC0 (OpenAlex verisi)"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# OpenAlex

Plan 6.1: künye, özet, atıf sayısı; resmî API; haftalık. Yalnız DOI ile tekil kayıt sorgusu yapılır (ücretsiz; plan
6.1 fiyat notu: tekil kayıt ücretsiz). Tarık onayı: bekliyor.

## Kullanım koşulları ve lisans

OpenAlex verisi CC0'dır (plan 6.1). API kullanım ve oran sınırı sayfası (help.openalex.org, 2026-10-19 okundu):
anahtarsız 10 istek/sn, ücretsiz anahtarla 30 istek/sn; aşımda 429. Kendi hız sınırımız 0,5 istek/sn, bunun çok altında.
Anahtar `Authorization: Bearer` başlığıyla gider (URL'e yazılmaz, günlüğe düşmez) ve `OPENALEX_API_KEY` ortam
değişkeninden okunur; değer depoda tutulmaz.

## robots.txt (2026-10-19, HTTP 200)

`User-agent: *` / `Allow: /`. Engel yok.

## Anahtar durumu

Bu çalışmada `~/Desktop/kazuist-openalex.txt` yoktu; fikstür anahtarsız tek kayıt sorgusuyla alındı (1 istek, robots
dahil 2). Üretimde anahtar Coolify secret değişkenine `OPENALEX_API_KEY` olarak konur.

## Tarık'tan

1. https://openalex.org adresinde hesap açıp API anahtarı sayfasından ücretsiz anahtar oluşturmak (resmî belge:
   https://help.openalex.org/api-reference/authentication; eski adres developers.openalex.org buraya yönleniyor).
2. Anahtarı `~/Desktop/kazuist-openalex.txt` dosyasına `OPENALEX_API_KEY=...` olarak kaydetmek (sohbete yazmadan).
3. Bu dosyada `tarik_onayi: onaylandi`.
