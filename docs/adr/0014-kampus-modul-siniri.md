# ADR-0014: Turkuaz Kampüs: tek alan adı, ayrı şema ve API öneki

- Tarih: 2026-10-19
- Karar kodu: K-14 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026). ADR-0031 ile değişti (6 Kasım 2026): Turkuaz Kampüs kapsam dışı, K-14 kaldırıldı; `kampus` şeması, /v1/kampus öneki ve iş türleri kullanım dışıdır, kaldırılmaları sözleşme temizliğindedir.

## Bağlam

İlk yıl tek alan adı soğuk başlangıcı azaltır; ileride ayrı ürün hattına ayrılabilmelidir.

## Karar

kampus.profiles, posts, files, follows, summaries, posters, fulltext_requests, reports tabloları kampus şemasındadır; yalnız users tablosuna dış anahtar verir. feature_flags'te kampus bayrağı vardır.

## Gerekçe

Modül sınırı veri ve API düzeyinde nettir; ayrılma maliyeti düşüktür.

## Sonuçlar

- Kampüs dosyaları yükleme hattından geçer (plan 5.6/4).
- kampus.summarize ve kampus.poster iş türleri sözleşmededir.

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).

ADR-0031 ile değişti (6 Kasım 2026): Turkuaz Kampüs kapsam dışı, K-14 kaldırıldı; `kampus` şeması, /v1/kampus öneki ve iş türleri kullanım dışıdır, kaldırılmaları sözleşme temizliğindedir.
