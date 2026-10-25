# ADR-0027: Kalıcı sipariş belgeleri, ürün sürümleri ve silmede iade tercihi

- Tarih: 2026-10-25
- Durum: Önerildi, Tarık onayı bekliyor
- Dayanak: plan 4.5/12, 9.2/8, 9.4, 17.3/4; ADR-0026; kimlik ve ödeme istekleri

## Bağlam

Siparişin kabul edilen metni sonradan değişen dosya, alıcı profili veya fiyat tablosundan yeniden
üretilemez. Kuyruğa alınan e-posta gerçek teslim sayılmaz. Ürün kodunun tekilliği fiyat sürümü
satırlarının birlikte saklanmasını engelliyor. Hesap silerken iade talep etmeme tercihi günlük
uzlaştırmada kaybolmamalıdır.

## Önerilen karar

Sözleşme ve veri tabanı paketi 1.3.0, migration `0005_frozen_legal_documents.sql`.

### Ürün sürümleri

`products_code_unique` kaldırılır; `(code, price_table_id)` tekilliği korunur. Mevcut sipariş ve
abonelik FK'leri zaten `products.id` hedefler; faturalar siparişe bağlıdır. Kod FK'si veya tarih
üzerinden doldurulacak ilişki yoktur. Hiçbir geçmiş satır taşınmaz, silinmez veya güncel fiyata
bağlanmaz. Beklenmeyen bir bağımlılık varsa DROP CONSTRAINT varsayılan RESTRICT ile durur.

Eski ürünün fiyatı, kredi miktarı, kodu ve fiyat tablosu değişmez; ürün sürüm tetikleyicisi yalnız
`active` ve `iyzico_plan_ref` değişikliğine izin verir. Yeni fiyat veya kredi miktarı yeni fiyat
tablosu ve ürün satırıdır. Aboneliğin ileri dönem fiyat bildirimi ayrı mevcut alanlarla yürür.

Dağıtım sırası: ödeme deposu önce `(code, price_table_id)` üzerinden yazıp işlemdeki ürün UUID'sini
okumalıdır (0004 üzerinde mümkündür). Bu kod birleşmeden 0005 çalıştırılmaz. Eski
`ON CONFLICT(code)` yazımı 0005 sonrasında desteklenmez.

### Kalıcı belgeler

`order_legal_documents`: `(order_id, slug)` PK; `user_id`, `version`, `filled_text`, `sha256`,
isteğe bağlı `source_sha256`, satın alma anındaki `fields` JSONB ve `created_at`.

- Belgeler Türkiye'deki mevcut veri tabanında kalır. PUBLIC yetkileri kaldırılır. Web erişimi oturumun
  kullanıcı kimliği ve sipariş sahipliğiyle sınırlandırılır. İçerik günlüğe, iş yüküne, dış YZ'ye veya
  push'a yazılmaz; kuyruk yalnız sipariş ve kullanıcı kimliğini taşır.
- Dolu metnin UTF-8 SHA-256 özeti veri tabanında doğrulanır; açık yer tutucu ve doğrulanacak işaret
  reddedilir. Sahiplik ve siparişin `consent_versions.preInfo` / `distance` sürümü eşleşmelidir.
- UPDATE, DELETE ve TRUNCATE reddedilir. Tekrar aynı metin ve alanlarla idempotent, farklı içerikle
  çakışmadır. `freezeOrderLegalDocuments` mevcut checkout işleminin transaction client'ını alır;
  sipariş, onaylar ve tam belge takımı aynı işlemde yazılır. Pool verilmez.
- Paket için ön bilgilendirme + mesafeli satış; abonelik için ön bilgilendirme + abonelik zorunludur.
  Geçmişte snapshot yoksa güncel dosyadan doldurulmaz. Hazırlayıcı yalnız yayıma onaylı, bağlayıcı
  Türkçe kaynağı ve kabul edilen sürümü kullanır; bu ADR hukuki yayın kapısını açmaz.

`GET /v1/me/orders/{orderId}/legal-documents` kendi siparişinin tam takımını döndürür; yoksa veya
başkasınınsa 404. Yanıt `{documents:[{slug,version,text,sha256}]}` ve `private, no-store` zorunludur.
Kişisel alanların ayrı iç depo nesnesi API'ye çıkarılmaz; metin zaten alıcı bilgisi içerebilir.

### Teslim kanıtı

`order_legal_document_deliveries`: sipariş başına tek değişmez satır; kullanıcı, gerçek sağlayıcı
mesaj kimliği ve kabul zamanı. Boş kimlik, ileri tarih, sahiplik uyuşmazlığı ve eksik belge takımı
reddedilir. `recordOrderLegalDocumentDelivery` aynı sağlayıcı kimliğinin tekrarını kabul eder,
çelişen kaydı reddeder. Kuyruğa almak veya SMTP ayarı olmaması başarılı teslim değildir.

Sağlayıcı kabulü ve yerel SQL işlemi dağıtık bir atomik işlem değildir. İşçi siparişe göre tekilleştirir,
sağlayıcının desteklediği idempotency veya sabit Message-ID kullanır; kabul sonrası süreç çökmesinde
aynı postanın yeniden gitmesi mümkündür. Yerel teslim kanıtı yalnız gerçek kabulden sonra yazılır.
Güvenilir sağlayıcı kabulü olmadan kayıt üretilmez. `notices.sent_at` yalnız mevcut kuyruklama anlamını korur.

### Hesap silme tercihi

`MeDeleteInput` kapalı gövdesinde `requestRefund` isteğe bağlıdır; gövde ve alan yoksa true.
`users.deletion_request_refund` NOT NULL DEFAULT true saklanır. Kimlik silme ile birlikte tercihi yazar;
ödeme kancası ve günlük uzlaştırma false değerinde yeni talep açmaz. Önceden açık talep silinmez.

## Sonuçlar ve sınırlar

- Yeni hukuki saklama nesnelerinin süreleri ve saklama sonu kontrollü imha yolu hukuk-uyum incelemesi
  gerektirir. Normal uygulama silmesi değişmez kanıtı silemez; bu karar süresiz saklama onayı değildir.
- Kaynak checksum'u ilk hazırlayıcıda hesaplanabilirse kaydedilir; mevcut helper'da yoksa NULL.
- Eski migration dosyaları değiştirilmez. Testler dolu v1.2'den yükseltme, iki fiyat sürümü, eski
  sipariş/fatura ve abonelik bedeli, hash/yer tutucu, atomik rollback, idempotency ve sahipliği sınar.
- Canlı migration çalıştırılmadı. ADR-0027 onayı Tarık'tan beklenir.
