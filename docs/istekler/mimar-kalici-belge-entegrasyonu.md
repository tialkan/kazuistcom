# Kalıcı belge entegrasyonu: sözleşme 1.3 ve migration 0005

Mimar, 2026-10-25. ADR-0027 önerildi, onay bekliyor. Kaynak: kimlik kalıcı belge ve ödeme D4 istekleri.

## Ödeme

- D4 uyumu 0004 üzerinde önce birleşsin: upsert `(code,price_table_id)`, kayıtlı ürün UUID'siyle okuma.
  Ardından 0005 koda bağlı tekilliği kaldırır. Eski fiyat/kredi/version alanları değiştirilemez;
  yalnız `active` ve `iyzico_plan_ref` değişebilir. Tarihe dayalı backfill yok, eski FK'ler korunuyor.
- `@kazuist/db` export `freezeOrderLegalDocuments(tx, orderId, userId, documents)`.
  `tx` checkout'un mevcut PostgreSQL transaction client'ı olmalı; pool değildir. Order ve consent'lerle
  aynı işlemde çağır. Belge: `{slug,version,text,sha256,sourceSha256?,fields}`. Ön bilgi sürümü
  `order.consent_versions.preInfo`, mesafeli/abonelik sürümü `distance` ile eşleşir.
- Paket iki belge, abonelik iki belge gerektirir; kaynak onayı ve alan doluluğu snapshot hazırlayıcıda.
  İşçi yalnız kayıtlı snapshot okur, geçmiş siparişe güncel dosyadan belge üretmez.
- `users.deletion_request_refund` kalıcı boolean default true; kanca ve günlük uzlaştırma bunu korusun.

## Kimlik ve orkestra

- `MeDeleteInput.parse({})` requestRefund true; strict bilinmeyen alan reddi. DELETE gövdesi opsiyonel.
  Tercihi silme kaydıyla atomik sakla ve ödeme kancasına aktar; geçmiş iade taleplerini silme.
- `GET /api/v1/me/orders/{orderId}/legal-documents`: operation `listMyOrderLegalDocuments`,
  `{documents:[{slug,version,text,sha256}]}`, kendi siparişine yetki, tam takım/hashes kontrolü,
  eksik veya başkasınınsa 404, `private, no-store`. İç `fields` nesnesini döndürme.
- Gerçek sağlayıcı kabulünden sonra `recordOrderLegalDocumentDelivery(tx, {orderId,userId,
  providerMessageId,deliveredAt})`; sağlayıcı hatası ve SMTP ayarı yokken çağırma.
  Tablo `order_legal_document_deliveries`. Order kilidiyle idempotent; çelişen receipt reddedilir.
  Worker retry/sabit mesaj kimliği kullanmalı; dış gönderim ile DB yazımı atomik değildir.
- Özel içerikler Türkiye DB'sinde; dış push/genel log/kuyrukta yalnız kimlikler. Saklama süreleri
  hukuk-uyum tarafından kararlaştırılmalı; yeni ADR onayı yayın onayı yerine geçmez.
