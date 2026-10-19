# ADR-0015: Tasarım: açık tema, özgün kimlik, kenar şerhi

- Tarih: 2026-10-19
- Karar kodu: K-15 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

webtasarim.md özgün tasarım ve tek vurgu rengi istiyor; tercih açık temadır.

## Karar

Tasarım belirteçleri packages/ui/src/tokens.css'te tek dosyadadır. Mimar belirteç adlarını sabitledi (--kz-*); değerleri on-yuz ajanı verir. Kenar şerhi için --kz-serh-* belirteçleri ayrıldı.

## Gerekçe

Bileşenler ad üzerinden bağlanır; değer değişikliği bileşenleri bozmaz.

## Sonuçlar

- Belirteç adları ile tokenNames listesinin eşitliği testle korunur.
- Bilgi yalnız renkle taşınmaz (plan 7.3).

## Durum

Önerildi, Tarık onayı bekliyor.
