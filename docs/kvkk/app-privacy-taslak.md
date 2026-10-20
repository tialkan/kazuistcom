# App Store Connect App Privacy cevap taslağı

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19 (taslak 1). ios ajanıyla birlikte kesinleşir (plan 16.4).
Cevaplar iOS 1.0'ın gerçek veri akışından verilir; aşağıdaki tablo şemadan (envanter.md) türetildi.
Apple'ın kategori adları App Store Connect arayüzündeki İngilizce adlarıyla yazıldı
[DOĞRULANACAK: kategori adları gönderim anında App Store Connect'ten].

Yol: App Store Connect > Apps > Kazuist > App Privacy > Get Started (veya Edit), cevaplar girildikten sonra Save, sonra Publish.

Privacy Policy URL: https://kazuist.com/hukuki/gizlilik

Do you or your third-party partners collect data from this app? Yes.

| Apple veri türü | Toplanıyor mu | Kaynak (şema) | Kullanım | Kimliğe bağlı | Takip |
|---|---|---|---|---|---|
| Contact Info > Email Address | Evet | users.email | App Functionality | Evet | Hayır |
| Contact Info > Name | Evet, isteğe bağlı | users.name, kampus.profiles.display_name | App Functionality | Evet | Hayır |
| User Content > Other User Content | Evet | aramalar, library_items.note, writing_projects, kampus.posts | App Functionality | Evet | Hayır |
| User Content > Other User Content (yüklenen belge) | Evet | kampus.files, template_rules.source_object_key | App Functionality | Evet | Hayır |
| Identifiers > User ID | Evet | users.id, appAccountToken | App Functionality | Evet | Hayır |
| Purchases > Purchase History | Evet | iap_transactions, orders | App Functionality | Evet | Hayır |
| Identifiers > Device ID | [DOĞRULANACAK: APNs belirteci Apple tanımında Device ID sayılıyor mu] | push_subscriptions | App Functionality | Evet | Hayır |
| Usage Data, Diagnostics | Hayır (iOS'ta analitik ve hata SDK'sı yok). Hata raporlama SDK'sı eklenirse Diagnostics > Crash Data eklenir | | | | |
| Location, Health, Financial Info, Contacts, Browsing History, Sensitive Info | Hayır. Kart verisi Kazuist'e gelmez | | | | |

Arama sorguları: "Search History" kategorisi ayrıca değerlendirilir; sorgular hesapla ilişkilendirilerek
saklanıyorsa işaretlenir [DOĞRULANACAK: casuist ajanından sorgu saklama davranışı].

Tracking: Hayır. Üçüncü taraf reklam ve veri aracısı yoktur.

BYOK: kullanıcı kendi anahtarıyla doğrudan sağlayıcıyı çağırdığında içerik Kazuist'e gelmez; ancak
iOS'ta doğrulama sunucuda yapılır (plan 8.1), bu yüzden özet satırları sunucuya gelir: User Content kapsamında kalır.
