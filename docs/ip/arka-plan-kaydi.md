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

ADR-0001..ADR-0020, 2026-10-19 tarihli, durum "Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)" (docs/kararlar.md).
Dizin: docs/adr/README.md.
ADR-0021 (yerel S3 deposu), ADR-0022 (altın set etiketleme yöntemi) ve ADR-0023 (sözleşme v1.1), 2026-10-20
tarihli, durum "Önerildi, Tarık onayı bekliyor". ADR-0024 (abonelik atıfları ve yıllık iade formülü, 2026-10-22,
güncelleme 2026-10-25) ve ADR-0026 (sözleşme v1.2, 2026-10-25) "Önerildi, Tarık onayı bekliyor"; ADR-0025 (platform YZ
sağlayıcısı OpenRouter) "Kabul edildi (Tarık İsmet Alkan, 23 Ekim 2026)".
Güncelleme 2026-11-12 (docs/adr/README.md ile aynı): ADR-0021, 0022, 0023, 0024 ve 0026 kullanıcı onayıyla 2026-10-25,
ADR-0027, 0028 ve 0029 2026-10-27, ADR-0030 ve 0031 2026-11-06, ADR-0032 2026-11-07 tarihinde kabul edildi. ADR-0033 (tek
sunucu, staging'siz, tek seferde yayın) ve ADR-0034 (görsel varlık üretimi) 2026-11-12 tarihli, "Önerildi, Tarık onayı
bekliyor". ADR-0034 hangi seçenekle sonuçlanırsa sonuçlansın görsel varlıkların aracı, istemi ve çizeni bu kayda yazılır.
ADR-0001 (kaynaklı özet ve kaynak bağlama) ve ADR-0006 (PostgreSQL içinde hibrit getirme) Eurostars WP4'ün
(retrieval, grounding, provenance) arka plan IP'si bakımından temel kayıtlardır.

## Güncelleme kuralı

Yeni modül veya çekirdek algoritma eklendiğinde bu tabloya tarih ve commit kimliğiyle satır eklenir.
