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
