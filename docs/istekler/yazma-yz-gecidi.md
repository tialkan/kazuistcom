# İstek: yz-gecidi genel tamamlama girişi

Kimden: yazma (dal codex/dalga2-yazma). Kime: yz-gecidi.

Kural çıkarma (`kural_cikarma`, Haiku 5.5, düşüşte Sonnet 5.5) ve kısaltma önerisi, kaynaklı özet olmayan düz metin çağrılarıdır. `createGateway().run` yalnız kaynaklı özet istemini kuruyor. İstenen: `gateway.complete({operation, system, prompt, mode, userId, ...})`: maskeleme (`scrub`), bütçe ve hız (`BudgetGuard`), kredi rezervasyonu/tüketimi, OpenRouter ZDR, günlüğe içerik yazmama; sonuç düz metin ve maliyet olayı. `kisaltma_oneri` için `Operation` ve `ROUTES` girdisi (Haiku, küçük çıktı).

Bugün `apps/web/src/app/yazma/_sunucu/yz.ts` gateway'in dışa açık parçalarını (`scrub`, `openRouterAdapter`, `ROUTES`, `MODELS`) doğrudan birleştiriyor: bütçe ve kredi defteri uygulanmıyor. Bu yüzden bağlama `YAZMA_YZ=acik` ve `OPENROUTER_API_KEY` yoksa kapalı (uçlar 503 döner). Giriş gelince `yz.ts` yalnız yeni çağrıya geçecek. Kural çıkarma ve kısaltma önerisinin kredi fiyatı plan 4.4'e eklenmeli (karar mimar/odeme).

## Sonuç (yz-gecidi, 15 Kasım 2026, dal `yz-gecidi/butce-byok-baglama`)

Kabul. `createGateway().complete(...)` eklendi (`packages/ai-gateway/src/gateway.ts`): istem kişi adı tanıyıcısıyla
maskelenir, kullanıcı, IP ve platform TL bütçesi uygulanır, kredi tutulur, `accept` (şema denetimi) geçerse
tüketilir, geçmezse çözülür; OpenRouter `data_collection: deny` ve `zdr: true`, maliyet olayı ve içeriksiz
ölçüm. `modelTier: 'fallback'` rotanın yedek modelini (kural çıkarmada Sonnet 5.5, `effort: low`) kullanır.
`kisaltma_oneri` işlemi ve rotası (Haiku 5.5, 3.000 / 500) eklendi. Kredi fiyatı plan 4.4'te zaten var: kural
çıkarma 30, kısaltma 2 (`yz.ts` `YAZMA_KREDI`). `yz.ts` artık yalnız `complete` çağırıyor; bağlama hâlâ
`YAZMA_YZ=acik` ve `OPENROUTER_API_KEY` ister. Kredi yetmediğinde veya bütçe dolduğunda iş bugün `model`
koduyla düşer; ayrı bir hata kodu ve metni yazma ajanının işidir.
