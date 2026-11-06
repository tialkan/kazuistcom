# İstek: yz-gecidi genel tamamlama girişi

Kimden: yazma (dal codex/dalga2-yazma). Kime: yz-gecidi.

Kural çıkarma (`kural_cikarma`, Haiku 5.5, düşüşte Sonnet 5.5) ve kısaltma önerisi, kaynaklı özet olmayan düz metin çağrılarıdır. `createGateway().run` yalnız kaynaklı özet istemini kuruyor. İstenen: `gateway.complete({operation, system, prompt, mode, userId, ...})`: maskeleme (`scrub`), bütçe ve hız (`BudgetGuard`), kredi rezervasyonu/tüketimi, OpenRouter ZDR, günlüğe içerik yazmama; sonuç düz metin ve maliyet olayı. `kisaltma_oneri` için `Operation` ve `ROUTES` girdisi (Haiku, küçük çıktı).

Bugün `apps/web/src/app/yazma/_sunucu/yz.ts` gateway'in dışa açık parçalarını (`scrub`, `openRouterAdapter`, `ROUTES`, `MODELS`) doğrudan birleştiriyor: bütçe ve kredi defteri uygulanmıyor. Bu yüzden bağlama `YAZMA_YZ=acik` ve `OPENROUTER_API_KEY` yoksa kapalı (uçlar 503 döner). Giriş gelince `yz.ts` yalnız yeni çağrıya geçecek. Kural çıkarma ve kısaltma önerisinin kredi fiyatı plan 4.4'e eklenmeli (karar mimar/odeme).
