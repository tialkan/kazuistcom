# Arka plan IP kaydı

Sahip: Kulular Bilişim Teknolojileri Ltd. Şti. (plan K-19). Bu kayıt, Eurostars ortaklığı öncesinde var olan ve
Kulular'da kalan çekirdek yazılımı tarihli olarak belgeler. Doğruluk kaynağı git commit geçmişi ve ADR'lerdir.

## Depo

- Depo: Kazuist (yerelde başlatıldı; Kulular GitHub organizasyonundaki özel depoya aktarılacak)
- İlk commit tarihi: 2026-10-19 (75ba26b, plan, SRS kaynağı, ajan tanımları ve proje kuralları)
- Dalga 0 sözleşme commit'leri: 2026-10-19

## Modüller

| Modül | Yol | Açıklama | Durum (2026-10-19) |
|---|---|---|---|
| Casuist kaynak bağlama çekirdeği | packages/casuist | Sorgu çözümleme, hibrit getirme, puanlama, otorite sınıfı, istem kurma, satır doğrulayıcı | İskelet; sınırlar ve sabitler (3 cümle, 70 kelime, 12 karakter alıntı, RRF k=60) |
| API sözleşmesi | packages/contracts | OpenAPI 3.1, zod şemaları, SSE olayları, BYOK protokolü, model JSON Lines şeması | v1 yazıldı |
| Veri şeması | packages/db | Drizzle şeması, migration'lar, iş kuyruğu sözleşmesi, değiştirilemez çift taraflı defter tetikleyicileri | v1 yazıldı |
| YZ geçidi | packages/ai-gateway | Sağlayıcı bağdaştırıcıları, BYOK, maskeleme, bütçe | Arayüz iskeleti |
| Kredi defteri | packages/ledger | Çift taraflı defter mantığı | İskelet (denge kontrolü) |
| Tasarım belirteçleri | packages/ui | tokens.css belirteç adları | Adlar sabit, değerler yer tutucu |
| Sözlükler | packages/i18n | tr kaynak, en; anahtar eşitliği | İskelet |
| Web uygulaması | apps/web | Next.js, /api/health, /api/version | İskelet |
| Node işçisi | apps/worker-node | İş kuyruğu tüketicisi | İskelet |
| Python işçisi | services/worker-py | Bağlayıcılar, anonimleştirme, NLP, atıf, DOCX doğrulama; iş kuyruğu sözleşmesi | İskelet |

## ADR'ler

ADR-0001..ADR-0020, 2026-10-19 tarihli, durum "Önerildi, Tarık onayı bekliyor". Dizin: docs/adr/README.md.
ADR-0001 (kaynaklı özet ve kaynak bağlama) ve ADR-0006 (PostgreSQL içinde hibrit getirme) Eurostars WP4'ün
(retrieval, grounding, provenance) arka plan IP'si bakımından temel kayıtlardır.

## Güncelleme kuralı

Yeni modül veya çekirdek algoritma eklendiğinde bu tabloya tarih ve commit kimliğiyle satır eklenir.
