# Silme iade yönetimi: sözleşme 1.4 ve migration0006

Mimar, 2026-10-27. Kaynak: ödeme 2246501 ve root ürün varsayılanı. ADR-0028 ÖNERİDİR.

## Hazır arayüz

- Refund request: mevcut alanlara `decision_reason/key/hash`; ilk kararda actor/time ile atomik.
- `refund_request_items`: istek2246501 sütunları + `updated_by` (NOT NULL UUID),
  `state_reason` (10..2000). Tüm finansal alanlar değişmez. İlk actor decided_by ile aynı olmalı.
- Item INSERT: talep önce onaylandi, başarılı iyzico tahsilat kaydı ve `order:<UUID>` kaynaklı
  paket lotu; lot.remaining_credits onay snapshot'ına eşit. full cap SQL'de de denetlenir.
  Order satırı kilitlenir; diğer kalem/payment exposure aynı refund_ref için iki kez düşülmez.
- Request decision -> item INSERT -> bound ledger hold/persist aynı transaction; INSERT'te henüz
  tutma uygulanmamıştır. Provider çağrısı transaction dışındadır.
- Kalem bekliyor -> basarili öncesi aynı provider_refund_ref/order/amount ile başarılı payments
  kaydı gerekir. Request tamamlandı toplamı item toplamı olmalı ve her item başarılı olmalı.
- SQL trigger mevcut audit_log'a karar ve state actor/reason yazar. Ayrı audit satırı eklemek
  uygulamanın ek bilgisini taşıyabilir; asıl olay trigger'da zaten kalıcıdır.

## DTO ve uçlar

`AdminRefundRequestDecisionInput {decision:onay|ret,reason}`;
`AdminRefundRequestExecuteInput {}`;
`AdminRefundRequestItemResolveInput {outcome:basarili|basarisiz,reason,providerResultRef?}`.
Aktör veya serbest tutar kabul edilmez. Reason trim sonrası10..2000.

- adminListRefundRequests: GET `/v1/admin/refund-requests`, status/cursor, sabit50;
  `{items:RefundRequestReview[],nextCursor:string|null}`.
- adminGetRefundRequest: GET `/v1/admin/refund-requests/{requestId}`, RefundRequestReviewDetail.
- adminDecideRefundRequest: POST decision; adminExecuteRefundRequest: POST execute;
  adminResolveRefundRequestItem: POST items/{itemId}/resolve. Tüm yazılar Idempotency-Key ister.
- Yazı200 red/tüm kalemler başarılı;202 henüz tamamlanmamış onay.409 çakışma/rezervasyon.

DTO'lar `packages/contracts/src/refund-review.ts`, üretilmiş istemci OpenAPI'den.
Detay adayları: orderId,originalPaidKurus,originalCredits,unusedCredits,
priorRefundExposureKurus,maxRefundKurus,hasOpenReservation. State'de finansal başarı iddiası
ile red kararı karıştırılmaz; UI/servis bunu olduğu gibi gösterir.

## Dikkat

Eski admin/refunds belirsizlik kuyruğu `raw.refundRequestItemId` bulunan satırları dışlamalıdır.
Belirsiz veya kesin başarısız kalemin tutması açık kalır; yalnız açık admin execute tekrar para
çağırabilir. Manual metadata değişikliği yalnız bekliyor -> basarili/basarisiz; retry'da bu
metadata temizlenebilir, eski kanıt append-only audit'te kalır. API guard+2FA/idempotency,
partial ledger ve sağlayıcı CAS entegrasyonu ödeme/kimlik sahipliğinde; testler fake/PGlite'dir.
