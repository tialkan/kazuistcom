# odeme: abonelik, sipariş ve defter alanları

1. İsteyen: odeme ajanı, dal `dalga-1/odeme/defter-ve-iyzico`.

2. Gerekçe: plan 4.5/8-10 (bildirim, fiyat değişikliği, 1-3-7 gün yeniden deneme), 9.2/1 (dönüşte token ile
   yeniden sorgulama), 9.2/5 (mutabakat), 9.4 (kupon kullanımı). Billing servisi şu an bu alanları bellekte
   tutuyor (`apps/web/src/server/billing/store.ts`); Postgres deposuna geçmek için sütunlar gerekiyor.

3. Önerilen değişiklik (packages/db, yeni migration, yıkıcı değil):
   - `orders`: `checkout_token text` (tekil, iyzico token), `provider_payment_id text`, `paid_at timestamptz`.
   - `subscriptions`: `price_kurus integer`, `last_payment_id text`, `first_failure_at timestamptz`,
     `failed_retries integer default 0`, `failed_order_ref text`, `pending_price_kurus integer`,
     `pending_price_effective_at timestamptz`.
   - `payments`: `kind text not null default 'odeme'` (`odeme` | `iade`), `subscription_id uuid null` ve
     `order_id` null olabilmeli (yenileme tahsilatında sipariş yok). Mevcut tekil dizin (provider,
     provider_payment_id) kısmi iadede aynı ödeme kimliğiyle ikinci satırı reddediyor; öneri:
     `(provider, provider_payment_id, kind, created_at)` veya ayrı `refunds` tablosu.
   - `coupon_redemptions (coupon_id, user_id, ledger_transaction_id, created_at)`, tekil (coupon_id, user_id).
   - `notices (user_id, kind, ref, send_at, sent_at)`, tekil (user_id, kind, ref): 7 ve 30 gün ile fiyat
     değişikliği bildirimlerinin zamanlaması; gönderimi kimlik ajanının notify.send işi yapar.
   - `ledger_transactions`: `wallet_id uuid null` (cüzdan hareket listesini tek sorguyla almak için; şu an
     kayıtlar üzerinden hesap kodu birleştirmesi yapılıyor).

4. Geriye uyumluluk: yalnız sütun ve tablo ekleme; `payments.order_id` için NOT NULL kaldırma. Veri yok.

5. Aciliyet: Dalga 1 testleri bellekte geçiyor; gerçek DB deposu (PgBillingStore) bu istek kabul edilince
   yazılacak. Defter (`packages/ledger/src/pg.ts`) mevcut şemayla çalışıyor ve PGlite testinden geçiyor.

## Orkestra için (paylaşılan dosyalar)

- `apps/web/package.json` ve `apps/worker-node/package.json`: `"@kazuist/ledger": "workspace:*"` eklendi
  (bu dalda); kilit dosyası güncel.
- `apps/worker-node/src/main.ts`: `billingHandlers(deps)` (`apps/worker-node/src/billing/jobs.ts`) kayda
  alınmalı; günlük zamanlama `enqueueDailyBillingSql` ile.
- `/api/v1/**` route dosyaları: `apps/web/src/server/billing/handlers.ts` işleyicileri kimlik ajanının oturum
  çözümü gelince bağlanacak (`api/v1/wallet`, `api/v1/prices`, `api/v1/checkout/*`, `api/v1/subscriptions`,
  `api/v1/refund-requests`, `api/v1/webhooks/iyzico`); bu yolların sahipliği sahiplik.md not 3'e göre
  netleştirilmeli.
