# ADR-0026: Sözleşme v1.2: ödeme denetimi, PDF ön bilgi alanları ve parçalama tutarlılığı

- Tarih: 2026-10-25
- Karar kodu: yok (plan 17.3/4; istekler: docs/istekler/, karar tablosu docs/istekler/README.md, ikinci tur)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Dalga 1 kapısı ve ödeme yeniden denetimi (docs/denetim/defter-odeme.md) sözleşmede eksikler buldu: defter
işlemlerinin değişmezliği (D6), ürün sürümleme (D4), fesih ve iade uçlarının idempotency ve 202 cevabı (D3),
abonelik onay alanları (O5), uygulamada olup sözleşmede olmayan uçlar (iyzico dönüşleri, IFN, D8 ve O-N1 uçları),
bildirim alt türleri (Y5). Hukuki metinlerin PDF alanları, anonimleştirmeden sonra parçalama işinin yükü ve NER
çalışma zamanı da istendi. v1.1 yayımlandığı için v1.2 yalnız ekler; mevcut istemcileri bozan değişiklik yoktur.

## Karar

### Sürüm

`packages/contracts` ve `packages/db` 1.2.0. Migration `0004_v1_2_ledger_guards.sql` yalnız ekler: dizin, iki CHECK
(NOT VALID), tetikleyiciler. Mevcut migration'lar değişmedi; 0004, v1.1 verisi olan bir veri tabanında sınanır
(packages/db/test/migration-0004.test.ts).

### Defter ve ödeme

- D6: `ledger_transactions` UPDATE, DELETE ve TRUNCATE ile değiştirilemez (`append_only_table()`). `credit_lots`
  satırı silinemez ve yalnız `remaining_credits` değişebilir (`credit_lots_guard()`); defterin `on conflict do
  update set remaining_credits` yazımı bununla uyumludur.
- D4 (genişletme adımı): `products (code, price_table_id)` tekil. Yalnız koda bağlı tekil kısıt, ödeme deposu
  sürüm satırlarını yazıp okuyana kadar kalır; ardından ayrı bir migration onu kaldırır ve `orders.product_id`
  satılan sürümü gösterir. Bu iki adım, mevcut deponun `on conflict (code)` yazımını bozmamak içindir.
- `payments.status` için CHECK (`paymentStatuses`: hazir, bekliyor, basarili, basarisiz) ve `notices.kind` için
  CHECK (`noticeKinds`). İkisi de NOT VALID eklendi: eski satırlar yeniden denetlenmez, yeni ve değişen satırlar
  denetlenir. VALIDATE, veri kontrolünden sonra ayrı migration'dır.
- O5: `CheckoutSubscriptionInput.withdrawalWaiver` (cayma_istisnasi) ve `annualCommitmentVersion`
  (yillik_taahhutname; sunucu yıllık planda zorunlu tutar). İsteğe bağlı alanlar.
- D3: `POST /v1/subscriptions/{id}/cancel` ve `POST /v1/refund-requests` `Idempotency-Key` başlığını zorunlu
  ister. İade talebi hemen iade edilince 201, yönetici onayı beklerse 202 döner; gövde
  `RefundRequestResult { id, status: bekliyor | tamamlandi, amountKurus }`.
- Uygulamada olup sözleşmeye eklenen uçlar: `POST /v1/checkout/callback` ve
  `POST /v1/checkout/subscription-callback` (iyzico form gövdesi, yalnız `token` okunur, 303 ile `/odeme/donus`;
  2XX yoktur, Redocly'de bu iki işlem için açık istisna), `POST /v1/webhooks/iyzico-fraud` (IFN; imza biçimi
  doğrulanana kadar yalnız tetikleyici, sipariş iyzico'dan yeniden sorgulanır).
- D8: `POST /v1/coupons/redeem`, `POST /v1/admin/chargebacks`, `POST /v1/admin/price-changes`. O-N1:
  `GET /v1/admin/refunds/pending` ve `POST /v1/admin/refunds/{refundRef}/resolve` (3 iş günü). Yönetim uçları
  passkey ve ikinci adım ister.

### Bildirim

Y5: `NotifyPayload.subtype` (`billingNoticeKinds`: odeme_7_gun, yillik_30_gun, odeme_alindi, odeme_basarisiz,
plan_ucretsize_indi, fiyat_degisikligi, sozlesme) yalnız `type: odeme` ile. Tercihler tür başına kalır; ödeme
bildirimleri zorunlu e-postadır. `refId` öneki (`<alt tür>:<ref>`) geriye uyum için okunmaya devam eder.

### Hukuki metin PDF alanları

`LegalFrontMatter.pdf` ve `pdf_fields` (büyük harf alan adları, tekil, `pdf: true` gerektirir). Bildirilen
alanlar sipariş anında doldurulur: sayfa yayınını engellemez (sayfa onları nötr bir etiketle gösterir), PDF
üretiminde her biri zorunludur (`legalPdfMissingFields`). CI, her bildirilen alanın gövdede `{{ALAN}}` olarak
geçtiğini denetler (`legalPdfProblems`). Bildirilmemiş her yer tutucu yine yayını engeller.

### Parçalama tutarlılığı

- `EmbedChunksPayload { recordId }`, tekilleştirme anahtarı `embed:<recordId>`.
- Karar (istekteki soru): parçaları veri tabanı siler. `records.masked_text` değiştiğinde ya da NULL olduğunda
  aynı işlemde o kaydın `chunks` satırları silinir; değer NULL değilse `embed.chunks` kuyruğa girer (kuyrukta ya
  da çalışırken ikinci iş açılmaz). Bu, NER veya politika değişikliğinde eski maskeli metnin aranabilir
  kalmasını önler (fail closed). Tetikleyici INSERT'te de çalışır; norm kayıtları için ayrıca iş atmak gerekmez.
- Tüketici kuralı: okurken `md5(masked_text)` saklanır; yazma işleminde kayıt satırı kilitlenir ve özet aynıysa
  parçalar yazılır, değilse iş başarısız sayılıp yeniden denenir. Çalışan bir iş varken gelen değişiklikte yeni
  iş açılmadığı için casuist, `masked_text` dolu, parçası ve etkin işi olmayan kayıtları bulup kuyruğa atan
  periyodik bir uzlaştırma işi yazar.

### NER çalışma zamanı

worker-py `ner-runtime` ekstrası: onnxruntime (MIT), tokenizers (Apache-2.0), numpy (BSD-3-Clause ve paketlenen
alt bileşenler için 0BSD, MIT, Zlib, CC0-1.0). torch, transformers ve gliner yalnız `ner` ekstrasındadır
(dışa aktarma ve GLiNER). Kilitli sürümler onnxruntime 1.31.0, tokenizers 0.22.2, numpy 2.4.6. Modeller depoya
ve imaja girmez; salt okunur birimden `KAZUIST_NER_DIR` ile okunur; `HF_HUB_OFFLINE=1` ve `TRANSFORMERS_OFFLINE=1`.

## Gerekçe

Uygulamada var olan uçların sözleşmede olmaması istemci üretimini ve güvenlik incelemesini eksik bırakır;
defter tablolarının değişmezliği uygulama koduna değil veri tabanına bağlı olmalıdır; parçaların maskeli metinle
tutarlılığı tek bir üreticiye bırakılmamalıdır.

## Sonuçlar

- Sahip ajanların işleri: docs/istekler/mimar-yonlendirme-2-<ajan>.md.
- `products` daraltma adımı ve iki CHECK'in VALIDATE edilmesi sonraki migration'lardır.

## Durum

Önerildi, Tarık onayı bekliyor.
