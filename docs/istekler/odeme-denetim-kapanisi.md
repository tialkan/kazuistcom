# odeme: denetim kapanışı için sözleşme ve komşu modül istekleri

1. İsteyen: odeme ajanı, dal `dalga-1/odeme/denetim`. Dayanak: `docs/denetim/defter-odeme.md`.

## mimar (packages/db, packages/contracts)

- D6: `ledger_transactions` için `ledger_entries` gibi UPDATE, DELETE ve TRUNCATE engelleyen tetikleyici
  (repro-pg.mts E). `credit_lots.remaining_credits` değişebilir kalmalı; diğer sütunlar için de değişmezlik
  tetikleyicisi önerilir (yalnız `remaining_credits` güncellenebilir).
- D4: `products` sürümlenmiyor (`code` tekil, fiyat tablosu değişince satır üzerine yazılıyor). Öneri:
  `(code, price_table_id)` tekil ve siparişte `product_id` o sürümü göstersin. Bu dalda yıllık iade, dönemin
  başındaki fiyat tablosundan hesaplanıyor (kod içi `PRICE_TABLE_V1` sürümleri).
- D3: `POST /v1/subscriptions/{id}/cancel` ve `POST /v1/refund-requests` için `Idempotency-Key` başlığı
  OpenAPI'de zorunlu yazılmalı (sunucu bu dalda zorunlu tutuyor). `refund-requests` için 202 (onay bekliyor)
  yanıtı ve gövdesi `{ id, status: bekliyor | tamamlandi, amountKurus }` eklenmeli.
- O5: abonelik girdisine `withdrawalWaiver` ve `annualCommitmentVersion`
  (`docs/istekler/odeme-abonelik-onay-alanlari.md`, açık). Servis alanı alırsa `cayma_istisnasi` yazıyor.
- Y5: `NotifyPayload.type` için ödeme alt türleri (`odeme_7_gun`, `yillik_30_gun`, `odeme_basarisiz`,
  `plan_ucretsize_indi`, `fiyat_degisikligi`, `sozlesme`). Şimdilik hepsi `odeme`, ayrım `refId`
  önekindedir (`<tur>:<ref>`).
- D8: uçlar `POST /v1/coupons/redeem` (kullanıcı), `POST /v1/admin/chargebacks`, `POST /v1/admin/price-changes`
  (yönetici). Servis yöntemleri hazır: `redeemCoupon`, `chargeback`, `announcePriceChange`.

## kimlik

- D8: kayıt tamamlanınca `BillingService.grantSignupPromo(userId)` çağrısı (50 promosyon kredisi, 90 gün,
  kullanıcı başına bir kez; anahtar `kayit:<userId>`).
- O9: hesap silmede (`DELETE /v1/me` ya da `account.purge`) `BillingService.onAccountDeletion(userId)`
  çağrısı: abonelikler iyzico'da iptal edilir, kullanılmamış satın alınmış kredi varsa `refund_requests`
  satırı (`hesap_silme`) yönetim onayına düşer.
- Chargeback ve iade onayı yönetim uçları kimliğin admin iskeletine (`withAuth({ admin: true })`) bağlanacak.

## hukuk-uyum

- O6: ön bilgilendirme formu ve sözleşmenin PDF olarak kalıcı veri saklayıcısında e-postayla gönderimi. Bu
  dalda her checkout'ta `sozlesme` bildirimi kuyruğa giriyor; PDF üretimi ve e-posta metni metinler
  onaylanınca bağlanacak.

## Sonuç (mimar, 2026-10-25, dal dalga-1/mimar/istekler-2)

mimar maddeleri:
- D6: Kabul. Migration 0004 `ledger_transactions` için UPDATE, DELETE ve TRUNCATE engeli; `credit_lots` silinemez,
  yalnız `remaining_credits` değişir (defterin upsert yazımıyla uyumlu). Test: packages/db/test/migration-0004.test.ts.
- D4: Değiştirerek kabul (iki adım). Bu migration `products (code, price_table_id)` tekil dizinini ekler; koda bağlı
  tekil kısıt, ödeme deposu sürüm satırlarına geçene kadar kalır (yoksa bugünkü `on conflict (code)` bozulur).
  Daraltma adımı odeme işi bittikten sonra ayrı migration.
- D3: Kabul. Fesih ve iade uçlarında zorunlu `Idempotency-Key`; iade 201 (hemen) veya 202 (onay bekliyor),
  gövde `RefundRequestResult`; fesih cevabı `CancelSubscriptionResult`.
- O5: Kabul (odeme-abonelik-onay-alanlari.md).
- Y5: Değiştirerek kabul. Yeni bildirim türü yerine `NotifyPayload.subtype` (`billingNoticeKinds`), yalnız
  `type: odeme` ile; tercihler tür başına kalır, `refId` öneki okunmaya devam eder. `notices.kind` CHECK.
- D8: Kabul. `POST /v1/coupons/redeem`, `POST /v1/admin/chargebacks`, `POST /v1/admin/price-changes` sözleşmede;
  route dosyaları odeme (`api/v1/coupons/**`, sahipliğe eklendi) ve kimlik (admin iskeleti).
kimlik ve hukuk-uyum maddeleri: kayıt ve silme kancaları bağlı (`apps/web/src/server/auth/context.ts`); yönetim
uçları ve PDF işleri mimar-yonlendirme-2-kimlik.md ve mimar-yonlendirme-2-on-yuz-hukuk-uyum.md.

Sözleşme v1.2; ADR-0026 Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md (ikinci tur).
