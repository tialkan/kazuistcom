# İlerleme

Her ajan yalnız kendi satırını günceller. Durum değerleri: bekliyor, sürüyor, PR açık, kapı bekliyor, tamam.
"Tamam" yalnız kalite-guvenlik kapı raporuyla yazılır (plan 17.3/7).

Güncel orkestra kaydı, 25 Ekim 2026: Dalga 1 kapısı 5/9; PR #30-#33 main’de. Son ürün 219b903,
kanıt CI40202875693 ve docs/kalite/dalga-1.md. Dalga 2 başlamadı.

| Dalga | Ajan | İş | Durum | Not |
|---|---|---|---|---|
| 0 | mimar | Monorepo, sözleşmeler v1, şema v1, ADR-0001..0020, sahiplik | tamam | CI yeşil (4400e99); docker compose up doğrulanamadı, gerçek PostgreSQL doğrulaması Dalga 1 altyapi'ye devredildi |
| 0 | bagimsiz-denetci | Dalga 0 denetimi | tamam | Kritik 0, yüksek 1 (kapandı), orta 5 (kapandı), düşük 7 (6 kapandı, D1 Dalga 1 odeme'ye) |
| 0 | Tarık | ADR toplu onayı, contracts-v1 etiketi | tamam | 19 Ekim 2026 onay; contracts-v1 |
| 1 | altyapi | Staging, CI/CD, yedek, izleme | kapı bekliyor | PR #2/#12/#22/#29 main’de; gerçek servisli CI yeşil, staging/TLS/yedek kabulü açık |
| 1 | kimlik | Better Auth, roller, KVKK hak uçları; Y5 ve O-N1 bağlantısı | kapı bekliyor | PR #6/#14/#24/#32 main’de; Y5/O-N1/Y-N8 bağımsız teyitli, bildirim 16 ve yönetici iade 8 test geçti |
| 1 | yz-gecidi | Sağlayıcılar, BYOK, maskeleme, bütçe | kapı bekliyor | PR #1/#18/#21/#26 main’de; taklit ve 25 Ekim gerçek OpenRouter duman testi kayıtlı, enjeksiyon 60/60 |
| 1 | veri-toplama | Mevzuat, RG, KVKK, Rekabet, OpenAlex bağlayıcıları | kapı bekliyor | PR #7/#11 main’de; fikstür testleri var, staging ve kaynak üretim onayları açık |
| 1 | anonimlestirme | Anonimleştirme hattı, 50 belge ölçümü; NER karşılaştırması ve bağlama, masked_text | kapı bekliyor | PR #3/#16 main’de; 50 sentetik belge raporu geçti, 200 gerçek karar ve üretim politikası onayı açık |
| 1 | odeme | Defter, iyzico sandbox | kapı bekliyor | PR #5/#15/#19/#27/#30/#33 main’de; 120 defter/3 form testi, bağımsız denetim teyitli; gerçek sandbox ve O6/O8/O9 açık |
| 1 | on-yuz | Tasarım sistemi, kabuk, korunan sayfalar | kapı bekliyor | PR #8/#9/#25 main’de; kabuk, korunan adresler ve axe kapısı geçti |
| 1 | hukuk-uyum | Hukuki metin taslakları | kapı bekliyor | PR #4/#23/#28 main’de; 7 doğrulama işareti ve künye eksikleri sürüyor, yayım onayı hazır değil |
| 1 | mimar | Dalga 1 sözleşme istekleri (15), sözleşme v1.1, migration 0003, ADR-0021..0023 | kapı bekliyor | PR #10 main’de; sözleşme 1.1/migration 0003; ADR-0021/0022/0023 onayı bekliyor |
| 1 | mimar | İkinci istek turu (7), sözleşme v1.2, migration 0004, ADR-0024 güncellemesi, ADR-0026 | kapı bekliyor | PR #31 main’de; sözleşme 1.2/migration 0004, ADR-0024/0026 öneri; 27 migration testi geçti |
| 1 | kalite-guvenlik | Dalga 1 kapısının yeniden ölçümü | kapı bekliyor | 25 Ekim: 5/9; O-09 kod/regresyon hazır, O-07 all-extras audit0; akdeniz/hushmark eşlik kanıtlı, GLiNER disk engeli ve final CI/denetim bekliyor. codex/guvenlik-bagimlilik |
| 1E | altyapi, seo, kalite-guvenlik | Erken geçiş | bekliyor | |
| 2 | casuist, atif-agi, yazma, pratik, kampus, icerik, seo, odeme, veri-toplama, ios | Ürün modülleri | bekliyor | |
| 3 | kalite-guvenlik, bagimsiz-denetci | Sertleştirme | bekliyor | |
| 4 | sahip ajanlar, icerik | Kapalı beta | bekliyor | |
| 5 | altyapi, seo, kalite-guvenlik | Genel yayın | bekliyor | |
| 6 | ios, odeme, kalite-guvenlik, bagimsiz-denetci | iOS 1.0 | bekliyor | |
