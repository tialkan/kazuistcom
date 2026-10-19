# ADR-0009: Gelir modeli: ücretsiz, BYOK, süresiz kredi, kredi yükleyen abonelik

- Tarih: 2026-10-19
- Karar kodu: K-09 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

Apple 3.1.1 IAP kredilerinin süresinin dolmasını yasaklıyor. İki platformda tek kural sadelik sağlar.

## Karar

Satın alınan kredinin süresi dolmaz; promosyon kredisi 90 gün geçerlidir. Planlar ve paketler plan 4.2 ve 4.3'tedir; fiyatlar Tarık onayıyla kesinleşir.

## Gerekçe

Kullanıcıya tek ve anlaşılır kural; iOS ve web arasında bakiye eşitliği.

## Sonuçlar

- credit_lots tablosunda yalnız promosyon partisinin son kullanma tarihi olabilir (CHECK kısıtı).
- Fiyat tabloları yürürlük tarihli sürümlerdir (price_tables).

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
