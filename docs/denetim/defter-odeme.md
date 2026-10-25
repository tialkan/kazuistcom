# Bağımsız denetim: kredi defteri ve ödeme (Dalga 1)

Tarih: 2026-10-21. Denetlenen: main 0cefe41. Denetçi: bagimsiz-denetci (işi üretmemiş). Plan 15.4.
Önem sayıları: kritik 2, yüksek 7, orta 9, düşük 10. Yeniden üretme betikleri: `docs/denetim/repro/` (`node_modules/.bin/tsx <dosya>`, ağ çağrısı yok).

## Kritik

| No | Bulgu | Yer | Beklenen | Yeniden üretme |
|---|---|---|---|---|
| K1 | Abonelik yenileme sonucu `orders[].paymentStatus`'tan okunuyor; iyzico belgesinde alan `orderStatus`. Her başarılı yenileme başarısız sayılıyor, 1-3-7 denemesinden sonra abone Ücretsiz'e düşüyor. FakeIyzico da aynı yanlış alanı kullanıyor. | packages/ledger/src/billing/service.ts:485; iyzico.ts:137-150, 363-366; fake-iyzico.ts:143-150, 249-255 | Plan 9.2/2-3, 4.5/10 | repro-http.mts |
| K2 | İlk abonelik siparişinin webhook'u yenileme gibi işleniyor (`subpay-<ref>-1` ile `subpay-<siparişRef>` eşleşmiyor): çift kredi, çift fatura, dönem kayması. | service.ts:414, 492-493, 496-520 | Plan 9.1/4-5, 9.2/3 | repro-memory.mts senaryo 6 |

## Yüksek

| No | Bulgu | Yer | Yeniden üretme |
|---|---|---|---|
| Y1 | Abonelik ödeme kimlikleri uydurma; gerçek `paymentAttempts[].paymentId` okunmuyor. Yıllık hemen fesihte iade başarısız olur, abonelik DB'de `aktif` kalır, plan düşer. | service.ts:414, 492, 593-599; fake-iyzico.ts | repro-memory.mts senaryo 5 |
| Y2 | Hemen fesih atomik değil; ikinci denemede iade yeniden gidiyor, iyzico çağrısında idempotency anahtarı yok. | service.ts:585-612 | repro-pg.mts senaryo A |
| Y3 | Paket iadesinde defter ters kaydı sağlayıcı iadesinden önce commit ediliyor; iyzico hata verirse kredi ve para ikisi de kayboluyor. | service.ts:644-663 | repro-memory.mts senaryo 2 |
| Y4 | Aynı Idempotency-Key ile tekrar, kullanılmış kuponla indirimli ödemeyi ve consents kaydı olmayan siparişi açıyor. | service.ts:134-140, 183-194 | repro-pg.mts senaryo B |
| Y5 | `notices` satırları (7/30 gün, fesih teyidi, fiyat değişikliği, başarısız ödeme) hiç gönderilmiyor; notify.send'e çeviren zamanlayıcı yok. | service.ts:284-286, 466-471; pg-store.ts:248-253 | grep |
| Y6 | Eşzamanlı callback ve webhook iki e-Arşiv faturası kesiyor (`addPayment` dönüşü yok sayılıyor). | service.ts:205, 237, 246 | repro-memory.mts senaryo 7 |
| Y7 | ai-gateway rezervasyon arayüzü defter bağdaştırıcısıyla örtüşmüyor: `reserve` hatasında eşzamanlı akış yuvası bırakılmıyor (kullanıcı kilitleniyor); tüketilmiş rezervasyonda aynı anahtarla ikinci çalıştırma ücretsiz. | packages/ledger/src/reservations.ts:28-61; packages/ai-gateway/src/gateway.ts:110-123, 227-234; ai-gateway/src/ledger.ts:41-79 | repro-gateway.mts; repro-pg.mts senaryo D |

## Orta

| No | Bulgu | Yer |
|---|---|---|
| O1 | Süresi geçen rezervasyon Postgres'te çözülmüyor (release rollback ile geri alınıyor); süpürme yalnız GET /v1/wallet'ta. | engine.ts:286-293, 351-354; pg.ts:138-153 (repro-pg.mts C) |
| O2 | Fesihten sonra başarısız tahsilat denemeleri sürüyor; başarılı deneme feshetmiş kullanıcıdan tahsilat yapıyor. | service.ts:533-556, 586-589 (repro-memory.mts 4, 4b) |
| O3 | Ters ibraz önceki iadeyi hesaba katmıyor; borç ikileniyor. | engine.ts:481; service.ts:680-694 (repro-memory.mts 3) |
| O4 | `fraudStatus` ve para birimi denetlenmiyor; tutar uyuşmazlığı sessiz. | service.ts:207-212; iyzico.ts:281 |
| O5 | Onay sürümleri content/hukuki sürümüyle doğrulanmıyor; abonelikte cayma istisnası kaydı yok; couponCode yok sayılıyor. | service.ts:141-143, 189-191, 376-382; contracts requests.ts:123-135 (repro-memory.mts 8) |
| O6 | Ödeme adımı arayüzü API'ye bağlı değil; sözleşme ve form PDF/e-posta ile gönderilmiyor. | apps/web/src/app/(odeme)/odeme/* |
| O7 | İkinci abonelik bitince diğer aboneliğin plan rolü siliniyor. | service.ts:332-340, 540-541, 592, 621-633; pg-store.ts:344-355 (repro-plan.mts) |
| O8 | Günlük mutabakat çalışmıyor (`listTransactions` yok). | iyzico.ts:400-403 |
| O9 | Hesap silmede iyzico aboneliği iptal edilmiyor; plan 4.5/12 iade talebi akışı yok, /v1/refund-requests onaysız anında iade yapıyor. | apps/worker-node/src/account/purge.ts:45-75 |

## Düşük

D1 deneme günleri fiilen 2-4-8; D2 boş IYZICO_BASE_URL ve eksik IYZICO_MERCHANT_ID kırılganlığı; D3 fesih ve iade uçlarında Idempotency-Key zorunlu değil, request_hash yok; D4 yıllık iade güncel fiyatı kullanıyor, products sürümlenmiyor; D5 FakeEArsiv üretim bağlamında, fatura numarası çakışması sessiz; D6 ledger_transactions değiştirilebilir; D7 süresi geçmiş promosyon partisine dönen kredi bakiyede görünüyor ama harcanamıyor (repro-promo.mts); D8 redeemCoupon, chargeback, announcePriceChange ve 50 promosyon kredisi için giriş noktası yok; D9 her cüzdan işlemi tüm geçmişi yüklüyor; D10 kupon kullanım sınırında yarış.

## Bulgu çıkmayanlar

Çift taraflı ve değiştirilemez ledger_entries; tüketim sırası; 5 dk rezervasyon; çekimser ve teknik hatada ücret yok; satın alınan kredi süresiz, promosyon 90 gün; 14 gün kuralı ve yıllık iade formülü; fiyatlar plan 4.2-4.4 ile birebir; HPP ve abonelik webhook imzası belgeyle aynı, sabit zamanlı karşılaştırma; kart verisi Kazuist'e gelmiyor; sır loglanmıyor; IDOR yok; assertSandbox canlı adresi reddediyor.

## Durum

Açık. Canlı ödeme anahtarı K1 ve K2 kapanmadan ve FakeIyzico gerçek yanıt biçimine göre düzeltilmeden istenmez. Kapatma: odeme (K1-K2, Y1-Y6, O1-O9, D1-D10), yz-gecidi ve odeme birlikte (Y7).

## Yeniden denetim, 2026-10-22 (main 7e9ed6d, PR #18 ve #19 sonrası)

Önceki 28 bulgu: kapandı 15 (K1, K2, Y1, Y2, Y4, Y6, O1, O2, O3, O7, D1, D2, D5, D7, D10), kısmen 11 (Y3, Y5, Y7, O4, O5, O6, O8, O9, D3, D4, D8), açık 2 (D6, D9). Kritik kalmadı.

Yeni bulgular (betikler: `docs/denetim/repro/repro2-pg.mts`, `repro2-mem.mts`, `repro2-hold.mts`, `repro-pg-v2.mts`):

| No | Önem | Bulgu | Yer |
|---|---|---|---|
| Y-N1 | Yüksek | Hemen fesihte iyzico iptal çağrısı hata verirse abonelik `iptal` yazılıyor ama iade satırı açılmıyor; tekrar istek 0 iade dönüyor. | service.ts:802-807, 829-840 (repro2-pg N1) |
| Y-N2 | Yüksek | Dönem sonu fesihte iyzico iptali başarısızsa tekrar istek iyzico'yu çağırmıyor; abonelik ACTIVE kalıp tahsilat sürüyor. Aynı desen onAccountDeletion'da. | service.ts:661-664, 808-809, 1011-1017 (repro2-pg N2) |
| Y-N3 | Yüksek | fraudStatus 0 ile gelen ödeme incelemeden sonra onaylansa bile kredi yüklenmiyor: IFN ucu, bekleyen siparişi yeniden sorgulayan iş ve 2 değeri yok. | service.ts:294-299 (repro2-pg N3) |
| Y-N4 | Yüksek | Abonelik ödenip tarayıcı callback'i gelmezse abonelik hiç açılmıyor; webhook `subscription_not_found`, yeniden sorgulayan iş yok. | service.ts:518-533, 624-635 (repro2-pg N6) |
| O-N1 | Orta | Sonucu belirsiz iadede (refund_pending) kredi harcanabilir dönüyor ve çözüm yolu yok. | service.ts:773-783, 948-954 (repro2-pg N5) |
| O-N2 | Orta | Başarısız ödemede kupon kullanım hakkı yanıyor. | service.ts:214-221, 263-268 (repro2-pg N4) |
| D-N1 | Düşük | Onaylar iyzico başlatmasından önce yazılıyor; başarısız başlatmada yetim consents satırı. | service.ts:224-241 |
| D-N2 | Düşük | Mutabakatta transactionId ve paymentId eşlemesi doğrulanmadı; gün UTC, rapor +03:00. | iyzico.ts:455-480; jobs.ts:18-23 |
| D-N3 | Düşük | Ödeme sayfası yönlendirme düzenli ifadesi FakeIyzico adres biçimini reddediyor. | apps/web/src/app/(odeme)/odeme/submit.ts:49 |
| D-N4 | Düşük | Onay sürümü taslak metinden de alınıyor. | _hukuki/yukle.ts:61-63 |
| D-N5 | Düşük | 5 dakikayı aşan iade çağrısında tutma süpürülüyor; iyzico fetch'inde zaman aşımı yok. | engine.ts holdLot; iyzico.ts call (repro2-hold) |

Kısmen kalanlarda öne çıkanlar: Y5 bildirim metinleri genel (7 gün bildiriminde tutar ve tarih yok, dönem sonu fesihte yanlış metin); Y7 açık rezervasyonun eşzamanlı tekrarı tek ücretle iki kez çalışıyor; O5 abonelikte cayma onayı kaydedilmiyor; O6 ekranda hukuk-uyum yer tutucuları, PDF ve e-posta yok; O9 onAccountDeletion çağrılmıyor.

Toplam açık: kritik 0, yüksek 7, orta 7, düşük 10. Canlı ödeme anahtarı Y-N1..Y-N4 kapanmadan istenmez.

## Üçüncü denetim, 2026-10-25 (main 50f7c1a, PR #27 sonrası)

Hüküm: canlı ödeme anahtarı istenmemeli. Önceki açık ya da kısmen 24 bulgu: kapandı 9 (Y3, Y7, O4, Y-N1, Y-N2, Y-N4, D-N3, D-N4, D-N5), kısmen 13, açık 2 (D6, D9).

Yeni bulgular (betikler `docs/denetim/repro/repro3-pg.mts`, `repro3-pg-r2.mts`, `repro3-http.mts`):

| No | Önem | Bulgu | Yer |
|---|---|---|---|
| Y-N5 | Yüksek | İncelemesi (fraudStatus 0) 2 günü aşan, parası tahsil edilmiş sipariş kalıcı `basarisiz` kapanıyor; sonraki onay ve IFN onu görmüyor. | service.ts:383-385, 404; pg-store listPendingOrders (R1) |
| Y-N6 | Yüksek | Tek bir iyzico hatası (zaman aşımı veya `status: failure`) günlük ödeme zincirinin kalanını o gün durduruyor; başarısız kart cevabında callback 500, sipariş `bekliyor`, kupon dönmüyor. FakeIyzico bu yolu modellemiyor. | service.ts:380-382; worker-node billing/deps.ts:29-37; iyzico.ts call, retrySubscriptionOrder (repro3-pg-r2, repro3-http) |
| O-N3 | Orta | IFN ucu belgedeki `{paymentId, fraudStatus}` gövdesini yok sayıyor (yalnız conversationId okuyor); kimliksiz çağrı yeniden sorgu tetikleyebiliyor. | service.ts:394-406; fake-iyzico.ts fraudNotification (R3) |
| D-N6 | Düşük | 30 günlük tutma dolunca belirsiz iadenin kredisi serbest kalıyor; geç yönetici kararı yarım kalıyor. | engine.ts REFUND_HOLD_TTL_MS; service.ts:1183-1191 (R4) |
| D-N7 | Düşük | plan.md 4.5/7 eski formülü yazıyor (ADR-0024 onayıyla düzelecek); kod, hukuki metin ve kararlar yeni formülde. | plan.md:289 |
| D-N8 | Düşük | FakeIyzico yarım bırakılan abonelik checkout'unu modelleyemiyor. | fake-iyzico.ts retrieveSubscriptionCheckout |
| D-N9 | Düşük | reconcileCancellations bitmiş tüm abonelikleri süresiz sorguluyor. | service.ts:978-991 |

Kısmen kalanlar: Y5 (renderBillingNotice çağrılmıyor, sozlesme metni PDF vaat ediyor), Y-N3, O5 (withdrawalWaiver sözleşmede yok), O6 (PDF ve e-posta yok, yer tutucular, abonelik adımı başlığı), O8 ve D-N2 (siparişsiz yenileme eşlemesi), O9 (silme kancası hatasında yeniden deneme yok), O-N1 (yönetim uçları bağlı değil), O-N2 (HttpIyzico failure yolunda kupon), D-N1 (abonelikte onaylar başlatmadan önce), D3, D4, D8.

Toplam açık: kritik 0, yüksek 4 (Y5, Y-N3, Y-N5, Y-N6), orta 7, düşük 11. Gerçek sandbox uçtan uca denemesi (başarısız kart, yarım belirteç, IFN gövdesi, rapor transactionId) IYZICO_MERCHANT_ID gelince yapılacak.
