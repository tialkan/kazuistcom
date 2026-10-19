# ADR-0006: Arama: PostgreSQL içinde hibrit getirme

- Tarih: 2026-10-19
- Karar kodu: K-06 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

Arama p95 hedefi 1,5 sn'dir. Ayrı arama motoru ikinci bir veri deposu, eşitleme ve yedek demektir.

## Karar

chunks tablosunda 'turkish' yapılandırmasıyla üretilen tsvector (GIN) ve halfvec(1024) embedding (HNSW, kosinüs) tutulur; records başlığı ayrıca tsvector ile dizinlenir; esas numarası pg_trgm ile aranır. Kimlik eşleşmesi ilk sıraya alınır, tam metin ve vektör ilk 100 RRF (k=60) ile birleştirilir (plan 7.2).

## Gerekçe

Tek veri tabanı, tek yedek. halfvec bellek ve disk kullanımını yarıya indirir.

## Sonuçlar

- İlk migration vector ve pg_trgm uzantılarını kurar; PGlite testi 'turkish' yapılandırmasının ve halfvec(1024) sütununun varlığını doğrular.
- Embedding modeli eval/embed ölçümüyle seçilir; boyut 1024'ten farklı çıkarsa şema değişikliği ADR ister.
- Yeniden sıralayıcı yalnız ölçüm iyileşme gösterirse ADR ile eklenir.

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
