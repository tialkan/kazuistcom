# ADR-0028: Hesap silme iade talebinin yönetici kararı ve kalem bazında yürütülmesi

- Tarih: 2026-10-27
- Durum: Kabul edildi, 27 Ekim 2026 kullanıcı onayı
- Dayanak: plan 4.5/12, 9.4, 17.3/4; ödeme isteği 2246501 ve sonraki işlem sırası mutabakatı
- Önkoşul: sözleşme 1.3 / migration0005. ADR-0027 onayı bu öneriyi kapsamaz.

## Bağlam

Hesap silmede açılan toplu `refund_requests` kaydı, sonucu belirsiz sağlayıcı iadelerinin
`/admin/refunds/pending` kuyruğundan farklıdır. Onay/red kararı, her orijinal paket için iade
üst sınırı, kredi tutması ve sağlayıcı sonucu birlikte kalıcı olmalıdır. Para kesinleşmeden
"tamamlandı" denemez; belirsizlik yeniden para gönderme gerekçesi değildir.

## Önerilen ürün varsayılanı

Yalnız gerçekten tahsil edilmiş iyzico paketleri bu akıştadır; abonelik, promosyon ve IAP hariç.
Her orijinal paket siparişi için:

```text
hak = min(ceil(orijinalTahsilatKurus * kalanKredi / orijinalKredi),
          max(0, orijinalTahsilatKurus - diğerİadeRiskiKurus))
```

İndirimli ve KDV dahil gerçek tahsilat kullanılır. Kuruş kesri tüketici lehine yukarı yuvarlanır;
güncel liste fiyatı, ücret kesintisi veya yöneticinin seçtiği tutar kullanılmaz. Başarılı, belirsiz
ve aktif iadeler ile tutulan diğer kalemlerin riski düşülür; aynı sağlayıcı referansı hem kalem
hem ödeme olarak iki kez sayılmaz. Ters ibraz ve önceden geri alınmış kredi, defterden türetilen
kalan hakta hesaba katılır. Açık YZ rezervasyonu önce çözülmelidir (409).

14 günlük otomatik paket iade sınırı, silme talebinin yönetici tarafından incelenmesini engellemez.
Bu bir ürün önerisidir; yeni bir hukuki uygunluk/yayın onayı veya canlı iade yetkisi değildir.

## Şema ve değişmezlik

Sözleşme/db 1.4.0, eklemeli `0006_deletion_refund_review.sql`.

- Mevcut `refund_requests` kimlikleri, order/subscription ve kullanıcı FK'leri korunur. Nullable
  `decision_reason`, `decision_key`, `decision_hash` eklenir; ilk kararda mevcut `decided_by/at` ile
  atomik yazılır. Önceden karar verilmiş eski satıra yeni karar uydurulmaz. Yeni CHECK NOT VALID'dir;
  eski satırlar taranmaz, yeni/yeni değiştirilen satırlar denetlenir.
- Yeni kararda bekliyor -> onaylandi veya reddedildi. Aktör, gerekçe, anahtar, gövde özeti ve tutar
  değişmez. Ret sonrasında onaya dönülmez; ret para iadesi sayılmaz. Onaylı talep yalnız tüm kalemler
  başarılıysa ve toplam tutar kalem toplamıyla aynıysa tamamlandi olur.
- `refund_request_items`: talep + orijinal sipariş tekil; orijinal ödenen, orijinal kredi, kalan kredi,
  onaylanan tutar, tekil tutma işlemi ve `silme:<itemUUID>` sağlayıcı referansı dondurulur. INSERT'te
  sipariş/kullanıcı/cüzdan sahipliği, `credit_lots.origin_ref=order:<orderId>`, paket kaynağı,
  başarılı gerçek tahsilat, tam kalan kredi ve tam hesaplanan üst sınır doğrulanır.
- Para hareketinin doğruluk kaynağı mevcut `payments` tablosudur. Yeni bir para defteri kurulmaz.
  Başarılı kalem için aynı order/ref/amount ile başarılı iade ödeme satırı önceden bulunmalıdır.
- Kalem durumları: hazir -> bekliyor -> basarili veya basarisiz; kesin başarısız -> bekliyor yalnız
  açık yönetici execute ile. Basarili terminaldir. Hazırdan doğrudan başarıya atlanmaz.
- Her değişimde `updated_by` ve `state_reason`; manuel sonuçta `resolved_by/at` ve
  `resolution_reason`. Karar ve kalem tetikleyicileri mevcut append-only `audit_log`'a aktör, hash,
  gerekçe ve gerekli işlem kimliklerini yazar. Ham sağlayıcı cevabı, kart veya hukuki belge yazılmaz.

## İşlem ve kurtarma sözleşmesi

1. Talep kilidi, cüzdan kilidi/yükleme, güncel hak/riski yeniden ölçme.
2. Aynı SQL transaction içinde karar CAS, kalem INSERT (bu anda lot.remaining_credits kalan kredidir),
   ardından aynı transaction'a bağlı defter tutması/persist. Tutma hatası kararı ve kalemleri de geri alır.
3. Commit sonrasında para çağrısı. Çağrıdan önce kalem ve ödeme satırı bekliyor CAS ile kalıcılaşır.
4. Sağlayıcı başarı kanıtı -> başarılı payment -> kalem + defter kesinleştirmesi aynı yerel işlemde.
   Belirsiz kalem bekler, tutma kalır ve uyarı açılır; kendiliğinden yeniden gönderilmez.
5. Kesin başarısızlıkta da onaylı talebin aynı deterministik tutması korunur. Yönetici execute aynı
   açık tutmayı kullanır; kapalı rezervasyon anahtarı yeniden açılmaz. Manuel resolve para çağırmaz.

Anahtar bazlı kalıcı idempotency ve talep bazlı anahtardan bağımsız kilit birlikte gereklidir.
Aynı key/gövde özgün yanıtı döndürür, farklı hedef/karar/gerekçe 409. Para çağrısı uzun SQL
transaction'ında tutulmaz. Sağlayıcı kabulü ve yerel işlem dağıtık atomik işlem değildir; crash
sonrası belirsizlik otomatik tekrar gönderimle kapatılamaz.

## Yönetim API'si

Ayrı `/v1/admin/refund-requests` kuyruğu: 50 kayıtlık cursor listesi, requestId detay, decision,
execute ve item resolve. Detay yalnız yetkili kimlik, para/kredi ve durum bilgisini taşır;
`private, no-store`. Mevcut sağlayıcı belirsiz sonuç kuyruğu, silme kalemiyle bağlı payments
satırlarını listelemez veya çözmez.

Her uç admin rolü, passkey ve TOTP ikinci adımı ister. Yazılar CSRF, kullanıcı hız sınırı,
zorunlu Idempotency-Key ve strict gövde ister; aktör/tutar istemciden alınmaz. İki GET ve üç POST
OpenAPI ve zod'da tanımlıdır. Kalıcı karar tutarı veya yeni sağlayıcı sonucu yalnız görevli kodun
bu doğrulamalarıyla değişebilir; yeni bir genel yönetici SQL yetkisi verilmez.

## Doğrulama ve sınırlar

Dolu 1.3 veri tabanından yükseltme, NULL eski karar alanları, gerçek kaynak/sahiplik, kuruş
üst sınırı, başka iade riski, karar/kalem değişmezliği, ödeme kanıtı, kısmi toplu sonuç ve
append-only aktör/gerekçe testleri. Sağlayıcı/defter/route entegrasyonunun bağımsız fake/PGlite
senaryoları ödeme ajanındadır. Bu PR tek başına o uçların uygulanmış olduğunu iddia etmez.

Canlı veya sandbox para iadesi ve canlı migration çalıştırılmadı. ADR-0028, 27 Ekim 2026 kullanıcı mesajıyla onaylandı; canlı işlem veya üretim migration izni değildir.

## Onay kaydı

Kullanıcı 27 Ekim 2026 mesajında ADR-0028 kararını açıkça onayladı. Public yayına hazırlık yetkilendirildi; görünürlük değişikliği, lisansın yürürlüğe konması veya yıkıcı geçmiş temizliği bu onaydan çıkarılmaz.
