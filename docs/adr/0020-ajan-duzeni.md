# ADR-0020: Ajan düzeni: önce sözleşme, sonra yol sahipliğiyle paralel dalgalar

- Tarih: 2026-10-19
- Karar kodu: K-20 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Paralel ajanlar aynı dosyaya dokunursa birleştirme çakışır; sözleşme belirsizse modüller uyuşmaz.

## Karar

Yol sahipliği docs/sahiplik.md'de glob yollarıyla kesindir. Sözleşme (packages/contracts, packages/db) yalnız mimar ve ADR ile değişir; diğer ajanlar docs/istekler/<ajan>-<konu>.md yazar. Ortak dosyaları orkestra birleştirir. Aynı anda en fazla 8 ajan çalışır.

## Gerekçe

Çakışmasız birleşme ve hızlı paralel ilerleme.

## Sonuçlar

- Dal adı dalga-<n>/<ajan>/<konu>; her iş PR ile gelir.
- İlerleme docs/ilerleme.md'de, devir DEVIR.md'de tutulur.
- Dalga 0 çıkışında main'e contracts-v1 etiketi orkestra tarafından konur.

## Durum

Önerildi, Tarık onayı bekliyor.
