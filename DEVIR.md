## 27 Ekim 2026, ödeme, silme iadesi yönetimi (codex/silme-iade-yonetimi)

ADR-0028 önerisinin beş admin ucu gerçek BillingService/PgBillingStore akışına bağlandı.
Karar, özgün tahsilat/kalan kredi kalemleri ve kısmi tutmalar tek transaction'da; sağlayıcı çağrısı
transaction dışında ve CAS ile tekil. Belirsiz sonuç otomatik yeniden gönderilmez; ayrı admin
kalem çözümü aktör/gerekçe/sağlayıcı referansıyla kaydedilir. Eski belirsizlik kuyruğu bu kalemleri dışlar.
İşlem anahtarı aktör/operasyon/hedef/gövdeye kalıcı bağlanır. Passkey/TOTP, strict body, rate,
private no-store ve audit aktörü gerçek guard/PGlite testinde sınandı.

Tutar BigInt ile tüketici lehine kuruşa yuvarlanır ve geçmiş iade maruziyetiyle sınırlanır.
Açık rezervasyon varken chargeback409 döner; iade tutmasının yanlış borç sayılması önlenir.
Önce sağlayıcı belirsizliği çözülür; başarılı kısmi iade sonrası chargeback yalnız harcanan payı borçlandırır.
Fatura gerekliliği ledger tamamlanırken kalıcı audit uyarısına yazılır. Mevcut e-Arşiv adaptöründe
idempotency/requery API'si olmadığı için crash sonrası otomatik fatura resend eklenmedi;
entegratör seçimi ve fatura outbox/kurtarma ayrı açık iştir. Finansal iade tamamlandı ifadesi
faturanın dış sağlayıcıda kesildiği iddiası değildir.

Yerel ledger154, billing route12, typecheck/lint/metin ve üretim build doğrulandı.
GitHub CI billing limiti açık; yeşil sayılmadı, birleşmedi. Canlı iade/migration/ağ işlemi yok.

## 27 Ekim 2026, mimar, silme iade sözleşmesi 1.4 (codex/mimar-silme-iade)

ADR-0028 ÖNERİ, Tarık onayı bekliyor. ADR-0027 dosyası değiştirilmedi; onay kaydı root43 dalındadır.
Migration0006 mevcut FK'leri korur; karar reason/key/hash ve orijinal paket başına immutable allocation
kalemi ekler. Tam tüketici lehine kuruş üst sınırı, gerçek tahsilat/kalan kredi/sahiplik ve diğer iade
riski DB'de doğrulanır. Karar ve kalem değişimleri aktör/gerekçeyle append-only audit'e girer.
Belirsiz kalem tamamlanmaz; başarılı payment kanıtı olmadan basarili olamaz. Tamamlanan talebin tutarı
başarılı kalem toplamıyla aynı olmalıdır. Audit TRUNCATE da engellenir.

Sözleşme iki GET/üç POST tanımlar; admin/passkey/TOTP, strict body, Idempotency-Key ve aktörün
sunucudan gelmesi şarttır. Route/partial ledger/sağlayıcı entegrasyonu ödeme ajanının ayrı işidir;
bu PR o uygulamayı tamamlandı saymaz. Ayrıntı docs/istekler/mimar-silme-iade-v1-4.md.

Kanıt: tetikleyicisiz karar geçişi kabulü kırmızıydı; yeni guard'larla dolu1.3 yükseltme8/8,
DB43/43, contracts127/127; tam Node636 geçti/3 ortam testi atlandı. Build/typecheck/lint,
OpenAPI lint ve check:text geçti. Audit TRUNCATE eklemesinden sonra DB43 yeniden geçti.
GitHub CI hesap/billing limiti orkestrada açık kapıdır; dört iş başarılı diye yazılmadı ve kör
workflow yeniden başlatılmadı. Canlı migration, sandbox veya canlı para iadesi yapılmadı.


## Orkestra son aday ölçümü, 27 Ekim 2026

Birleşik aday1a97d36 için izole kalite: JS569/Python143/enjeksiyon60 geçti, toplam6skip; tip/lint/biçim/metin/OpenAPI/build ve güvenlik taramaları temiz. Bağımsız76test ve gerçekPG18 SIGKILL kurtarma geçti. Ayrıntı docs/kalite/dalga-1.md üst bölümündedir. Kapı5/9 açık; staging/sandbox/bağlayıcı/hukuki hazırlık ve gerçekSMTP kabulü eksik. O9 yönetici iade işi ayrı dalda sürer, ADR28 öneridir. CI hesap engeli kalkmadı; hiçbir PR bu nedenle kapı atlanarak birleştirilmedi. Kullanıcının public sorusu görünürlük onayı sayılmadı; depo PRIVATE kalır. Ücretsiz özellik/BYOK ve isteğe bağlı platform kredisi modeli ayrı karar önerisinde hazırlanıyor.

## Orkestra CI hesap engeli, 27 Ekim 2026

GitHubActions run40405096283 sonHEAD50d0c15 için dört işi de2-3saniyede ve sıfır adımla failure yaptı. Jobannotation: recentaccountpaymentsfailed veya spendinglimit artırımı gerekiyor. Kullanıcıya https://github.com/settings/billing > Billing and licensing / Budgets and alerts > Actions hesabıadımı verildi; ödeme/kart/token değeri istenmedi. Kör tekrar veya kapıgevşetme yok. ADR27 onaylıdır, ancak43 sonHEAD dörtgreenolmadanbirleşmez. Yerel geliştirme/test ve O6/O9 işleri devameder.
## 27 Ekim 2026, kimlik: gerçek ödeme öncesi metin ve silinmiş hesapta sözleşme teslimi

`codex/checkout-metin`, birleşik aday 50d0c15 üstünde ayrı inceleme değişikliğidir; PR42 değiştirilmedi.
Ödeme ekranı yer tutucu yerine aynı yayımlanmış Türkçe kaynağın gövdesini ve kabul edilecek sürümünü
birlikte gösterir. Paket/abonelik başlığı kaynak metinden gelir. Gerçek oturum adı/e-postası ve seçili
ürünün alanları `orderFields`/`fillLegalDoc` üzerinden hazırlanır; geçmiş PDF yeniden üretilmez. Eksik
ad/soyadda tahminî alıcı yazılmaz. Taslak, boş künye, eksik alan, yanlış sürüm veya sözleşme türünde
metin ve ödeme kapalıdır. İçerik/tutar değişirse kutu onayları yeniden alınır. Tablo ve kod dahil gövdede
en az 12pt korunur. Teyit/cayma kutuları ve ürün adları i18n üzerinden gerçek metindir. Hukuki yayım
onayı verilmedi; mevcut canlı kaynaklar bu kapıyı aşmaz.

Sözleşme işi, genel `deleted_at` kontrolünden önce yalnız sipariş sahibi ve değişmez belge takımından
çözülür. Alıcı yalnız her iki snapshot'ın aynı ve geçerli `ALICI_EPOSTA` alanıdır; güncel kullanıcı
e-postasına veya başka bir varsayılana dönülmez. Böylece ödeme sonrası silinen hesapta sözleşme işi
atlanmaz. Diğer ödeme, takip ve kampanya bildirimleri silinmiş kullanıcıda hâlâ `no_user` ile atlanır;
dış push'a özel sözleşme içeriği gitmez. Eksik/bozuk/çelişen alıcıda gönderim ve teslim kaydı yoktur.

Kanıt: yer tutucu+yanlış başlık ve silinmiş hesapta atlanan sözleşme için önce kırmızı testler, sonra
yeşil regresyonlar. Web 111 geçti/1 mevcut skip; worker 47 geçti. İki uygulamanın typecheck ve üretim
derlemesi geçti; değişen kod ESLint, tam Prettier ve metin kontrolü temiz. Tarayıcıda yayımlanmış
sentetik fikstürle 375/768/1440px görüntü, WCAG2A/AA+2.1AA axe 0 ve gövde/tablo/kod alt sınırı 16px
(12pt) doğrulandı. Görünen üç sürüm fake checkout POST'uyla aynı; gerçek /odeme kapalı kaldı. Yerel
fikstür rotası kaldırıldı. Kanıt dizini: Codex visualizations/2026/10/25/
01a1736a-3c34-7d40-ae4e-8f8808e87e0c/checkout-metin. SMTP testleri taklittir; canlı gönderim yapılmadı.
CI hesap faturalama sınırı nedeniyle root tarafından bloklu bildirildi; yeniden çalıştırma tetiklenmedi.

## Orkestra, 27 Ekim 2026

Kullanıcı ADR-0027'yi açıkça onayladı. Kabul kaydı bu dalda işlendi; hukuki metin yayını ve canlı migration izni çıkarılmaz. PR44/45 dörder tamamlanmış yeşil CI işiyle main fef96e3'e alındı. Birleşik43 adayı main ile güncellendi; sonHEAD dört CI işi tamamlanmadan birleşmez. Eski38/41/42PR'ları aynı kapsamın kaynaklarıdır, birleşik43 sonrasında yinelenen değişiklik olarak kapatılacak.

O6gerçek ödemeöncesi metin gösterimi ve silinmiş kullanıcıya kalıcı sözleşme teslim yarışı kimlikte; O9iade taleplerinin yönetici kararı/ödeme akışı ödeme+mimarın ayrıworktree'lerinde sürüyor. YeniADR0028 öneri kalır. Güncel Dalga1kapısı5/9; sonraki dalga başlamadı. İyzico aktivasyon yanıtı, gerçekuygulama sandbox/staging, bağlayıcılar ve hukuki hazırlık açık.

## 26 Ekim 2026, kimlik: kalıcı PDF teslimi ve hesap silme tercihi (codex/belge-teslim)

O6 teknik hat tamamlandı: satın alma anındaki onaylı Türkçe sürüm ve alanlar snapshot olarak doğrulanır;
PDF yalnız hash ve tam belge takımı kontrolünden geçen kayıttan üretilir. Gömülü DejaVu Sans, 12 punto,
sayfa bölme ve sayfa numarası vardır. SMTP PDF eklerini taşır; sağlayıcının alıcıyı kabul etmesi ve
messageId dönmesi sonrasında teslim kaydı yazılır. Gönderim yoksa, kayıt eksikse veya bozuksa iş hata
verir; genel ödeme metniyle tamamlanmaz. Order kilidi paralel gönderimleri sıralar, kayıtlı teslim
tekrarı göndermez. SMTP kabulü ile DB commit atomik değildir; bu aralıktaki hata aynı Message-ID ile
tekrar denemeye yol açabilir, sağlayıcı seviyesinde tam bir kez teslim garantisi verilmez.

Kendi siparişinin kalıcı metinlerine erişim ucu private/no-store ve IDOR kontrollüdür. O9 silme ekranı
wallet API'den gerçek bakiye ve kullanılmamış paket toplamını gösterir. İade tercihi strict DELETE gövdesiyle
users.deletion_request_refund alanına silme durumu ile aynı güncellemede yazılır ve kancaya iletilir.
Gövdesiz eski istemcilerde varsayılan true. Ödeme ajanının atomik checkout ve günlük tercih kurtarma
entegrasyonu bu dalın bağımlılığıdır; ödeme dosyaları o ajanın commitlerinden alındı.

Doğrulama: web 92 geçti/1 mevcut skip, worker 43 geçti (SMTP alıcı kabulü/ID sınırları dahil), ledger 134 geçti; sonra eklenen onaylı alıntıyı
koruma testiyle belge hedefli 7 test geçti. Web ve worker üretim derlemesi, tipler ve değişen kod lint
kontrolü geçti. PDF iki sayfa Poppler ile render edilip gözle incelendi; metin çıkarımı Türkçe glifleri,
12.00pt alt sınırını ve gömülü fontu doğruladı. Silme ekranı 375/768/1440px, mock wallet ve iade opt-out
isteğiyle doğrulandı; yeni bölümün WCAG2A/AA ve 2.1AA axe sonucu 0. Yerel kanıtlar Codex
visualizations/2026/10/25/01a1736a-3c34-7d40-ae4e-8f8808e87e0c/belge-teslim dizinindedir.

Canlı gönderim yapılmadı. Hukuki taslak/yayım kapısı korunur; ADR-0027 ve hukuki yayım onayları hâlâ
beklenir. Root katkısı: worker direct PDF bağımlılıkları, font build kopyası ve Docker font yolu.
## Dalga 1, ödeme, checkout snapshot ve silme tercihi entegrasyonu, 2026-10-26

Durum: `codex/odeme-snapshot-deletion`; şema 0005/mimar `1b49422` ve snapshot helper/kimlik
`db10a07` bağımlılıkları dala birleştirildi. Ödeme uygulaması `47ce6c4` kimliğe iletildi.
Checkout önce kabul edilen metin sürümünü, gerçek tutarı ve alıcı alanlarını dondurur; draft,
eksik alan veya değişen sürüm sağlayıcı formu açılmadan reddedilir. Sunucu production context'i
snapshot factory olmadan checkout açmaz. Paket ön bilgi+mesafeli satış, abonelik ön bilgi+abonelik
takımı, kaynak ve dolu metin SHA-256 özetiyle saklanır. PDF/worker belge dosyalarına dokunulmadı.

`PgBillingStore.saveCheckout`: order, tüm consent satırları ve freezeOrderLegalDocuments aynı
transaction client'ıyla yazılır; hatada tamamı rollback olur. Özel snapshot satırı içerebilen SQL hata
detayları API/log hatasına taşınmaz. İdempotent checkout replay mevcut order sonucunu kullanır;
geçmiş belge güncel dosyadan üretilmez. Depo helper'ı runtime kullanıldığı için ledger `@kazuist/db`
bağımlılığı dev'den runtime'a alındı; yalnız ledger lock importer taşıması orkestra yetkisiyle yapıldı.

`onAccountDeletion(userId,{requestRefund?:boolean})`: false seçimi canlı abonelik iptalini korur,
iade talebi açmaz. Seçim verilmezse users.deletion_request_refund okunur (varsayılan true).
Günlük kurtarma false tercihli yalnız paket hesabını seçmez; canlı aboneliği varsa iptal eder.
Tercihin kullanıcı silme kaydıyla atomik yazılması kimlik ajanındadır.

Kanıt: önce snapshot takım kaydı ve rollback testleri 2 kırmızıydı. Son PGlite 6/6, web factory 2/2;
ana senaryolarla hedefli 20/20. Tam Node workspace 626 geçti, 3 ortam testi atlandı; typecheck,
lint ve check:text yeşil. Build ilk turda DB barrel'in migration URL çözümü nedeniyle kırıldı;
mimar c2f7b95 alt yol export'u ve ödeme 37ac0f6 import düzeltmesiyle yeniden build geçti.
Gerçek ödeme/ağ/sır çağrısı yok. O8 rapor/mutabakat işi orkestradadır.

## 25 Ekim 2026, güvenlik bağımlılık düzeltmesi (codex/guvenlik-bagimlilik)

O-09 tarama hataları artık kapıyı kapatır; CLI ikizleriyle kırmızı/yeşil regresyon kanıtı var. pypdf6.21.2,
setuptools84.2.1 ve optimum bağımlılığı kaldırılarak transformers5.16.1: gerçek all-extras pip-audit 0.
Python145 geçti/1 optional skip; küçük offline ONNX dinamik şekil testi yeşil. Akdeniz50belge eski/yeni
runtime PERSON440/440 eş; Hushmark402paragraf span1.0. GLiNER yeni-yığın tam export disk28 nedeniyle
geçmedi; yeni Torch vs mevcut ONNX20belge span1.0 (150span), skor fark2e-5. CI/final tam tarama ve bağımsız denetim bekleniyor, birleşmedi.
Kanıt ve açık işler: docs/istekler/kalite-bagimlilik.md. Eski model cache ve runtime kodu değişmedi.

## Orkestra güncel durum, 26 Ekim 2026

Main f41457d temiz; PR35/36/37/39/40 dört completed/success CI işi sonrası birleşti. Beş ADR onayı kaydedildi, plan düzeltildi, iyzico aktivasyon e-postası kayıtlı hesaptan26Ekim00:32 gönderildi ve Gönderilenler doğrulandı. Gerçek readonly sandbox raporuyla kimlik/kısmi iade eşlemesi düzeltildi; bağımsız O-N4 sayfalama açığı da kapandı.

PR38(schema/ADR27),41(checkout/deletion),42(PDF/delivery/UI) birleşik43adayında9c37234 tabanında toplandı. Root bütün workspace test/tip/lint/metin/build kontrollerini geçirdi; ledger144, DB35, contracts121, web94, worker43. Yeni esbuildyaması44 ayrıca adayda birleştirildi; son CI/bağımsız kalite beklenir. ADR27 onayı henüz yok; üretim migration ve hukuki yayım yapılmaz.

Bağımsız denetimin O6yer tutucu gösterim ve O9silme iadesi yönetimi kalanları için kimlik/ödeme/mimar ayrı worktree'lerde sürüyor. İade yönetimi yeni ADR28 önerisi gerektirir; kabul varsayılmaz. Güncel gate5/9; staging, gerçek uygulama sandbox, stagingbağlayıcıları ve hukuki hazırlık açık. Künye üç alanı henüz boş, değerler yazdırılmadı. Tek kullanıcı listesi docs/istekler/orkestra-onaylar-2026-10-25.md. Dalga2 başlamadı.

# Devir kaydı

En üstteki bölüm günceldir. Her ajan işini bitirince kendi bölümünü en üste ekler.

## Dalga 1, mimar, kalıcı belgeler ve ürün sürümleri (codex/mimar-kalici-belge), 2026-10-26

PR #38 açık, birleştirilmedi. Sözleşme/db 1.3.0; ADR-0027 öneri, Tarık onayı bekliyor.
Migration0005: ürün kodu tekilliği kalkar, birleşik sürüm tekilliği ve eski ürün UUID ilişkileri kalır;
ürün finansal sürüm alanları değişmez. Kalıcı sipariş belgeleri, SHA-256/sürüm/sahiplik denetimi,
değişmez sağlayıcı kabul kanıtı ve silmede kalıcı iade tercihi eklendi.

`@kazuist/db` freezeOrderLegalDocuments ve recordOrderLegalDocumentDelivery mevcut transaction client alır.
Entegrasyon ayrıntısı `docs/istekler/mimar-kalici-belge-entegrasyonu.md`.
Main PR35 D4 uyumu ve PR37 güvenlik/onay önkoşulları dala alındı; önceki ON CONFLICT(code)
uyumsuzluğu kapandı. Orkestra yetkisiyle ledger D4 testindeki elle DROP satırı IF EXISTS yapıldı;
aynı test 0004 ve 0005 üstünde çalışır.
Doğrulama: DB35/35, contracts121/121; tam Node616 geçti,3 ortam testi atlandı.
Build, tüm typecheck, lint, OpenAPI lint ve check:text geçti. Gerçek Docker/PostgreSQL ölçümü
PR CI'da; dört iş yeşil olmadan birleşmez. Canlı migration ve hukuki yayın yapılmadı.
ADR0027 onayı önceki beş ADR onayından ayrıdır.
## Orkestra, ADR onayları ve teknik açıklar, 26 Ekim 2026

Kullanıcı ADR-0021/0022/0023/0024/0026 kararlarını ve runbook'taki iyzico aktivasyon taslağının gönderimini açıkça onayladı. ADR durumları ve plan 4.5 eşit bölüşüm/gönüllü bildirim atıfları güncellendi. Hukuki yayım onayı verilmedi; künye kullanıcı tarafından doldurulacak. İyzico taslağı kayıtlı hesaptan 26 Ekim 00:32 gönderildi ve Gönderilenler doğrulandı; yanıt bekleniyor. GLiNER yeni export20belge span eşliği1.0; CI37 tam tarama0. Kanıt kalite-bagimlilik isteğinde.

PR #35 (8ee22e9) ve #37 (ef4479a), dörder tamamlanmış yeşil CI işiyle main'e alındı. PR #37 beş ADR kabulünü ve plan düzeltmesini de içerir. Teknik işler ayrı worktree'lerde sürüyor: mimarda kalıcı belge/fiyat sürümleme migration 0005 ve ADR-0027 önerisi, güvenlikte hata yutan tarama ve Python bağımlılık düzeltmeleri, kimlikte PDF/hesap silme entegrasyonu. Yeni ADR-0027 onaylanmış sayılmaz; üretim migration'ı uygulanmaz. Dalga 1 kapısı son ölçümde 5/9, sonraki dalga başlamadı. Biten PR'lar yalnız dört CI işi yeşil tamamlanınca birleştirilecek.
## Dalga 1, ödeme, süresi dolmuş rezervasyon property regresyonu, 2026-10-26

Seed `944090688`: 2 promosyon kredisi, iki ayrı 1 kredilik rezervasyon, 5 dakika ilerleme,
aynı ilk işlem anahtarını tekrar ayırma. `reserve` önce her iki süresi dolmuş tutmayı çözer,
sonra eski anahtarı `already_settled` ile reddeder. Yeni rezervasyon veya tüketim oluşmaz.
Eski property testinin reddedilen komutun en fazla bir transaction yazabileceği varsayımı yanlıştı.
Üretim defter kodu değişmedi. Test artık hata sonrasında yalnız süresi dolmuş eski rezervasyonların
çözümünü ve süresi dolmuş promosyonların temizliğini kabul eder; rezervasyon anahtarları daima tekildir.
Minimal dizi önce kırmızıydı (2 > 1); düzeltme sonrası tam ledger 128/128, typecheck ve test eslint temiz.
PR #35 mevcut yeşil head ile birleştirildi; bu test değişikliği ayrı PR'dadır.

## Dalga 1, ödeme, D3 ve D8 teknik kapanış, 2026-10-25

Durum: `codex/odeme-aciklar`, PR #35 açık; main `1ffbe56` tabanı. Plan 4 ve 9.
D3: fesih/iade istemci anahtarı kullanıcı+işlem bazında kalıcı `idempotency_keys` kaydına ve
hedef dahil gövde SHA-256 özetine bağlandı. Başarılı aynı istek özgün sonucu döndürür; farklı
hedef/mod/gerekçe 409. Çalışan aynı istek 409 verir, tamamlanınca tekrar özgün sonucu alır.
PostgreSQL'de özel havuz oturumunda advisory lock işlem süresince tutulur; süreç ölünce PG
kilidi bırakır, aynı gövdeli sahipsiz pending kayıt iş akışının mevcut iade/fesih korumalarıyla
sürdürülür. Hata sonrası gövde bağı kaybolmaz. Havuzda defter/iş sorguları için bağlantı ayrılır.
Kaynak: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

D8: `/v1/coupons/redeem`, `/v1/admin/chargebacks`, `/v1/admin/price-changes` gerçek servise bağlı.
Admin işlemlerinde yönetici rolü+passkey+TOTP, actor denetim kaydı, hız sınırı, strict zod ve
kalıcı istek anahtarı vardır. Kupon mevcut defter idempotency ve tüketim limitiyle işler.
D4 ikinci migration isteği `docs/istekler/odeme-d4-urun-fiyat-surumu.md`; DB/contracts değişmedi.
Mimar 0005 öncesinde ödeme uyumu bu PR'da: katalog `(code,price_table_id)` çatışma anahtarını kullanır,
aynı sürümün fiyat/kredi/işlem içerik değişimini reddeder; eski order/sub product UUID'si korunur,
yeni sipariş işlem tarihindeki sürümü seçer. İlk abonelik ürünü siparişten taşınır; planRef sürüm bazlıdır.
D4 önce iki yeni test kırmızıydı; son odaklı test 23/23 ve ledger typecheck geçti.
0005 ve hesap silme tercihi/PDF snapshot bağlantıları sonraki ayrı entegrasyondadır.

Kanıt: önce D3 hedefli regresyon 2 başarısız/14; D8 route henüz yokken import hatası.
Düzeltme sonrası odaklı memory 14/14, PGlite 7/7, gerçek guard+servis route 2/2 geçti.
Sahipsiz pending, ayrı depo örnekleri, replay, gövde çatışması, havuz kapasitesi ve kilit bırakma sınandı.
Tam test turu (son iki lock recovery testi öncesi) 601 geçti, 3 ortam testi atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti. Son lock değişikliğinde
ledger typecheck ve küçük hedefli testler yeniden geçti. Disk sınırı nedeniyle yeni büyük build koşulmadı.
Gerçek PostgreSQL session termination testi yerelde yapılmadı; pool yolu protokol taklidi/PGlite ile sınandı.
O8 gerçek sağlayıcı rapor çağrısı orkestradadır; sır veya ağ ödeme çağrısı yapılmadı.
PDF/sözleşme ve worker notice dosyalarına dokunulmadı. Tarık'tan yeni adım gerekmiyor.

## Orkestra devralma ve Dalga 1 yeniden ölçümü, 25 Ekim 2026

Devir alındı. Önceki iki ajanın günlükleri kullanım sınırında durduklarını gösterdi; mimarın kaydedilmemiş
çalışması korunarak tamamlandı. PR #30, #31, #33 ve #32 dörder tamamlanmış yeşil CI işiyle squash
birleştirildi. Son ürün main `219b903`; denetlenen birleşik aday `4457292` ile ürün kodu farkı yok.
CI kanıtı: https://github.com/tialkan/kazuistcom/actions/runs/40202875693.
Son main 219b903 push CI: https://github.com/tialkan/kazuistcom/actions/runs/40203467801, dört iş başarı.

- İki ana iş tamam: ödeme üçüncü denetim ve cevap şekli fikstürleri (#30), sözleşme 1.2/migration 0004 (#31).
- Ek düzeltmeler: teknik iyzico hatasında incelemenin korunması, paket kredili silinmiş hesap kurtarma,
  abonelik onaylarının gerçek form/servis kaydı (#33); ayrıntılı ödeme e-postası, yönetim iade uçları ve
  yalnız genel metin kullanan dış push kanalları (#32).
- Bağımsız son denetim: defter 120, form 3, bildirim 16, yönetici iade yetkisi 8; toplam 147 test geçti.
  Kalite, aynı kontroller ve enjeksiyon 60 ile 207 test doğruladı. D6 migration korumaları 27 testle teyitli.
- Güncel kapı `docs/kalite/dalga-1.md`: 5/9 geçti. Staging, gerçek uygulama sandbox kabulü, staging
  bağlayıcıları ve hukuki hazırlık açık; Dalga 2 başlamadı.
- Ödeme denetimindeki kritik/yüksek bulgular kapalı; orta O6/O8/O9, düşük D3/D4/D8/D9/D-N2/D-N7 sürüyor.
  Bu sayım bağımlılık güvenliğini kapsamaz: Python bulguları ve tarama hata kodu O-07/O-09 olarak açık.
- Sandbox fikstürü gerçek uygulama uçtan uca kabulü değildir. Abonelik 100001 cevabının sebebi kesin değil;
  resmî aktivasyon/durum teyidi e-postası için gönderilmemiş taslak runbook'ta hazır.
- Güncel tek kullanıcı listesi `docs/istekler/orkestra-onaylar-2026-10-25.md`: beş ADR, sandbox hesap adımı,
  eksik künye. `~/Desktop/kazuist-kunye.txt` boş alanlı şablon olarak izin 600 ile hazırlandı.
- ADR onayı alınmış sayılmadı; plan, sürüm etiketi, DNS, canlı ödeme, canlı veri ve App Store değiştirilmedi.
  Eski worktree'ler korundu. Aşağıdaki ajan kayıtlarındaki eski PR durumları tarihsel kayıttır.

## Dalga 1, kalite-guvenlik, yeniden ölçüm, 2026-10-25

Dalga 1 kapısı kapanmadı: 5/9 geçti. Güncel kanıt ve dokuz hüküm `docs/kalite/dalga-1.md` en üstünde; 22 Ekim ölçümü tarihsel korundu. Son ürün main219b903; aynı ürün ağacındaki birleşik4457292 CI40202875693 dört işte yeşil, HTTP72/E2E108 geçti, yükleme20 atlandı. Birleşik 4457292 yerel kalite kontrolü ledger120, notify16, web gate3/admin8 ve enjeksiyon60 geçti. Gerçek staging, uygulama uçtan uca sandbox, beş bağlayıcının staging çalışması ve hukuki hazırlık açık. O-07 Python runtime/extra bağımlılık bulguları ile O-09 tarama exit-kodu açığı raporlandı; yeşil CI bu açıklıkları kapatmaz. Yeni ürün kodu değiştirilmedi.

## Dalga 1, ödeme, dördüncü denetim düzeltmeleri, 2026-10-25

Durum: `codex/odeme-denetim4`, PR açılacak; birleştirme orkestrada ve yeşil CI sonrasında.
Plan 4.5/12 ve 9: Y-N7 için yalnız belgelenmiş 10051/10005 kart retleri siparişi kapatır;
teknik/bilinmeyen `status: failure` sipariş ve kupon durumunu korur, günlük yeniden sorgu hata alarmı üretir.
5122/5124 ödenmemiş token davranışı korundu. Resmî kaynak: https://docs.iyzico.com/ek-bilgiler/hata-kodlari
(2026-10-25 doğrulandı; hata kodu aralığına genelleme yok).
O9: canlı aboneliği olmayan, kullanılmamış paket kredili silinmiş kullanıcı da kurtarma işine alınır;
eski talepler korunur, eşzamanlı yeniden denemeler deterministik UUID ve PK ile tek iade talebi açar.
O5: abonelikte ayrı cayma kutusu API gövdesine taşınır ve sunucuda zorunlu doğrulanır; yıllık taahhüt,
`content/hukuki/tr/abonelik.md` içindeki ayrılmaz bölüm olduğu için aynı metnin sürümüyle gönderilir,
sunucuda doğrulanır ve `yillik_taahhutname` onayına yazılır. Yeni hukuki metin veya sözleşme alanı eklenmedi.
Kırmızı kanıt: önce Y-N7/O9 regresyonları 2 başarısız / 118 test; düzeltme sonrası 119/119 ledger testi geçti.
Son ek 10005 testi dahil ledger 120/120 geçti; PGlite yeniden kontrolü 4/4 geçti.
`pnpm test`: 588 geçti, 3 ortam gerektiren test atlandı (son ek 10005 testi öncesi).
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti; web ödeme gate 3/3.
Gerçek sandbox çağrısı, sır erişimi veya canlı işlem yapılmadı. O6 hukuki metin/PDF/e-posta işi ve önceki
diğer bulgular bu kapsamda kapandı sayılmadı. ADR/hukuki yayın onayı orkestranın birleşik listesinde kalır.

## Dalga 1, mimar, ikinci istek turu (dalga-1/mimar/istekler-2), 2026-10-25

Durum: PR açık, birleştirilmedi. Sözleşme v1.2; ADR-0026 ve güncellenen ADR-0024 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md (ikinci tur).

Doğrulama (güncel main ve PR #30 ile): `pnpm test` 585 geçti, 3 ortam gerektiren test atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm contracts:lint`, `pnpm check:text`, `pnpm build` geçti.
Python `uv run --project services/worker-py pytest services/worker-py/tests -q`: 86 geçti.
Migration testleri 27/27; v1.1 verisinden yükseltme ve defter/parça tetikleyicileri dahil.
Dal commitleri `gitleaks git --redact --log-opts='origin/main..HEAD'` ile temiz.
IFN gövdesi PR #30 ile eşlendi (`paymentId`, `fraudStatus`); `orders.status` CHECK eklenmedi.
Gerçek servisli Docker ölçümü CI'da yapılacak; yerel ortamda Docker yok.


- Migration `0004_v1_2_ledger_guards.sql`: D6 tetikleyicileri (`ledger_transactions` değişmez, `credit_lots` yalnız
  `remaining_credits`), `products (code, price_table_id)` tekil (D4 genişletme adımı), `payments.status` ve
  `notices.kind` CHECK'leri NOT VALID, `records.masked_text` tetikleyicisi (parçaları siler, `embed.chunks` atar).
  v1.1 verisinden yükseltme testi `packages/db/test/migration-0004.test.ts`.
- Dikkat: `credit_lots` ve `ledger_transactions` üzerinde UPDATE, DELETE veya TRUNCATE yapan kod ya da test artık
  hata alır; düzeltme ters kayıtla yapılır.
- Dikkat: `records.masked_text` her değiştiğinde o kaydın parçaları silinir; masked_text yazan her üretici bunu
  bilmeli (aynı metni yeniden yazmak tetiklemez).
- D4 daraltma adımı ve iki CHECK'in VALIDATE edilmesi sonraki migration'lardır (odeme deposu ve staging verisi).
- OpenAPI: iki iyzico dönüş ucu yalnız 303 döndüğü için `.redocly.lint-ignore.yaml` (lint) ve `redocly.generate.yaml`
  (üretici) içinde açık istisna; başka istisna eklenmemeli.
- worker-py `ner-runtime` ekstrası kilitli; imaj işi altyapıda.
- Orkestra talimatıyla değişen sahip dışı dosyalar: `apps/web/src/app/(odeme)/odeme/page.tsx`,
  `odeme/donus/page.tsx` (tekil main), `services/worker-py/pyproject.toml` ve `uv.lock` (ner-runtime).

## Dalga 1, kimlik, ödeme bildirimleri ve bekleyen iadeler, 2026-10-25

Y-N8: ödeme ayrıntısı yalnız e-postada; Web Push ve APNs genel metni kullanır. Önce kırmızı
regression tutar/tarih sızıntısını üretti, düzeltmeden sonra iki push ve e-posta aynı testte doğrulandı.
Worker 34 test, typecheck, build, ESLint ve check:text geçti.

Y5: notify dispatch ödeme referansını gerçek tutar/tarih ve hemen veya dönem sonu fesih metnine bağlar;
yalnız renderer null dönerse genel metne düşer. O-N1: sözleşme 1.2 bekleyen iade listesi ve karar uçları
kimlik guard üzerinden yönetici, passkey, ikinci adım ve hız sınırıyla bağlıdır. Karar servisinde aktör
kimliği denetim kaydına aktarılır; sonuçlanmış iadede 409 döner.

Doğrulama: web 86 test geçti, 1 mevcut atlandı; worker 33 test geçti. Her iki uygulamada typecheck
ve üretim derlemesi, değişen kodda ESLint/Prettier geçti. O6 PDF eki bu işte uygulanmadı.

## Orkestra devri, 2026-10-25

Orkestra yeni oturuma devredildi. Devralan oturum önce `docs/ORKESTRA-DEVIR.md`'yi okur; başlangıç metni o dosyanın 11. bölümündedir.

## Dalga 1, kalite-guvenlik, kapı raporu (dalga-1/kalite-guvenlik/kapi), 2026-10-22

### Durum

PR açık, birleştirilmedi. Rapor `docs/kalite/dalga-1.md`: Dalga 1 kapısı kapanmadı (9 maddeden 3 geçti).
Açık kritik: K-01 (oturumlu statik uçlar üretimde 500, kimlik), ödeme denetimi K1 ve K2 (odeme). Açık
yüksek: Y-01 (güvenlik başlıkları ve CSP yok, altyapi), ödeme denetimi Y1-Y7 (Y7 için PR #18, teyit bekliyor).
Staging, iyzico sandbox anahtarı ve gerçek YZ sağlayıcı anahtarı olmadığı için ilgili maddeler "veri yok".

### Bilinmesi gerekenler

- Testler: `tests/e2e` (Playwright, axe), `tests/security/http` (başlıklar, erişim, yetki ve IDOR, CSRF,
  hız sınırı, yükleme saldırıları), `tests/security/enjeksiyon` (vitest, sunucusuz), `tests/security/tarama`
  (gitleaks, audit, pip-audit, lisans). `tests/e2e` ve `tests/security` workspace dışı paketlerdir:
  `pnpm --dir <yol> install --ignore-workspace`; kök kilit dosyası değişmedi. CI'a bağlama isteği
  `docs/istekler/kalite-ci-e2e.md`. Çalıştırma: `docs/kalite/README.md`.
- Testler çalışan bir sunucuya karşı koşar (varsayılan http://localhost:3300). Yerelde Homebrew
  PostgreSQL 18 ve pgvector ile geçici küme ve Redis kullanıldı; migration 0000-0003 ve db-smoke geçti.
- Kırmızı testler bulgudur, gevşetilmedi: e2e 5, güvenlik 18, enjeksiyon 6. Yükleme saldırıları uçlar
  (yazma, Dalga 2) açılınca kendiliğinden çalışır.
- K-01 doğrulaması için `guard.ts` yerelde geçici olarak değiştirilip geri alındı; dala girmedi.
- İş listesi: `docs/istekler/kalite-*.md` (kimlik oturum uçları ve kararsız test, güvenlik başlıkları,
  yz-gecidi maskeleme, hukuk-uyum taslaklar, on-yuz bağlantılar, seo erken geçiş, CI, bağımlılık).

### Sonraki adım

Sahip ajanlar K-01 ve Y-01'i kapatınca `tests/e2e` ve `tests/security` yeniden koşulur ve rapor
güncellenir; staging kurulunca aynı testler `KAZUIST_E2E_BASE_URL=https://staging.kazuist.com` ile ve
ZAP, k6 (Dalga 2 uçlarıyla) ve Ek I robotları çalıştırılır.

## Dalga 1, anonimlestirme, NER karşılaştırması ve bağlama (dalga-1/anonimlestirme/ner), 2026-10-21

### Durum

PR açık, birleştirilmedi. Kazanan yapılandırma kural katmanı + akdeniz27 (`KAZUIST_NER_BACKEND=akdeniz27`);
rapor `eval/anon/raporlar/dalga-1-ner.md`. Ölçüm yalnız sentetik set ve elle yazılmış zor sette yapıldı; 15.3/2
yayın kapısı geçmedi sayılır (200 gerçek kararlık set yok).

### Bilinmesi gerekenler

- Ağırlıklar depo dışında: `~/.cache/kazuist-ner/src/<aday>` (sürümü sabit indirme, sha256 doğrulandı) ve
  `~/.cache/kazuist-ner/<aday>` (ONNX, `kazuist_manifest.json`). Yeniden üretim (services/worker-py):
  `uv sync --extra ner`, sonra `uv run python ../../eval/anon/export_ner.py`. savasy indirilmedi.
- Hushmark'ın indirilen yükleyicisi incelendi (ağ, alt süreç, eval/exec, pickle yok); yalnız dışa aktarmada
  eşdeğerlik referansı olarak çalıştı. Çalışma zamanı onu yüklemez; Hushmark ve akdeniz27 yalnız onnxruntime,
  tokenizers ve numpy ister (torch gerekmez). GLiNER gliner paketini ve torch'u ister.
- `KAZUIST_NER_BACKEND` boşsa yalnız kural katmanı çalışır (`ner.none`); verilip model ya da bağımlılık yoksa
  işçi başlamaz (core/main.py "startup failed"), sessizce zayıf moda düşmez. `+` ile birleşim verilebilir.
- `ENGINE_VERSION` anon-0.2.0; sürüm dizesi `anon-0.2.0+ekE-2026.10.0+ner.akdeniz27@99995f7`. Model veya
  normalizasyon değişince kayıtlar yeniden işlenmeli (plan 6.4/7).
- Model PERSON span'ları normalize edilir (satır sonu, "ve", "ile", virgülde bölme; unvan ve rol sözcüğü,
  ticaret unvanı sözcüğü ayıklama). Normalizasyon hiçbir ad karakterini açmaz: altın span testi ve
  `compare_ner.py --raw-spans` denetimi bunu gösterir.
- `records.masked_text` (sözleşme v1.1): yayımlanabilir sonuçta span'larla aynı işlemde yazılır, editör kuyruğu
  açıksa NULL; `embed.chunks` yalnız yazıldığında `embed:<recordId>` anahtarıyla kuyruğa girer. Editör onayı
  sonrası masked_text yazımı (editör ekranı) henüz yok.
- İstekler: `docs/istekler/anonimlestirme-ner-calisma-zamani.md` (orkestra: `ner-runtime` extra; altyapi:
  model birimi ve ortam değişkenleri), `docs/istekler/anonimlestirme-embed-payload.md` (mimar: payload şeması,
  eski parçaların silinmesi).

### Sonraki adım

ADR-0022 onayıyla 200 gerçek kararlık setin etiketlenmesi; modellerin Türkiye sunucusuna kurulup gecikmenin
orada `compare_ner.py --threads <n>` ile ölçülmesi; gerçek sette kaçak analizi (Dalga 3).


## Dalga 1, mimar, sözleşme istekleri (dalga-1/mimar/istekler), 2026-10-20

Durum: PR #10 açık, birleştirilmedi. Sözleşme v1.1; ADR-0021, ADR-0022, ADR-0023 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md; her istek dosyasının sonunda "Sonuç".

- Sözleşme: `CONTRACT_VERSION = '1.1.0'` (openapi.yaml, package.json ile testle eşit). Yeni modüller
  `packages/contracts/src/account.ts` (rıza, KVKK, kaldırma, kuyruk adları), `jobs.ts` (iş payload şemaları,
  bildirim türleri), `legal.ts` (hukuki metin yayın kapısı). Üretilmiş tipler yenilendi.
- Uyumsuz üç değişiklik (v1 hiçbir ortamda yayımlanmadı, istemci yok): `GET /v1/me/export` 200 ve dosya,
  `POST /v1/me/edu-verification` 204, `POST /v1/takedown-requests` gövdesi `kind/targetType/targetId`.
  v1.1 etiketinden sonra katı semver.
- Veri tabanı: `packages/db/migrations/0003_wave1_requests.sql` yalnız ekler; iki elle düzeltme var
  (eski `payments_provider_uq` yeni kısmi dizinden sonra düşer; `takedown_requests.target_id` önce doldurulur)
  ve sonda rol tohumu. v1 verisi olan veri tabanında yükseltme testi `test/migration-0003.test.ts`.
  Yeni enum değerleri aynı migration içinde kullanılmaz (ALTER TYPE ADD VALUE işlem içinde).
- `records.masked_text`: sunulabilir tek metin; NULL ise kayıt sunulmaz ve dizinlenmez. Yazan: anon.run
  (anonimleştirme) ve norm kayıtları için ingest (veri toplama). İkisi de yönlendirildi.
- Drizzle tek kopya: kök `pnpm-workspace.yaml` overrides ve `dedupePeerDependents`;
  `packages/db/test/single-drizzle.test.ts` kilit dosyasını denetler. `orm.ts` kaldırılabilir, kimlikte.
- `/api/health`: `src/server/deps.ts` (paylaşılan pg.Pool ve iovalkey istemcisi, globalThis), `src/instrumentation.ts`.
  Yoklamalar instrumentation kaydı olmadan "not wired" ile 503 verir; bu bilinçli.
- worker-node: `runner.ts` (LISTEN, yoklama, bayat kilit, SIGTERM), `handlers.ts` (kayıt, `unavailableBilling`,
  `dailyBillingTick`), `scripts/build.mjs`. Billing gerçek depo gelene kadar `BillingStoreUnavailable` ile
  kapalı başarısız; günlük zamanlama kapalı. notify.send `APP_URL` yoksa kayıtlı değildir.
- worker-py: `python -m core.main`; anon.run kendi işleminde. Eski `core/worker.py` kullanılmıyor (veri-toplama
  kararı). İmaj `docs/kaynaklar`'ı içermediği için kaynak kayıt defteri imajda boştur (yönlendirildi).
- Doğrulama sınırı: yerelde Docker ve pgvector yok; migration 0003 gerçek PostgreSQL 18'de yalnız CI docker
  işinde uygulanır. Yerelde PGlite (PostgreSQL 18 wasm) ve Homebrew PostgreSQL 16 ile Redis 8 kullanıldı.
- Sonraki adım: Tarık ADR onayı; orkestra `mimar-yonlendirme-*.md` işlerini dağıtır; onaydan sonra
  `contracts-v1.1` etiketi.

## on-yuz, Tarık onayları (dalga-1/on-yuz/onaylar), 2026-10-20

Kaynak: docs/kararlar.md, 2026-10-20 satırları. Durum: PR açık, birleştirilmedi.

- Künye: `apps/web/src/app/(kabuk)/_kabuk/kunye.ts` içinde `dogrulandi: true`, `kaynakNotu: 'Tarık onayı 2026-10-20, mevcut site /tr/hakkinda'`. Değerler arşivlenmiş /tr/hakkinda ile birebir (test: `fiyatlar/fiyatlar.test.ts`). Alt bilgi e-postası kulularteknoloji@gmail.com.
- /fiyatlar: TASLAK notu, `fiyatlar.taslak` i18n anahtarı ve `.taslak-notu` stili kaldırıldı; `fiyatTablosuSurumu = '2026-10-20'`. Tablo değerleri plan.md 4.2-4.4 ile test ediliyor; plan tablosu değişirse test kırılır ve `fiyatlar.ts` birlikte güncellenmeli. Hukuki metinler taslak kalır.
- Casuist görselleri: orijinaller https://kazuist.com/<dosya> adresinden salt okunur indirildi (kazuist-baslik.webp 1600x900, tubitak.svg, eureka.png 560x147, eurostars.png 380x283, hacettepe-logo.png 1359x2000, aybu-logo.png 185x272; sha256 değerleri `gorselleri-donustur.mjs` çıktısında). `apps/web/public/casuist/` altında AVIF ve WebP (başlık 640/960/1280/1600w; Eureka 150/300w; Eurostars 78/156w; üniversite logoları 16/22/32/44w), TÜBİTAK SVG olarak değiştirilmeden. Toplam yaklaşık 290 KB.
- Akış: `donustur.py` artık img için özgün `src`'yi (Next.js görüntü URL'si açılmış) JSON'a yazar; `_bilesen/gorseller.ts` bu yolu yerel dosyalara eşler; `Dugum.tsx` `<picture>` (AVIF kaynak, WebP img, width/height, lazy; başlık eager ve fetchpriority high) basar. Eşlemesi olmayan görsel yine yer tutucu olur. Logolar arşivdeki yükseklikte, kendi en-boy oranıyla çizilir (TÜBİTAK 47x58, Eureka 152x40, Eurostars 78x58, Hacettepe ve AYBÜ 22x32 ile 16x24). Başlık görseli alt metni i18n'de `casuist.gorselAlt.kazuistBaslik`; logolarda arşivdeki özel adlar alt metindir.
- Görselleri yeniden üretmek için: orijinalleri boş bir klasöre indirip `NODE_PATH=<sharp içeren dizin> node docs/tasarim/casuist-arsiv/gorselleri-donustur.mjs <klasör> apps/web/public/casuist`.
- Ekran görüntüleri: değişen sayfalar (/en, /tr, /partner, /tr/ortak (yeni), /eski, /fiyatlar) 375/768/1440 px yenilendi; axe 42 ölçümde ihlal 0, yatay taşma 0. Betik tembel görselleri çekimden önce yükler. Lighthouse bu işte çalıştırılmadı.
- Not: başlık görselinin YZ ürünü olmadığı ve logo kullanım izni Tarık beyanına dayanır (docs/kararlar.md); `apps/web/public/casuist/**` sahiplik tablosunda yok, orkestra on-yuz'a eklemeli.

## Dalga 1, orkestra birleştirmesi, 2026-10-20

PR #1-#8 main'de, CI yeşil. Kapı henüz kapanmadı (kalite-guvenlik raporu bekliyor). Aşağıdaki bölümler ajanların PR açıklamalarındaki DEVIR notlarıdır.

### on-yuz (PR #8)


Dalga 1, on-yuz, 2026-10-20. Durum: PR açık, birleştirilmedi. Bileşenler `@kazuist/ui`'dan (stil: `@kazuist/ui/components.css`, layout'ta yüklü); metinler prop ile verilir, bileşen içinde sabit metin yok. Kenar şerhi: `<SerhliMetin><SerhSatiri serhEtiketi=... serh={<KaynakCipi .../>}>cümle</SerhSatiri></SerhliMetin>`. Etiket türleri ve şekilleri `etiketSekli`'nde; yeni etiket eklerken benzersiz şekil testi korunmalı. Kabuk her sayfayı sarar; modül sayfası kendi `<main>`'ini açmaz, sayfa kapsayıcısı için `.sayfa` sınıfı kullanılabilir. Casuist içeriği yeniden çekmek için: docs/tasarim/casuist-arsiv'e HTML'i yeniden kaydedip `python3 -I docs/tasarim/casuist-arsiv/donustur.py docs/tasarim/casuist-arsiv "apps/web/src/app/(casuist)/_icerik"`. Ekran görüntüleri: üretim sunucusu açıkken `docs/tasarim/ekran-goruntusu.mjs` (başındaki komut; playwright ve @axe-core/playwright NODE_PATH ile verilir, PW_CHROME önbellekteki tarayıcıyı kullanır).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### veri-toplama (PR #7)

- Kapatma anahtarı: ortam `KAZUIST_SOURCE_<AD>=on` (MEVZUAT, RESMI_GAZETE, KVKK, REKABET, OPENALEX, CROSSREF, EURLEX); varsayılan kapalı; `KAZUIST_ENV=production` iken ek olarak kaynak belgesinde `tarik_onayi: onaylandi`.
- Anonimleştirme kancası: karar ve kurul_karari kayıtları `anonymized=false` yazılır, `anon.run {recordId}` kuyruğa girer (anonymizer/job.py ile uyumlu). embed.chunks'ı yalnız anonimleştirme tamamlanınca anonimleştirme tarafı kuyruğa atmalı; bu kod atmaz. Norm ve künye kayıtları `anonymized=true`, sürüm `gerekmez-norm`.
- jurisdiction: yabancı doktrin için "INT" kullanıldı (plan "ülke kodu" der); mimar teyit etmeli.
- Mevzuat fikstürü SENTETİK; sürüm zinciri ileri yönlüdür (geriye dönük RG zinciri editör onaylı ayrı iş). RG tetikleyicisi yalnız kanun numarası içeren başlıklar için ingest.fetch kuyruğa atar; mevzuat künye listesi (başlık, tür, tertip) yok.
- Ham arşiv varsayılanı ./.raw-store (KAZUIST_RAW_DIR); .gitignore'a eklenmesi orkestra işi. S3 için boto3 benzeri istemci enjekte edilir, SDK bağımlılığı eklenmedi.
- Canlı sorgu sayıları: KVKK ve EUR-Lex'te 5 sınırı aşıldı (6), ayrıntı kaynak belgelerinde. Fikstür kayıt sayıları: RG 55 girdi, KVKK 6 liste + 1 özet, Rekabet 4 liste + 1 karar, OpenAlex 1, Crossref 1, CELLAR GDPR 2 madde, Mevzuat 6 madde x 2 sürüm (sentetik).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### kimlik (PR #6)


Dalga 1, kimlik, 2026-10-20. Kimlik çekirdeği apps/web/src/server/auth altında; her hesap ucu withAuth ile korunur, yeni modül uçları da withAuth({ roles, admin, rate }) kullanmalı. Yönetici uçları için `admin: true` passkey oturumu ve /api/auth/step-up ile ikinci adım ister. Bildirim üreticileri jobs tablosuna `notify.send` ve `{ type, userId, refId? }` yazar; kişisel veri yazmaz. Geçici çözümler ve istekler yukarıda. Gereken ortam değişkenleri: BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, MAIL_SMTP_URL, TRUSTED_PROXY_COUNT, AUTH_TRUSTED_ORIGINS, GOOGLE_CLIENT_ID/SECRET, APPLE_CLIENT_ID/SECRET, APPLE_APP_BUNDLE_IDENTIFIER (.env.example mimarındır; istek gerekebilir).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### odeme (PR #5)

Dalga 1 odeme, 2026-10-20. Defter ve kurallar packages/ledger'da saf TS ve PGlite testli; iyzico akışları taklit istemciyle 9.5 Dalga 1 senaryolarını geçiyor. D1 kapandı. Sonraki adım: istek dosyasındaki DB sütunları, PgBillingStore, route bağlama, sandbox anahtarıyla gerçek uçtan uca deneme.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### hukuk-uyum (PR #4)


Dalga 1, hukuk-uyum, 2026-10-20. Durum: taslaklar PR'da, onay bekliyor. Sonraki: Tarık künye ve kararları verir; mimar istekleri işletir; odeme ve kimlik ajanları consent_kind ve metin sürümlerini (ön bilgi version) onay ekranlarına bağlar; on-yuz yayın kapısını (status: taslak ve yer tutucu kontrolü) uygular.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### anonimlestirme (PR #3)


### Durum
Dalga 1 anonimleştirme iskeleti PR'da; birleştirilmedi. Kapı ölçümü yalnız sentetik, NER yok.

### Bilinmesi gerekenler
- pyproject.toml ve uv.lock orkestra dosyası: pyyaml çalışma bağımlılığına taşındı, extras eklendi, testpaths genişletildi (testler sahiplik yolunda, anonymizer/tests).
- review_queue.decision için 'superseded' değeri kullanılıyor; maskeli metnin nerede tutulacağı mimar kararı bekliyor (istek dosyası).
- Sentetik setin şablonları ve kurallar aynı elden; sonuçlar iyimser.

### Sonraki adım
NER adaylarını ölç, en iyisini `KAZUIST_NER_BACKEND` ile bağla, gerçek altın sette kaçak analizi yap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### altyapi (PR #2)


### Durum
Dalga 1 anonimleştirme iskeleti PR'da; birleştirilmedi. Kapı ölçümü yalnız sentetik, NER yok.

### Bilinmesi gerekenler
- pyproject.toml ve uv.lock orkestra dosyası: pyyaml çalışma bağımlılığına taşındı, extras eklendi, testpaths genişletildi (testler sahiplik yolunda, anonymizer/tests).
- review_queue.decision için 'superseded' değeri kullanılıyor; maskeli metnin nerede tutulacağı mimar kararı bekliyor (istek dosyası).
- Sentetik setin şablonları ve kurallar aynı elden; sonuçlar iyimser.

### Sonraki adım
NER adaylarını ölç, en iyisini `KAZUIST_NER_BACKEND` ile bağla, gerçek altın sette kaçak analizi yap.

🤖 Generated with [Claude Code](https://claude.com/claude-code)


### yz-gecidi (PR #1)

- Durum: geçit kodu ve testleri PR'da; birleştirilmedi.
- Bilinmesi gerekenler: istemci modu sunucuda çalışmaz (RunInput.mode byok_istemci kabul etmez); tarayıcı `createAdapters({ browser: true })` kullanır. restoreLabels varsayılan kapalı; maskeli etiketler gösterime öyle gider. Yedeğe geçiş yalnız ilk çıktıdan önce ve yalnız platform modunda. odeme ajanı LedgerReservations arayüzünü packages/ledger'da gerçekler; web ajanı NonceGoneError'ı 410'a, BudgetError'ı 429'a, GatewayError'ı status alanına eşler.
- Sonraki adım: canlı duman testi, gerçek Valkey sayaç ve nonce deposu bağlantısı (altyapı).

🤖 Generated with [Claude Code](https://claude.com/claude-code)


## Dalga 0, mimar, denetim düzeltmeleri, 2026-10-19

### Durum

Bağımsız denetimin yüksek (Y1), orta (O1..O5) ve düşük (D2..D7) bulguları kapatıldı; D1 Dalga 1'e ertelendi. main'de commit'li, push ve etiket yok.

### Yapılanlar

- Y1: ledger_transactions tablosu eklendi (idempotency_key tekil); ledger_entries satır düzeyi tekil dizini kaldırıldı, transaction_id artık ledger_transactions'a dış anahtar. Promosyon ve paket partisine yayılan tek harcama için PGlite testi var; aynı anahtarla ikinci yazım reddediliyor.
- O1, O2: tüm istek gövdeleri additionalProperties: false; her gövde için zod şeması (packages/contracts/src/requests.ts, requestBodies eşlemesi); test, OpenAPI gövdeleriyle yapısal eşitliği ve kapalı nesneleri denetliyor (muaf: authPost, iyzicoWebhook, appStoreWebhook).
- O3: POST /v1/answers ve /v1/abbreviations Idempotency-Key alıyor (diğer kredi harcayan uçlarda zaten vardı).
- O4: CI'da gitleaks CLI 8.30.1 sabit sürüm ve sağlama toplamıyla; .githooks/pre-commit (gitleaks yoksa uyarı), etkinleştirme: pnpm hooks:install.
- O5: consents ve audit_log ekle-yalnız tetikleyicili; kullanıcı silinince user_id/actor_id NULL olur, user_hash/actor_hash kanıtı tutar; testli.
- D2: jobs (type, dedupe_key) etkin işlerde kısmi UNIQUE. D3: queued'a dönen işte NOTIFY. D4: /api/health yalnız {status} döner; veri tabanı ve Valkey için ping arayüzü (setHealthDeps), bağlantı yoksa 503. D5: admin uçlarında x-kazuist-requires: [passkey, second-factor]. D6: BYOK nonce Valkey SET NX EX 600 ve GETDEL, ADR-0008 notu. D7: sahiplik.md düzeltmesi ve gerekçeli sapma notları.
- 0001_init.sql yeniden üretildi (henüz hiçbir ortamda uygulanmadığı için yeni migration yerine; contracts-v1 etiketinden sonra her değişiklik yeni migration olur).

### Açık işler

- D1 (ertelendi, Dalga 1 odeme): packages/ledger'da eksi bakiye kuralı (yalnız ters ibraz ve Apple iadesiyle eksiye düşme) ve özellik tabanlı testler.
- Health ping'lerinin gerçek pg ve Valkey istemcilerine bağlanması (altyapi, Dalga 1).

## Dalga 0, mimar, 2026-10-19

### Durum

Sözleşmeler v1 main dalında commit'li; push ve etiket yok. Kapı: bağımsız denetçi incelemesi ve Tarık'ın ADR toplu onayı.

### Yapılanlar

- pnpm workspaces monorepo (plan 5.2): apps/web (Next.js 16.4.2, /api/health ve /api/version), apps/worker-node (jobs tüketicisi), services/worker-py (uv pyproject, connectors, anonymizer, nlp, citations, docxcheck, core; core/jobs.py), packages/contracts, db, casuist, ai-gateway, ledger, ui, i18n; content/, infra/, eval/, docs/.
- TypeScript 6.0.3 sıkı mod (noUncheckedIndexedAccess dahil), ESLint 10 ve typescript-eslint 8.72 strict, Prettier 3.9.
- packages/contracts: openapi.yaml (OpenAPI 3.1, Ek C.1 uçlarının tamamı, 74 yol, 93 işlem), Redocly recommended-strict lint, zod şemaları (hata gövdesi, SSE olayları, BYOK prepare ve verify, model JSON Lines satırı, iş türleri), openapi-typescript çıktısı (src/generated/api.ts), Swift için openapi-generator-config.yaml.
- packages/db: Ek C.2 tablolarının tamamı (69 tablo, 8'i kampus şemasında), plan 6.3 alanları records'ta, chunks.embedding halfvec(1024) HNSW, tsvector 'turkish' üretilmiş sütun, değiştirilemez ve dengeli defter tetikleyicileri, webhook_events ve idempotency_keys tekil anahtarları, jobs kuyruğu (enum'lar, SKIP LOCKED sorguları, NOTIFY jobs_<tür> tetikleyicisi). Migration'lar: 0000 uzantılar, 0001 şema (drizzle-kit), 0002 defter ve kuyruk tetikleyicileri. Örnek veri: src/seed.ts ve scripts/seed.ts (yalnız sahte veri).
- packages/ui tokens.css belirteç adları; packages/i18n tr ve en (ortak, ozet) ve eşitlik testi.
- infra/docker-compose.dev.yml, .env.example, .github/workflows/ci.yml, scripts/check-text.mjs (pnpm check:text).
- docs/adr/0001..0020 ve README, docs/sahiplik.md, docs/ilerleme.md, docs/ip/arka-plan-kaydi.md, docs/istekler/README.md.

### Doğrulama

pnpm install, pnpm typecheck, pnpm test (34 test; PGlite migration testi dahil), pnpm --filter @kazuist/contracts lint, pnpm check:text, pnpm lint, pnpm build ve services/worker-py içinde python3 -m pytest (5 test, yerel Python 3.9 ile) geçti.

Migration, PGlite 0.5.10 (PostgreSQL 18.6 wasm) ve @electric-sql/pglite-pgvector ile uygulandı. PGlite 'turkish' yapılandırmasını içeriyor; test bunu ve Türkçe kök bulmayla eşleşmeyi doğruluyor.

Doğrulanamayanlar: docker compose up (makinede docker yok; YAML ayrıştırıcıyla doğrulandı); uv sync ve uv run pytest (makinede uv yok); gerçek PostgreSQL 18 ve pgvector 0.8.7 üzerinde migration.

### Bilinmesi gerekenler

- TypeScript 7.0.2 npm'de güncel, ancak typescript-eslint 8.72 en fazla 6.0'ı destekliyor; 6.0.3 seçildi. openapi-typescript 7.13 TypeScript 5 eş bağımlılığı uyarısı veriyor; üretim çalışıyor.
- MinIO Docker Hub deposu artık yok; compose'taki quay.io/minio/minio etiketi doğrulanamadı. altyapi ajanı etiketi doğrulamalı veya S3 uyumlu başka bir yerel depo için ADR yazmalı.
- pnpm 11 derleme betiklerine izin listesi pnpm-workspace.yaml içindeki allowBuilds alanındadır.
- Kanal adlarında nokta alt çizgiye çevrilir: anon.run için jobs_anon_run.

### Sonraki adım

bagimsiz-denetci Dalga 0'ı denetler; Tarık ADR'leri onaylar; orkestra main'e contracts-v1 etiketini koyar; Dalga 1 ajanları başlar.
