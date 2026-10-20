# İlerleme

Her ajan yalnız kendi satırını günceller. Durum değerleri: bekliyor, sürüyor, PR açık, kapı bekliyor, tamam.
"Tamam" yalnız kalite-guvenlik kapı raporuyla yazılır (plan 17.3/7).

| Dalga | Ajan | İş | Durum | Not |
|---|---|---|---|---|
| 0 | mimar | Monorepo, sözleşmeler v1, şema v1, ADR-0001..0020, sahiplik | tamam | CI yeşil (4400e99); docker compose up doğrulanamadı, gerçek PostgreSQL doğrulaması Dalga 1 altyapi'ye devredildi |
| 0 | bagimsiz-denetci | Dalga 0 denetimi | tamam | Kritik 0, yüksek 1 (kapandı), orta 5 (kapandı), düşük 7 (6 kapandı, D1 Dalga 1 odeme'ye) |
| 0 | Tarık | ADR toplu onayı, contracts-v1 etiketi | tamam | 19 Ekim 2026 onay; contracts-v1 |
| 1 | altyapi | Staging, CI/CD, yedek, izleme | kapı bekliyor | PR #2 main'de |
| 1 | kimlik | Better Auth, roller, KVKK hak uçları | kapı bekliyor | PR #6 main'de |
| 1 | yz-gecidi | Sağlayıcılar, BYOK, maskeleme, bütçe | kapı bekliyor | PR #1 main'de |
| 1 | veri-toplama | Mevzuat, RG, KVKK, Rekabet, OpenAlex bağlayıcıları | kapı bekliyor | PR #7 main'de |
| 1 | anonimlestirme | Anonimleştirme hattı, 50 belge ölçümü | kapı bekliyor | PR #3 main'de |
| 1 | odeme | Defter, iyzico sandbox | kapı bekliyor | PR #5 main'de |
| 1 | on-yuz | Tasarım sistemi, kabuk, korunan sayfalar | kapı bekliyor | PR #8 main'de; 2026-10-20 onayları (künye, fiyatlar, Casuist görselleri) dalga-1/on-yuz/onaylar PR'ında |
| 1 | hukuk-uyum | Hukuki metin taslakları | kapı bekliyor | PR #4 main'de |
| 1E | altyapi, seo, kalite-guvenlik | Erken geçiş | bekliyor | |
| 2 | casuist, atif-agi, yazma, pratik, kampus, icerik, seo, odeme, veri-toplama, ios | Ürün modülleri | bekliyor | |
| 3 | kalite-guvenlik, bagimsiz-denetci | Sertleştirme | bekliyor | |
| 4 | sahip ajanlar, icerik | Kapalı beta | bekliyor | |
| 5 | altyapi, seo, kalite-guvenlik | Genel yayın | bekliyor | |
| 6 | ios, odeme, kalite-guvenlik, bagimsiz-denetci | iOS 1.0 | bekliyor | |
