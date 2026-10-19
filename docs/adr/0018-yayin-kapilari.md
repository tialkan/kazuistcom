# ADR-0018: Yayın kapıları

- Tarih: 2026-10-19
- Karar kodu: K-18 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Eski projelerde ölçümsüz yayın sorun çıkardı.

## Karar

Her PR'da CI (typecheck, lint, test, sözleşme lint, uzun çizgi taraması, gitleaks, i18n eşitliği, pytest) çalışır; dalga ve yayın kapıları plan 15'tedir. Kapıyı kalite-guvenlik raporu kapatır.

## Gerekçe

Doğrulanmamış iş tamamlandı sayılmaz.

## Sonuçlar

- Dalga 0 CI iskeleti .github/workflows/ci.yml'dedir; altyapi ajanı genişletir.
- eval_runs tablosu ölçüm sonuçlarını tutar.

## Durum

Önerildi, Tarık onayı bekliyor.
