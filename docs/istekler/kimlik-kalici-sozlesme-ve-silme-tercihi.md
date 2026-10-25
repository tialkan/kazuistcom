# Kalıcı sözleşme ve hesap silme tercihi

İsteyen: kimlik, `codex/belge-teslim`, 2026-10-25. Dayanak: plan 9.2/8, 4.5/12, O6 ve O9.
Hukuki metin yayım onayı verilmedi; mevcut taslaklar ve künye boşlukları geçilmez.

## Mimar: kalıcı, değişmez sipariş belgeleri

`order_legal_documents`: PK `(order_id, slug)`; sipariş ve kullanıcı ilişkisi, `version`, `filled_text`,
`sha256` (UTF-8 filled_text özeti), `fields` (satın alma anındaki alıcı, sipariş, ürün, fiyat tablosu ve
abonelik dönemi alanları), `created_at`. Sluglar `on-bilgilendirme`, `mesafeli-satis`, `abonelik`.
Mümkünse onaylı kaynak gövde özeti de saklanır. Kayıtlar güncellenemez ve silinemez; ilk yazım atomik,
tekrar aynı içerikle idempotent, farklı içerikle çakışma. Onay kaydı ve siparişle aynı işlemde yazılmalı.
Kişisel alanlar yalnız Türkiye'deki mevcut veri tabanında; iş kuyruğu ve dış push'a konmaz.

Checkout öncesi yalnız `status: yayinda`, bağlayıcı Türkçe metin, onaylanan sürümle eşleşen ve bütün
PDF alanları dolu kaynak kabul edilir. `legalPublishBlockers`, `legalPdfMissingFields` uygulanır.
Sonradan dosya, künye, alıcı adı veya fiyat değişmesi geçmiş PDF'i değiştirmemeli. Eski siparişte snapshot
olmaması güncel metinden sessizce doldurulmaz; gönderim hata verir ve yeniden denemeye kalır.

Ödeme ajanı: checkout sırasında `createLegalSnapshot` sonucu metin/alan/hash'i yukarıdaki depoya kaydetme
portu; worker için orderId+userId ile belgeleri okuma portu. Tam belge takımı beklenir: paket için iki,
abonelik için ön bilgilendirme ve abonelik metni (mesafeli satış gerekiyorsa üçüncü belge).

## Mimar: silme isteği

`DELETE /v1/me` için opsiyonel gövde `MeDeleteInput = strictObject({ requestRefund: boolean.optional() })`.
Gövde yoksa eski istemciler korunur, `requestRefund` varsayılan true. Beklenmeyen alanlar reddedilir.
Yeni UI wallet API'deki gerçek `balance` ve `lots[source=paket].remaining` toplamını gösterir; yükleme
başarısızsa tahminî sıfır göstermez. İade talebi tercihi silme isteğinde sunucuya gider.

Ödeme ajanı: `onAccountDeletion(userId, { requestRefund = true }?)`; false yalnız yeni talep açmayı
engeller, önceden açık talebi silmez. Tercih kalıcı olmalı ve günlük `reconcileDeletedAccounts` bunu
korumalı. Kimlik `AccountHooks.onDeletion` ve `deleteMe` üzerinden tercihi aktarır ve denetim kaydeder.

## PDF ve teslimat

Ledger için `pdf-lib` ve `@pdf-lib/fontkit` (MIT) bağımlılıkları gerekir; kök lock entegrasyonu orkestra.
Resmî DejaVu Sans 2.37 TTF ve lisansı `packages/ledger/assets/fonts/` altında hazır; resmî arşiv SHA256
birebir doğrulandı. En az 12pt, gömülü Türkçe font, sayfa bölme ve görsel render doğrulaması yapılacak.
Worker bundle/Docker image içine bu fontun deterministik yol ile taşınması gerekir (orkestra/altyapı).

`EmailMessage.attachments` PDF bytes + filename + contentType taşıyacak; nodemailer bu alanı iletecek.
Sözleşme bildirimi eksik snapshot, eksik alan, hash uyuşmazlığı veya yapılandırılmamış e-posta durumunda
başarılı sayılmayacak; genel ödeme metnine düşerek iş tamamlanmayacak. Dış push yalnız genel metin.
`notices.sent_at` bugün kuyruğa alınmayı gösterir; gerçek sağlayıcı kabulü ayrıca `delivered_at` veya
belge teslim kaydında (provider message id ile) saklanmalı. Sağlayıcı hatası yeniden denenir. Anahtar
olmadan gerçek teslim kanıtı yazılmaz. Hesaptan belge erişimi yalnız kendi kullanıcısına yetkilendirilir.
