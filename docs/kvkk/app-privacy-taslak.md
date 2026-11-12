# App Store Connect App Privacy cevap taslağı

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-12 (taslak 2). ios ajanıyla birlikte kesinleşir (plan 16.4).
`apps/ios` depoda henüz yoktur; cevaplar iOS 1.0'ın web ile aynı API'yi kullanacağı varsayımıyla `envanter.md`'den
türetildi ve uygulama yazıldığında ios ajanınca satır satır doğrulanır. Turkuaz Kampüs satırları (ADR-0031) çıkarıldı.
Apple'ın kategori adları App Store Connect arayüzündeki İngilizce adlarıyla yazıldı
[DOĞRULANACAK: kategori adları gönderim anında App Store Connect'ten].

Yol: App Store Connect > Apps > Kazuist > App Privacy > Get Started (veya Edit), cevaplar girildikten sonra Save, sonra Publish.

Privacy Policy URL: https://kazuist.com/hukuki/gizlilik (gizlilik metni yayımlanmadan gönderim yapılmaz).

Do you or your third-party partners collect data from this app? Yes.

| Apple veri türü | Toplanıyor mu | Kaynak (şema) | Kullanım | Kimliğe bağlı | Takip |
|---|---|---|---|---|---|
| Contact Info > Email Address | Evet | users.email | App Functionality | Evet | Hayır |
| Contact Info > Name | Evet, kredi satın alımında zorunlu | users.name | App Functionality | Evet | Hayır |
| User Content > Other User Content | Evet | library_items.note, writing_projects, writing_logs.note | App Functionality | Evet | Hayır |
| User Content > Other User Content (yüklenen belge) | Evet, yazma aracında kılavuz | Dosya bellekte okunur; çıkarılan kurallar ve alıntılar template_rules, template_rule_evidence | App Functionality | Evet | Hayır |
| Identifiers > User ID | Evet | users.id, appAccountToken | App Functionality | Evet | Hayır |
| Purchases > Purchase History | Evet | iap_transactions, orders | App Functionality | Evet | Hayır |
| Identifiers > Device ID | [DOĞRULANACAK: APNs belirteci Apple tanımında Device ID sayılıyor mu] | push_subscriptions | App Functionality | Evet | Hayır |
| Search History | Hayır: arama ve özet soruları veri tabanına yazılmaz, log yalnız meta veri tutar (packages/ai-gateway/src/observe.ts); kayıt sayfası "Kaydettiklerim" kullanıcı içeriğidir | | | | |
| Usage Data, Diagnostics | Hayır (analitik ve hata SDK'sı yok). Hata raporlama SDK'sı eklenirse Diagnostics > Crash Data eklenir | | | | |
| Location, Health, Financial Info, Contacts, Browsing History, Sensitive Info | Hayır. Kart verisi Kazuist'e gelmez | | | | |

Tracking: Hayır. Üçüncü taraf reklam ve veri aracısı yoktur.

BYOK: kullanıcı kendi anahtarıyla doğrudan sağlayıcıyı çağırdığında içerik Kazuist'e gelmez; ancak
doğrulama sunucuda yapılır (plan 8.1), bu yüzden özet satırları sunucuya gelir: User Content kapsamında kalır.

Pratik ilerlemesi web'de tarayıcıda tutulur; iOS'ta SwiftData ile cihazda tutulursa toplama sayılmaz, sunucuya
eşitlenirse User Content satırına eklenir (ios ajanı karar verir).
