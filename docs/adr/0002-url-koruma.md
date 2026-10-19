# ADR-0002: URL düzeni: Türkçe ürün kökte, mevcut 22 adres korunur

- Tarih: 2026-10-19
- Karar kodu: K-02 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

kazuist.com'da Casuist ve Eurostars ortak çağrısı için yayımlanmış 22 adres ve /eski var. Eurostars çağrısı 4 Mart 2027'ye kadar açık; ortaklara gönderilen bağlantılar kırılmamalı.

## Karar

Ek H tablosu uygulanır: /problem, /how-it-works, /evaluation, /partner, /about, /legal/* ve /tr/* Casuist sayfaları 200 ile kalır; /tr/hukuki/* beş sayfa tek 301 ile /hukuki/* adreslerine gider; / Türkçe ürün ana sayfası olur; eski / içeriği /en'de yayımlanır; /eski noindex kalır. Otomatik dil yönlendirmesi yoktur.

## Gerekçe

Bağlantı kırılmadan ürün kökte açılır; yönlendirme zinciri tek adımdır; arama motoru sinyali korunur.

## Sonuçlar

- Rotalar 1.0'da dondurulur (plan 13.1).
- seo ajanı Ek H testini (WebLINKrobot, WebSEORobot) Dalga 1E kapısı yapar.
- Casuist metinleri değiştirilmez; yalnız künye ve hukuki bağlantılar güncellenir.

## Durum

Önerildi, Tarık onayı bekliyor.
