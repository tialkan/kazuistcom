## 27 Ekim uygulama kanıtı

Beş sözleşme ucu gerçek servis/store'a bağlandı. Ledger154 ve HTTP billing12 testleri; özgün
ödeme tavanı, açık rezervasyon, eşzamanlı karar, aynı anahtar/farklı gövde, kesin başarısızlıkta açık
execute, belirsizlikte yeniden göndermeme, gerçek PGlite karar/hold/başarı ve manuel çözüm sınandı.
Öneri ADR28 onaylı kabul edilmedi. Canlı migration veya para iadesi yapılmadı.

Açık rezervasyon varken chargeback409: iade tutmasının harcanmış kredi gibi tekrar borca alınmasını
önler. İşletim sırası sağlayıcı sonucunu elle doğrulayıp belirsizliği çözmek, ardından chargeback
kaydıdır. Provider panelde hem iade hem chargeback varsa mükerrer nakit hareketi otomatik çözülmez.

Fatura gerekliliği ledger transaction'ında `billing.silme_iade_fatura_gerekli` audit uyarısıdır.
Mevcut e-Arşiv adaptöründe idempotency/requery yok; process crash sonrasında otomatik fatura retry
uygulanmadı. Entegratör + kalıcı fatura outbox ve sağlayıcı kimliğiyle kurtarma açık teknik iştir;
iade akışının başarılı olması dış fatura teslimi kanıtı değildir.

# O9: hesap silme iade taleplerinin yönetimi

Ödeme, 2026-10-26. Plan 4.5/12 ve 9.4. Bu bir sözleşme/schema isteğidir;
yeni ADR önerisinin onaylandığı veya canlı iadenin yetkilendirildiği varsayılmaz.

## Mevcut boşluk

`onAccountDeletion` kullanıcı başına `hesap_silme:*` gerekçeli ve order_id null bir
`refund_requests` kaydı açıyor. Mağaza yalnız kullanıcının taleplerini okuyabiliyor;
`updateRefundRequest` actor/gerekçe yazmıyor. Mevcut `/admin/refunds/pending` ve
`/resolve` **sonucu belirsiz payments iadelerini** çözüyor; silme taleplerinin karar
akışı değil. Bu iki kuyruğun modeli ve uçları ayrı kalmalı.

## Hesap ve kapsam

- Yalnız talebin sahibine ait, gerçek tahsilatı kayıtlı iyzico paket siparişleri.
  Abonelik, promosyon ve IAP bu akışta değil. Gerekçedeki kredi rakamı mali veri
  sayılmaz; gerçek sipariş, başarılı ödeme ve kredi partisi birlikte okunur.
- Her paket için üst sınır: `min(ceil(originalPaidKurus * unusedCredits /
  originalCredits), originalPaidKurus - priorRefundExposureKurus)`; sıfırın altı yok.
  Orijinal indirimli/KDV dahil tahsilat kullanılır; güncel liste fiyatı ve ücret kesintisi yok.
  Kuruş kesri tüketici lehine yukarı yuvarlanır; toplam orijinal tahsilat üst sınırı korunur.
  14 günlük otomatik paket iade sınırı silme talebinin yönetici incelemesini engellemez.
- `priorRefundExposureKurus`: başarılı veya sonucu belirsiz/mevcut yürütmedeki başka
  iadelerin tutarı; kesin reddedilmiş sağlayıcı çağrısı dahil değil. Çift iade yok.
- Kullanılmamış **kalan** paket kredisi iadeye konu olur. Aynı partide açık YZ rezervasyonu
  varsa önce tamamlanması/çözülmesi beklenir (409); yönetici onay anında hak yeniden ölçülür.
- Yönetici tutarı serbestçe arttıramaz. Onay, sunucunun yeniden ölçtüğü tam üst sınırı seçer.
  Krediler karar/yürütme sırasında tutulur; para iadesi kesinleşmeden ters kayıt yapılmaz.

## Önerilen eklemeli 0006

Mevcut `refund_requests` kimliğini ve durumlarını koru: bekliyor, onaylandi,
reddedildi, tamamlandi. `decided_by/at` zaten var. Karar alanları ekle:

- decision_reason text (zorunlu, 10..2000 karakter), decision_key text,
  decision_hash text; bunlar decided_by/at ile ilk kararda atomik yazılır.
- Karar bir kez verilir; reddetmeden onaya veya onaydan redde sessiz geçiş yok.
  Eşdeğer replay aynı kararı verir; farklı karar/gerekçe 409. Karar veren silinse de
  denetim kanıtı korunur. Karar alanları sonradan değişmez.

Yeni `refund_request_items` tablosu (önerilen ad):

- id UUID PK, request_id FK, order_id FK; UNIQUE(request_id,order_id), aynı order'ın
  eşzamanlı aktif iadesini uygulama/ödeme kilitleri de önler.
- original_paid_kurus, original_credits, unused_credits, approved_amount_kurus:
  onay anında dondurulmuş pozitif tamsayılar; matematiksel üst sınır CHECK'i mümkünse DB'de.
- hold_operation_id text (tekil), provider_refund_ref text (tekil, `silme:<itemUUID>`),
  state enum/check: hazir, bekliyor, basarili, basarisiz; created_at/updated_at.
- provider_result_ref nullable text, resolved_by/at nullable, resolution_reason nullable.
  Sonucu belirsiz durumun manuel çözümünde actor/gerekçe kalıcı olmalı.
- items ve karar aynı request kilidiyle dondurulur; sonradan order/tutar/kredi değişmez.
  Durum geçişleri CAS; basarili terminal, bekliyor otomatik yeniden gönderilmez.

`payments` mevcut iade kayıtları para hareketinin doğruluk kaynağı olarak kullanılır;
items.provider_refund_ref bu kayıtlarla bağlanır. Yeni bir tahsilat/iade defteri icat edilmez.
İade faturası mevcut sağlayıcı soyutlamasından, gerçek onaylanan tutar kadar bir kez açılır.

## Uç önerileri (ayrı request kuyruğu)

Hepsi admin rolü, passkey oturumu, TOTP ikinci adım, CSRF, kullanıcı bazlı rate limit.
Bütün yazılarda zorunlu Idempotency-Key ve strict gövde; actor gövdeden alınmaz.

- GET `/v1/admin/refund-requests?status=bekliyor&cursor=...`: yalnız hesap_silme talepleri,
  sabit 50 sayfa limiti; filtre durumlarına onaylandi eklenebilir.
- GET `/v1/admin/refund-requests/{requestId}`: karar alanları, yetkili hesap kimliği,
  paket başına orijinal/kalan krediler, önceki iade riski, hesaplanan üst sınır ve mevcut items.
  Gereksiz kişisel belge/ödeme ham verisi dönmez; cache private/no-store.
- POST `/v1/admin/refund-requests/{requestId}/decision`:
  `{decision:'onay'|'ret',reason:string}`. 200 red/tamamlandı, 202 onaylandı fakat iade
  hâlâ bekliyor; 409 çelişkili karar/açık rezervasyon/başka aktif iade.
- POST `/v1/admin/refund-requests/{requestId}/execute`: yalnız onaylı talebin hazir veya
  **kesin** başarısız satırlarını devam ettirir; yeni karar/tutar üretmez. İşlem actor'ı audit'e yazılır.
- POST `/v1/admin/refund-requests/{requestId}/items/{itemId}/resolve`:
  `{outcome:'basarili'|'basarisiz',reason:string,providerResultRef?:string}`;
  yalnız sonucu belirsiz bekliyor satırı, panelde doğrulanmış sonuç için. Tekrar para çağrısı yok.

Resolve ve execute son iki uç güvenli kurtarma için gereklidir; belirsiz iadeler eski
/admin/refunds kuyruğuna karıştırılmaz. Eski uçlar `raw.refundRequestItemId` bulunan
payments iadelerini listemez/çözmez. İade talebinin detayında güncel satır durumu okunur;
aynı idempotency anahtarıyla başarılı tekrar özgün yanıtı döndürür.

## Yarış, tekrar ve belirsiz sonuç

D3 persistent `idempotency_keys` gövde hash/özgün yanıt ve oturum advisory lock örüntüsü
tekrar kullanılır. Buna ek olarak aynı request için **anahtardan bağımsız** kilit ve
bekliyor->karar CAS gerekir; iki farklı admin/anahtar çifte onay veremez.
Talep içindeki order'lar sabit sırayla kilitlenir; aynı order'da iade exposure yeniden ölçülür.
Para çağrısı uzun DB transaction'ının içinde tutulmaz: karar/items/hold kalıcı olduktan
sonra çağrı yapılır; provider_refund_ref başına payments bekliyor CAS çağrıyı tekilleştirir.
Süreç düşüşü veya ağda belirsizlik yeniden para gönderme sebebi değildir; bekliyor+alert
ve manuel resolve gerekir. Kesin başarısızlıkta bu özel akışın kredileri onaylı talep adına tutulur; execute aynı
açık hold_operation_id ile kontrollü tekrar yapar. Manual resolve basarisiz de hold
serbest bırakmaz; onaylı talep sonuçlanana kadar tahsis değişmez.

İşlem kimliği ve tutarlar audit'e; ham kart, hukuki belge ve sırlar loga girmez.

## Defter gereği ve test kapısı

Mevcut holdLot yalnız hiç kullanılmamış partiyi kabul ediyor. Silme için ayrı, yalnız paket
kalanını tutan yol gerekir. Kısmi iadenin ardından chargeback tüketilmiş krediyi doğru
hesaplamalı: önceki iadeyle geri alınan kredi yeniden borç yazılmamalı. Bu toplam mevcut
immutable iade entry'lerinden türetilebilir; credit_lots finansal geçmişi yeniden yazılmaz.

Kırmızıdan yeşile: liste/yetki/passkey/TOTP/actor, redde sağlayıcı0 çağrı, orijinal fiyat ve
kısmen kullanılmış paket hesabı, önceki iade düşümü, iki admin/iki key yarışı, aynı key farklı
gövde409, tekrar tek iade/fatura, iki paketli talebin kısmi sonucu, ağ belirsizliğinde no-resend,
kesin başarısızlık+execute, manuel resolve, süreç düşüşünden devam, oransal iade sonrası
chargeback. Yalnız fake sağlayıcı/PGlite; canlı veya sandbox para iadesi yapılmayacak.
