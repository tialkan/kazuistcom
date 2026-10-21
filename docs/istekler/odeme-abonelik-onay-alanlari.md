# odeme: abonelik adımında onay alanları

1. İsteyen: odeme ajanı, dal `dalga-1/odeme/pg-store`.

2. Gerekçe: `mimar-yonlendirme-odeme.md` madde 3 ve 4. Abonelik adımında `abonelik_sozlesmesi`, yıllık planda
   `yillik_taahhutname` ve Tarık kararına kadar cayma istisnası kutusu isteniyor. `CheckoutSubscriptionInput`
   yalnız `preInfoConsentVersion` ve `distanceContractConsentVersion` taşıyor; servis şu an
   `distanceContractConsentVersion` değerini abonelik sözleşmesi ve yıllık taahhütname sürümü olarak yazıyor,
   cayma istisnası onayı ise sunucuya ulaşmıyor (arayüz kutusu var, düğme işaretlenmeden açılmıyor).

3. Önerilen değişiklik (contracts, geriye uyumlu, isteğe bağlı alanlar):
   - `CheckoutSubscriptionInput.withdrawalWaiver: boolean` (isteğe bağlı; Tarık kararıyla zorunlu olabilir).
   - `CheckoutSubscriptionInput.annualCommitmentVersion: string` (yıllık planlarda dolu olmalı).
   - Ödeme dönüşü için `POST /v1/checkout/callback` ve `POST /v1/checkout/subscription-callback`
     (iyzico token'ı form gövdesiyle gönderir; sunucu yeniden sorgular, 303 ile `/odeme/donus` sayfasına
     yönlendirir). Uçlar bu dalda `apps/web/src/app/api/v1/checkout/**` altında var; OpenAPI'ye eklenmeli.

4. Geriye uyumluluk: yeni alanlar isteğe bağlı; mevcut istemciler etkilenmez.

5. Aciliyet: canlı ödeme anahtarından önce.
