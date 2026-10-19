# ADR-0007: YZ: sağlayıcıdan bağımsız geçit, platformda Claude Haiku 5.5 ve Sonnet 5.5

- Tarih: 2026-10-19
- Karar kodu: K-07 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

Maliyet hedefi model maliyetinin net kredi gelirinin %35'ini aşmamasıdır (plan 4.4). Anthropic DPA'sı KVKK mekanizması içermiyor.

## Karar

Geçit; sağlayıcı bağdaştırıcıları, kişisel veri temizleyici (plan 8.5), bütçe koruyucu ve meta veri loglamasından oluşur. Model yönlendirme plan 8.6 tablosundadır. İçerik loglanmaz.

## Gerekçe

Sağlayıcı değişimi veya kapatma anahtarı kod değişikliği gerektirmez. Kişisel veri gönderilmediği için aktarım riski en aza iner.

## Sonuçlar

- provider_costs tablosu günlük maliyeti işlem ve model bazında tutar.
- Haiku 5.5'te 100 bin token eşiğinin altında kalınır.
- Enjeksiyon test seti CI'da çalışır (plan 8.7/5).

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
