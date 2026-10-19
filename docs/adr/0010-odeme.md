# ADR-0010: Ödeme: web'de iyzico, iOS'ta StoreKit 2, tek defter

- Tarih: 2026-10-19
- Karar kodu: K-10 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Şirket adına yerli ödeme kuruluşu gerekiyor; kart verisi Kazuist'te tutulmamalı.

## Karar

Defter çift taraflıdır ve değiştirilemez; düzeltme ters kayıtla yapılır. Webhook olayları (provider, event_id) tekil anahtarıyla bir kez işlenir; istemci isteklerinde Idempotency-Key başlığı zorunludur. PayTR yedek bağdaştırıcı ADR ile etkinleşir.

## Gerekçe

Kart verisi yalnız iyzico'dadır. Aynı olay iki kez işlenmez.

## Sonuçlar

- İstek idempotency'si işlem düzeyindedir: ledger_transactions.idempotency_key tekildir; bir harcama birden çok partiye (promosyon ve paket) ve hesaba yayılabilir. Satır düzeyinde (idempotency_key, account_id, side) tekil dizini iki partili harcamayı reddettiği için kaldırıldı; dizine lot_id eklemek de seçilmedi, çünkü aynı isteğin farklı parti dağılımıyla ikinci kez yazılmasını engellemez (denetim bulgusu Y1).
- ledger_entries tablosunda UPDATE, DELETE ve TRUNCATE tetikleyiciyle engellidir; her işlem kayıt anında (ertelenmiş kısıt tetikleyicisi) borç ve alacak eşitliğiyle denetlenir; PGlite testi bunu doğrular.
- webhook_events, idempotency_keys, payments, iap_transactions, orders tabloları tekil anahtarlar taşır.
- Kabul senaryoları plan 9.5'tedir.

## Durum

Önerildi, Tarık onayı bekliyor.
