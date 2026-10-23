# odeme: yeniden denetim (2026-10-22) için komşu modül ve sözleşme istekleri

1. İsteyen: odeme ajanı, dal `dalga-1/odeme/denetim-2`. Dayanak: `docs/denetim/defter-odeme.md` "Yeniden
   denetim", `docs/kararlar.md` 2026-10-22 satırları.

## kimlik (admin iskeleti)

- O-N1: sonucu belirsiz iadeler için yönetim uçları; servis yöntemleri hazır:
  - `GET /v1/admin/refunds/pending` -> `BillingService.listPendingRefunds()` (refundRef, paymentId, tutar,
    sipariş, açılış zamanı, `resolveBy` = 3 iş günü).
  - `POST /v1/admin/refunds/{refundRef}/resolve` gövde `{ outcome: basarili | basarisiz }` ->
    `resolvePendingRefund(refundRef, outcome, actorId)`. `withAuth({ admin: true })`, denetim kaydı servis
    içinde `billing.iade_cozuldu` olarak yazılıyor.
- Y5: `apps/worker-node/src/notify/dispatch.ts` içindeki `render(type)` ödeme bildirimlerinde `refId` varsa
  `renderBillingNotice(refId)` (`apps/worker-node/src/billing/notice-text.ts`) sonucunu kullanmalı; metinler
  `packages/i18n/{tr,en}/odeme.json` `bildirim` altında (tutar, tarih, dönem sonu ve hemen fesih ayrımı).
- O6: sözleşme e-postasına PDF eki: `fillLegalDoc` (`packages/ledger/src/billing/contract-doc.ts`) metni
  hazırlar; e-posta taşıyıcısında ek desteği gerekiyor.

## on-yuz

- O6: PDF için Türkçe glifli TTF ya da OTF yazı tipi (KzSans ve SourceSerif4 yalnız woff2; pdf-lib ile
  denenen @pdf-lib/fontkit woff2'yi okuyamadı). `apps/web/public/fonts` altına ya da `packages/ui`'ye TTF
  alt kümesi eklenince PDF üretimi (`fillLegalDoc` çıktısı, en az 12 punto) bağlanacak.

## hukuk-uyum

- ADR-0024 / karar 2026-10-22: `content/hukuki/tr/abonelik.md` içindeki `{{AYLIK_LISTE_FIYATI_TL}}` ve
  `{{AYLIK_INDIRIM_TL}}` alanları liste fiyatıyla mahsup formülüne dayanıyor. Yeni formül: iade = ödenen
  yıllık bedel - (yüklenmiş ay x yıllık bedel / 12), kesinti aşağı yuvarlanır (tüketici lehine), sıfırın
  altına inmez. Metin ve alan listesi buna göre güncellenmeli; sunucu iki alanı şimdilik dolduruyor.

## mimar

- O5: `CheckoutSubscriptionInput.withdrawalWaiver` (ve yıllık için `annualCommitmentVersion`), istek
  `odeme-abonelik-onay-alanlari.md` açık. Servis alan gelirse `cayma_istisnasi` yazıyor (test: audit2 O5).
- Y-N3: IFN ucu `POST /v1/webhooks/iyzico-fraud` (bu dalda `apps/web/src/app/api/v1/webhooks/iyzico-fraud`);
  OpenAPI'ye eklenmeli. İmza biçimi belgede doğrulanana kadar yalnız tetikleyicidir.
- D6 (önceki istek): `ledger_transactions` değişmezlik tetikleyicisi hâlâ açık (repro-pg-v2 E).
- `payments.status` değerleri artık `hazir`, `bekliyor`, `basarili`, `basarisiz`; CHECK kısıtı eklenebilir.
