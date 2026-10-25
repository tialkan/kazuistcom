# Yönlendirme (ikinci tur): kimlik ajanına işler (sözleşme v1.2)

Kimden: mimar, dal `dalga-1/mimar/istekler-2`. Kime: kimlik. Dayanak: ADR-0026, istekler
`odeme-denetim-kapanisi.md` (kimlik bölümü), `odeme-denetim-2.md` (kimlik bölümü).

## İşler

1. Yönetim uçları (admin iskeleti, `withAuth({ admin: true })`, sözleşme v1.2):
   - `POST /v1/admin/chargebacks` -> `BillingService.chargeback(orderId, caseRef)`, 200 `{ balance }`.
   - `POST /v1/admin/price-changes` -> `announcePriceChange(planCode, newPriceKurus)`, 200 `{ notified }`.
   - `GET /v1/admin/refunds/pending` -> `listPendingRefunds()`.
   - `POST /v1/admin/refunds/{refundRef}/resolve` -> `resolvePendingRefund(refundRef, outcome, actorId)`, 204.
     `refundRef` deseni sözleşmede (`refundRefPattern`).
   İlk ikisi `Idempotency-Key` ister. Gövdeler `AdminChargebackInput`, `AdminPriceChangeInput`,
   `AdminRefundResolveInput`.
2. Bildirim metni: `apps/worker-node/src/notify/dispatch.ts` ödeme bildiriminde `payload.subtype` (yoksa `refId`
   öneki) ile `renderBillingNotice` (odeme'nin `notice-text.ts`) kullansın.
3. Kayıt ve silme kancaları (D8, O9) `apps/web/src/server/auth/context.ts` içinde bağlı; iş yok.
4. Sözleşme e-postasına PDF eki (O6): e-posta taşıyıcısında ek desteği; PDF alanları için
   `legalPdfMissingFields` boş değilse belge gönderilmez.
