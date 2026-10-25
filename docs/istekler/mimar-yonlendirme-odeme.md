# Yönlendirme: odeme ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: odeme. Dayanak: ADR-0023, istekler
`odeme-abonelik-ve-siparis-alanlari.md`, `hukuk-uyum-consent-turleri.md`, `hukuk-uyum-urun-tutarliligi.md`
(madde 2).

## İşler

1. PgBillingStore: migration 0003 sütunları ve tabloları hazır.
   - `orders.checkout_token` (tekil, NULL olabilir), `provider_payment_id`, `paid_at`.
   - `subscriptions.price_kurus`, `last_payment_id`, `first_failure_at`, `failed_retries`, `failed_order_ref`,
     `pending_price_kurus`, `pending_price_effective_at`.
   - `payments.kind` (odeme, iade), `subscription_id`, `refund_ref`; `order_id` NULL olabilir ama sipariş ya da
     abonelikten biri zorunlu. Tahsilat (provider, provider_payment_id) tekildir; iade satırında `refund_ref`
     zorunludur ve (provider, refund_ref) tekildir. Kısmi iadeler aynı `provider_payment_id` ile ayrı
     `refund_ref` değerleriyle yazılır. İstekteki `(provider, provider_payment_id, kind, created_at)` dizini
     iade idempotency'sini kaldırdığı için seçilmedi.
   - `coupon_redemptions` (kupon ve kullanıcı başına tek; kredi kuponu `ledger_transaction_id`, indirim
     `order_id`), `notices` ((user_id, kind, ref) tekil; gönderim notify.send ile), `ledger_transactions.wallet_id`
     (`packages/ledger/src/pg.ts` cüzdan işlemlerinde yazmalı).
2. worker-node: `apps/worker-node/src/handlers.ts` içindeki `unavailableBilling` yerine gerçek
   `BillingJobsDeps` (öneri: `apps/worker-node/src/billing/deps.ts`, sizin yolunuz). Hazır olduğunda
   orkestra `main.ts` içinde değiştirir ve `dailyBillingTick` zamanlamasını açar. O zamana kadar billing işleri
   `BillingStoreUnavailable` hatasıyla kapalı başarısız olur (sessizce kuyrukta beklemez).
3. Rıza türleri: abonelik adımında `abonelik_sozlesmesi`, yıllık planda ayrıca `yillik_taahhutname`; paket
   alımında `mesafeli_sozlesme`. `context` için `ConsentContext` (`orderId`, `subscriptionId`, `productCode`).
4. Abonelikte cayma (hukuk-uyum madde 2): ilk dönem kredisi hiç kullanılmamışsa ne olacağı Tarık kararıdır;
   karar gelene kadar cayma istisnası onay kutusu abonelik adımında da gösterilsin (metin hukuk-uyum'dan).
5. `/api/v1` ödeme yolları (`wallet`, `prices`, `checkout`, `subscriptions`, `refund-requests`, `invoices`,
   `webhooks`) sahiplik tablosunda size verildi.

## Aciliyet

1 ve 2: Dalga 2 başında; 3 ve 4: canlı ödeme anahtarından önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ları: #15 (Postgres faturalama deposu ve uçlar), #19 ve #27 (denetim kapanışı); billing kaydı #17. Madde bazında doğrulama kalite-guvenlik kapısındadır.
