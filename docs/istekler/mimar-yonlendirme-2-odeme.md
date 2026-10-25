# Yönlendirme (ikinci tur): odeme ajanına işler (sözleşme v1.2)

Kimden: mimar, dal `dalga-1/mimar/istekler-2`. Kime: odeme. Dayanak: ADR-0024 (güncel), ADR-0026, istekler
`odeme-abonelik-onay-alanlari.md`, `odeme-denetim-kapanisi.md`, `odeme-denetim-2.md`.

## Hazır olanlar

- Migration 0004: `ledger_transactions` değiştirilemez; `credit_lots` yalnız `remaining_credits` ile güncellenir;
  `products (code, price_table_id)` tekil; `payments.status` ve `notices.kind` CHECK (NOT VALID). Defter testleri
  101/101 geçti.
- Sözleşme: `CheckoutSubscriptionInput.withdrawalWaiver` ve `annualCommitmentVersion`; fesih ve iade uçlarında
  zorunlu `Idempotency-Key`; iade 201 veya 202 ve `RefundRequestResult`; dönüş uçları, IFN, kupon, ters ibraz,
  fiyat değişikliği ve bekleyen iade uçları OpenAPI'de.

## İşler

1. Abonelik: `annualCommitmentVersion` yıllık planda zorunlu olsun ve `yillik_taahhutname` bu sürümle yazılsın
   (bugün `distanceContractConsentVersion` kullanılıyor). `withdrawalWaiver` alındığında `cayma_istisnasi`
   yazımı zaten var.
2. D4 daraltma adımı: `ensureCatalog` `on conflict (code, price_table_id)` ile sürüm satırı yazsın; sipariş ve
   abonelik eklemeleri ürünü kod ve fiyat tablosu sürümüyle bulsun; `iyzico_plan_ref` sürüm satırında. Depo
   artık koda bağlı tekilliğe dayanmayınca mimara istek yazın: ayrı migration `products_code_unique`'i kaldırır.
3. Bildirim alt türü: `apps/worker-node/src/billing/notices.ts` `dispatchDueNoticesSql`, `fesih_teyidi` dışındaki
   satırlarda payload'a `'subtype', due.kind` eklesin; `refId` yalnız ref'i taşıyabilir (önekli biçim okunmaya
   devam eder).
4. D8 ve O-N1 route dosyaları: `POST /v1/coupons/redeem` (`redeemCoupon`, sizin `api/v1/coupons/**` yolunuz;
   sahiplik tablosuna eklendi). Yönetim uçları kimliğin admin iskeletinde (kimlik yönlendirmesi).
5. `payments.status` değerleri dışında bir durum yazılmamalı; staging verisi denetlendikten sonra mimar
   VALIDATE migration'ını yazar.
