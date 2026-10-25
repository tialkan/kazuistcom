# odeme: üçüncü denetim (2026-10-25) için komşu modül istekleri

1. İsteyen: odeme ajanı, dal `dalga-1/odeme/denetim-3`. Dayanak: `docs/denetim/defter-odeme.md` "Üçüncü
   denetim" ve 2026-10-25 iyzico sandbox denemesi (`packages/ledger/test/billing/fixtures/iyzico-sandbox.json`).

## kimlik

- Y5: `apps/worker-node/src/notify/dispatch.ts` içindeki `render(type)`, `odeme` ve `fesih_teyidi` türlerinde
  `payload.refId` varsa `renderBillingNotice(refId)` (`apps/worker-node/src/billing/notice-text.ts`) sonucunu
  kullanmalı; null dönerse bugünkü genel metne düşer. Bağlanana kadar kullanıcı genel ödeme metnini alır.
- O-N1: yönetim uçları (`odeme-denetim-2.md`) hâlâ açık: bekleyen iadeler listesi ve karar ucu.
- O9: silme kancası hatası artık günlük `reconcileDeletedAccounts` ile yeniden deneniyor; kancanın kendisi
  değişmeden kalabilir.

## hukuk-uyum

- O6: PDF üretimi gelene kadar `content/hukuki/tr/{on-bilgilendirme,mesafeli-satis,abonelik}.md` içindeki
  "PDF olarak e-postayla gönderilir" ifadeleri, metnin hesap sayfasında ve /hukuki altında saklandığını
  söyleyecek biçimde geçici olarak yumuşatılmalı (ödeme bildirimi metni bu dalda değiştirildi).

## mimar (sözleşme 1.2, paralel iş)

- `orders.status` değerleri: `bekliyor`, `inceleniyor` (ödeme alındı, iyzico incelemesi sürüyor), `odendi`,
  `basarisiz`, `iade_edildi`. CHECK kısıtı eklenirse `inceleniyor` dahil edilmeli.
- IFN gövdesi belgedeki `{ paymentId, fraudStatus }`; uç yalnız tetikleyicidir (hız sınırı 20/dk/IP, gövde
  en çok 2 KB).

## Sandbox bulguları (bilgi)

- Ödenmemiş checkout token'ının detayı `status: failure`, `errorCode: 5122`; bilinmeyen token `5124`. Servis
  bunları "henüz ödenmedi" sayıyor, başarısız ödeme saymıyor.
- `.invalid` uzantılı e-posta iyzico'da `errorCode: 5` ile reddediliyor; test verileri gerçek biçimli adres
  kullanmalı.
- Abonelik ürün oluşturma `errorCode: 100001` ("Sistem hatası"): abonelik akışı doğrulanamadı. Bu kod
  tek başına eklentinin kapalı olduğunu kanıtlamaz. Resmî sandbox aktivasyon/durum teyidi yolu
  entegrasyon@iyzico.com adresidir; panelde Eklentiler satın alımı canlı hesap içindir. Ayrıntı ve
  gönderilmemiş taslak: `docs/runbook/iyzico-sandbox-aktivasyon.md` (25 Ekim 2026 yeniden doğrulaması).
- Günlük rapor aynı gün boş döndü; transactionId ile paymentId ilişkisi ertesi gün yeniden denenmeli.

## Mimar sonucu (2026-10-25, sözleşme 1.2)

`orders.status` üzerinde yeni CHECK yoktur; `inceleniyor` engellenmez. IFN OpenAPI gövdesi `paymentId`
(metin veya tam sayı) ve `fraudStatus` olarak güncellendi; uç kimliği yalnız siparişi bulup iyzico'dan
yeniden sorgulamak için kullanır. 20/dk/IP ve 2 KB sınırı belgede gösterildi.
