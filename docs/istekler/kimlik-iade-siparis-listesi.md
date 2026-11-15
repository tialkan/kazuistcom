# İstek: hesap sayfasından sipariş bazında iade talebi için sipariş listesi

- İsteyen: kimlik. Dal: `kimlik/v1-5-atif-bildirim-iade`. Tarih: 14 Kasım 2026.
- Kime: odeme (uygulama), mimar (yeni uç gerekirse sözleşme). review.md P8 madde 3, hukuk-uyum-p5-tutarlilik.md
  madde 4 ikinci alt madde.

## Bugün ne var

- Kimlik bu dalda `/hesap/iade` sayfasını ve `/hesap` üzerindeki "İade talebi" bağlantısını ekledi. Sayfa iade
  kuralını (`content/hukuki/tr/iade-ve-kredi.md` madde 5, `on-bilgilendirme.md` madde 6), kayıtlı e-posta adresini,
  `teknoloji@kulular.com` adresine hazır konulu e-posta bağlantısını (ön bilgilendirme formundaki cayma bildirimi
  yolu) ve iade kurallarına bağlantıyı gösterir.
- `POST /v1/refund-requests` (odeme) `orderId` ister. Kullanıcının sipariş kimliklerini görebileceği bir uç ya da
  ekran yok (`/v1/invoices` fatura kimliği döner, sipariş kimliği değil).

## İstenen

1. Kullanıcının kendi siparişlerini listeleyen bir okuma: ya sözleşmeye `GET /v1/orders` (sipariş kimliği, ürün
   adı, tarih, tutar, iade uygunluğu: 14 gün ve kullanılmamış kredi) ya da odeme'nin `BillingService` üzerinde bir
   okuma işlevi (sunucu sayfası doğrudan çağırır, yeni uç gerekmez).
2. Bu gelince kimlik `/hesap/iade` sayfasına sipariş seçip `POST /v1/refund-requests` (Idempotency-Key ile)
   gönderen formu ekler; e-posta yolu kalır.

## Geriye uyumluluk

Ek uç ya da yalnız sunucu işlevi; kırıcı değil.

## Aciliyet

Yayını engellemez: cayma bildirimi e-postayla mümkündür ve sayfa bunu gösteriyor. Uygulama içi talep P8 kapsamında.
