# ADR-0002: URL düzeni: Türkçe ürün kökte, mevcut 22 adres korunur

- Tarih: 2026-10-19
- Karar kodu: K-02 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026). ADR-0032 ile değişti (7 Kasım 2026): eski İngilizce Casuist sayfaları ve /en yönlendirmesiz kaldırıldı, 404 döner; Türkçe Casuist sayfaları (/tr ve altı) ve beş Türkçe hukuki 301 geçerli.

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

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).

ADR-0032 ile değişti (7 Kasım 2026): eski İngilizce Casuist sayfaları ve /en yönlendirmesiz kaldırıldı, 404 döner; Türkçe Casuist sayfaları (/tr ve altı) ve beş Türkçe hukuki 301 geçerli.
