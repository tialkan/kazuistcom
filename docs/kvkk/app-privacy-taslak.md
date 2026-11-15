# App Store Connect App Privacy cevap taslağı

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-15 (taslak 3). ios ajanıyla birlikte kesinleşir (plan 16.4).
`apps/ios` depoda henüz yoktur; cevaplar iOS 1.0'ın web ile aynı API'yi kullanacağı varsayımıyla `envanter.md`'den
türetildi ve uygulama yazıldığında ios ajanınca satır satır doğrulanır. Turkuaz Kampüs satırları (ADR-0031) çıkarıldı.
Web'in ilk yayını dar çekirdektir (ADR-0038): Pratik, Kalemcik ve atıf ağı gizli, kredi satışı kapalı. iOS ilk
sürümü de aynı kapsamla gönderilirse aşağıdaki "kapsama göre" notları geçerlidir; Apple'a cevap, gönderilen
derlemenin gerçekte topladığı veriye göre verilir.
Apple'ın kategori adları App Store Connect arayüzündeki İngilizce adlarıyla yazıldı
[DOĞRULANACAK: kategori adları gönderim anında App Store Connect'ten].

Yol: App Store Connect > Apps > Kazuist > App Privacy > Get Started (veya Edit), cevaplar girildikten sonra Save, sonra Publish.

Privacy Policy URL: https://kazuist.com/hukuki/gizlilik (gizlilik metni yayımlanmadan gönderim yapılmaz).

Do you or your third-party partners collect data from this app? Yes.

| Apple veri türü | Toplanıyor mu | Kaynak (şema) | Kullanım | Kimliğe bağlı | Takip |
|---|---|---|---|---|---|
| Contact Info > Email Address | Evet | users.email | App Functionality | Evet | Hayır |
| Contact Info > Name | Evet (users.name hesapta tutulur; kredi satışı açıldığında satın almada zorunlu) | users.name | App Functionality | Evet | Hayır |
| User Content > Other User Content | Evet | library_items.note; Kalemcik açıksa writing_projects, writing_logs.note | App Functionality | Evet | Hayır |
| User Content > Other User Content (yüklenen belge) | Evet, yazma aracında kılavuz | Dosya bellekte okunur; çıkarılan kurallar ve alıntılar template_rules, template_rule_evidence | App Functionality | Evet | Hayır |
| Identifiers > User ID | Evet | users.id, appAccountToken | App Functionality | Evet | Hayır |
| Purchases > Purchase History | Kapsama göre: iOS derlemesinde uygulama içi satın alma varsa Evet, yoksa Hayır (web'de kredi satışı ilk yayında kapalı) | iap_transactions, orders | App Functionality | Evet | Hayır |
| Identifiers > Device ID | [DOĞRULANACAK: APNs belirteci Apple tanımında Device ID sayılıyor mu] | push_subscriptions | App Functionality | Evet | Hayır |
| Search History | Hayır: arama ve özet soruları veri tabanına yazılmaz, log yalnız meta veri tutar (packages/ai-gateway/src/observe.ts); kayıt sayfası "Kaydettiklerim" kullanıcı içeriğidir | | | | |
| Usage Data, Diagnostics | Hayır (analitik ve hata SDK'sı yok). Hata raporlama SDK'sı eklenirse Diagnostics > Crash Data eklenir | | | | |
| Location, Health, Financial Info, Contacts, Browsing History, Sensitive Info | Hayır. Kart verisi Kazuist'e gelmez | | | | |

Tracking: Hayır. Üçüncü taraf reklam ve veri aracısı yoktur.

BYOK: web'de anahtar yalnız tarayıcıda (sessionStorage, seçimle localStorage) tutulur ve Kazuist'e gitmez; maskeli
paket tarayıcıdan doğrudan OpenRouter'a gider. Soru `prepare` ucuna, özet cümleleri doğrulama için `verify` ucuna
gelir ve saklanmaz (ara/_sunucu/ozet.ts `savedId: null`); Apple'ın "toplama" tanımı veriyi isteğe cevap verecek
süreden uzun tutmayı ölçtüğü için [DOĞRULANACAK: App Store Connect yardım sayfasındaki "collect" tanımı, gönderim
anında] bu akış User Content satırına eklenmeyebilir. iOS'ta anahtarın Anahtar Zinciri'nde tutulması toplama
değildir; iOS BYOK'u yazılırsa ios ajanı aynı akışı doğrular.

Pratik ilerlemesi: Pratik ilk yayında gizli. Açıldığında web'de tarayıcıda tutulur; iOS'ta SwiftData ile cihazda
tutulursa toplama sayılmaz, sunucuya eşitlenirse User Content satırına eklenir (ios ajanı karar verir).
