# İlerleme

Her ajan yalnız kendi satırını günceller. Durum değerleri: bekliyor, sürüyor, PR açık, kapı bekliyor, tamam.
"Tamam" yalnız kalite-guvenlik kapı raporuyla yazılır (plan 17.3/7).

Güncel orkestra kaydı, 27 Ekim 2026: main fef96e3; PR44/45 dört yeşil CI ile birleşti. Birleşik aday1a97d36 yerel kalite ve bağımsız denetimden geçti; son HEAD CI hesap engeli nedeniyle birleşmedi. ADR27 onaylı, ADR28 öneri. O6 adayda kapalı, O9 yönetici iade işi sürüyor. Dalga1 kapısı5/9 açık. İyzico talebi26Ekim00:32 gönderildi; aktivasyon yanıtı beklenir. Public görünürlük onayı yok; ücretsiz özellik/BYOK ve platform kredisi modeli kayda hazırlanıyor.

| Dalga | Ajan | İş | Durum | Not |
|---|---|---|---|---|
| 0 | mimar | Monorepo, sözleşmeler v1, şema v1, ADR-0001..0020, sahiplik | tamam | CI yeşil (4400e99); docker compose up doğrulanamadı, gerçek PostgreSQL doğrulaması Dalga 1 altyapi'ye devredildi |
| 0 | bagimsiz-denetci | Dalga 0 denetimi | tamam | Kritik 0, yüksek 1 (kapandı), orta 5 (kapandı), düşük 7 (6 kapandı, D1 Dalga 1 odeme'ye) |
| 0 | Tarık | ADR toplu onayı, contracts-v1 etiketi | tamam | 19 Ekim 2026 onay; contracts-v1 |
| 1 | altyapi | Staging, CI/CD, yedek, izleme | kapı bekliyor | PR #2/#12/#22/#29 main’de; gerçek servisli CI yeşil, staging/TLS/yedek kabulü açık |
| 1 | kimlik | Kimlik/KVKK; gerçek checkout metni ve kalıcı sözleşme teslimi | kapı bekliyor | O6: kaynak/sürüm kapısı ve frozen alıcıyla deleted-account teslimi; web111/worker47, üretim build, mobil/axe yeşil. CI hesap sınırı ve gerçek SMTP/yayım kanıtı açık |
| 1 | yz-gecidi | Sağlayıcılar, BYOK, maskeleme, bütçe | kapı bekliyor | PR #1/#18/#21/#26 main’de; taklit ve 25 Ekim gerçek OpenRouter duman testi kayıtlı, enjeksiyon 60/60 |
| 1 | veri-toplama | Mevzuat, RG, KVKK, Rekabet, OpenAlex bağlayıcıları | kapı bekliyor | PR #7/#11 main’de; fikstür testleri var, staging ve kaynak üretim onayları açık |
| 1 | anonimlestirme | Anonimleştirme hattı, 50 belge ölçümü; NER karşılaştırması ve bağlama, masked_text | kapı bekliyor | PR #3/#16 main’de; 50 sentetik belge raporu geçti, 200 gerçek karar ve üretim politikası onayı açık |
| 1 | odeme | Defter, iyzico sandbox | yeniden denetim bekliyor | Silme iadesi beş gerçek admin ucu, atomic karar/kalem/hold, unknown çözüm, D3/replay/ceil/cap ve pendinghold chargeback409; yerel ledger154+billing12 geçti. ADR28/CI/bağımsız denetim açık; fatura outbox entegratör sonrası |
| 1 | on-yuz | Tasarım sistemi, kabuk, korunan sayfalar | kapı bekliyor | ADR29 ücretsiz/BYOK/platform kredisi fiyatlar sunumu; mevcut plan5+i18n12 test,375/768/1440 axe0/taşma0 ve üretim build yeşil. CI/son kapı bekliyor |
| 1 | hukuk-uyum | Hukuki metin taslakları | kapı bekliyor | PR #4/#23/#28 main’de; 7 doğrulama işaretinden 5i 2 Kasım’da kapandı, 2si ve künye eksikleri sürüyor, yayım onayı hazır değil |
| 1 | mimar | Dalga 1 sözleşme istekleri (15), sözleşme v1.1, migration 0003, ADR-0021..0023 | kapı bekliyor | PR #10 main’de; sözleşme 1.1/migration 0003; ADR-0021/0022/0023 kullanıcı tarafından25Ekim onaylandı |
| 1 | mimar | İkinci istek turu (7), sözleşme v1.2, migration 0004, ADR-0024 güncellemesi, ADR-0026 | kapı bekliyor | PR #31 main’de; sözleşme 1.2/migration 0004, ADR-0024/0026 kullanıcı tarafından25Ekim onaylandı; 27 migration testi geçti |
| 1 | kalite-guvenlik | Dalga 1 kapısının yeniden ölçümü | kapı bekliyor | 25 Ekim: 5/9; O-09 kod/regresyon hazır, O-07 all-extras audit0; akdeniz/hushmark ve GLiNER mevcut ONNX eşlik kanıtlı; GLiNER yeni export disk engeli, final CI/denetim bekliyor. codex/guvenlik-bagimlilik |
| 1 | mimar | Kalıcı sipariş belgeleri, D4 daraltma ve silmede iade tercihi, sözleşme1.3, migration0005, ADR0027 | PR açık | PR38; mainPR35/37 dahil; DB35/contracts121, tamNode616 ve build/typecheck/lint temiz; dörtCI kapısı bekleniyor; ADR27 kullanıcı tarafından27Ekim onaylandı |
| 1 | mimar | Silme iade yönetimi sözleşme1.4, migration0006, ADR0028 | PR açık | Öneri onay bekliyor; DB43/contracts127, tamNode636 ve build/tip/lint geçti; GitHubCI hesap limiti açık, route/defter entegrasyonu ödemede |
| 1E | altyapi, seo, kalite-guvenlik | Erken geçiş | bekliyor | |
| 2 | casuist, atif-agi, yazma, pratik, kampus, icerik, seo, odeme, veri-toplama, ios | Ürün modülleri | bekliyor | |
| 3 | kalite-guvenlik, bagimsiz-denetci | Sertleştirme | bekliyor | |
| 4 | sahip ajanlar, icerik | Kapalı beta | bekliyor | |
| 5 | altyapi, seo, kalite-guvenlik | Genel yayın | bekliyor | |
| 6 | ios, odeme, kalite-guvenlik, bagimsiz-denetci | iOS 1.0 | bekliyor | |

## 27 Ekim 2026: Ürün modeli önerisi

Orkestra ADR-0029 ve açık kaynak yayın kapsamını incelemeye hazırladı. Ücretsiz özellikler/BYOK ve kredi tek gelir talimatı karar kaydında. ADR, lisans ve görünürlük onayları ayrıdır; plan/UI değişmedi, çalışma kapı bekliyor.
