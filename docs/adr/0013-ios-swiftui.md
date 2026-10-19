# ADR-0013: iOS: yerel SwiftUI uygulaması, aynı API

- Tarih: 2026-10-19
- Karar kodu: K-13 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

Apple 4.2 paketlenmiş web sitesini reddediyor; sRepetition deneyimi yerel uygulamayı destekliyor.

## Karar

İstemci swift-openapi-generator ile packages/contracts/openapi.yaml'dan üretilir (openapi-generator-config.yaml). Kimlik bearer token ile, ödeme StoreKit 2 ile yapılır.

## Gerekçe

Tek sözleşme iki istemciyi besler; sözleşme değişikliği iki tarafta derleme hatasıyla görünür.

## Sonuçlar

- apps/ios ios ajanınındır; Dalga 2'de başlar.
- BYOK doğrulaması iOS'ta sunucuda yapılır (verify).

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
