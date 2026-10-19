# ADR-0012: Veri edinimi: çekirdek dizin ve canlı resmî kaynak federasyonu

- Tarih: 2026-10-19
- Karar kodu: K-12 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

FSEK ek m.8 riski toplu çekmede yoğunlaşır; kullanıcı yine geniş kapsam görmek ister.

## Karar

records.licenseBasis ve protocolStatus her kayıtta tutulur; canlı gelen kayıt liveOnly ile işaretlenir; canlı sonuç live_cache'te süreli tutulur; getiriciler yalnız docs/kaynaklar listesindeki alan adlarına gider (SSRF koruması).

## Gerekçe

Hukuki risk sınırlanır, kapsam geniş kalır.

## Sonuçlar

- Canlı federasyon 1,2 sn zaman aşımıyla arama ile paralel çalışır (FR-83).
- live.fetch, ingest.fetch, ingest.parse iş türleri sözleşmededir.

## Durum

Önerildi, Tarık onayı bekliyor.
