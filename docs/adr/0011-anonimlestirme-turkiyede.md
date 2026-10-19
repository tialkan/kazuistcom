# ADR-0011: Anonimleştirme Türkiye'deki sunucuda

- Tarih: 2026-10-19
- Karar kodu: K-11 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

KVKK m.4 ve m.9 ile SRS 10.2 kişisel verinin korunmasını ve aktarım sınırını istiyor.

## Karar

services/worker-py/anonymizer anon.run işiyle çalışır; tespitler anonymization_spans tablosuna politika sürümüyle yazılır; belirsiz durumlar review_queue (anonymization) kuyruğuna gider.

## Gerekçe

Dış YZ sağlayıcısı yalnız anonim corpus görür.

## Sonuçlar

- records.anonymized ve records.anonymizationVersion alanları zorunlu izlenir.
- Politika değişince corpus yeniden işlenir ve fark raporu tutulur.

## Durum

Önerildi, Tarık onayı bekliyor.
