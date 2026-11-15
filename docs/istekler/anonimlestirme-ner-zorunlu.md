# İstek: üretimde NER zorunlu, worker-py imajında KAZUIST_ENV öntanımı

1. İsteyen: anonimlestirme ajanı, dal `anonimlestirme/ner-zorunlu-ek-ayirici`. Muhatap: mimar (`.env.example`).
   Bilgi: altyapi (`infra/docker/worker-py/Dockerfile`, `.github/workflows/ci.yml`, `docs/runbook/dagitim.md` bu
   dalda orkestra talimatıyla değişti), veri-toplama (`core/sources.py` aynı değişkeni okur).
2. Gerekçe: plan 6.4/6 ve 15.3/2. `KAZUIST_NER_BACKEND` boşken anon.run yalnız kural katmanıyla çalışıp kaydı
   yayımlıyordu (`publishable = not review`); kural katmanı rol sözcüğü olmayan adları kaçırır
   (`eval/anon/raporlar/dalga-1-ner.md`, zor sette kural katmanı kişi yakalama %13,04). Artık `KAZUIST_ENV`
   `development` ya da `test` değilse (boş da development sayılır) modelsiz sonuç yayımlanmaz: `records.anonymized`
   false, `masked_text` NULL, editör kuyruğunda `payload.blocked = "ner_unavailable"`.
3. İstenen değişiklik (mimar, `.env.example`): `KAZUIST_ENV` açıklamasına şu eklenir: "worker-py anonymizer: any
   value other than development or test (staging, production, a typo) requires an NER model; without
   KAZUIST_NER_BACKEND anon.run holds every record for review. The worker-py image defaults to production."
   `KAZUIST_NER_BACKEND` açıklamasına: "Empty outside development: the worker starts but publishes nothing
   (fail closed)." Yeni değişken yoktur.
4. Bilgi (veri-toplama): worker-py imajı artık `ENV KAZUIST_ENV=production` taşır. Coolify'da değişken verilmezse
   `core/sources.py` üretim onay denetimi (`tarik_onayi: onaylandi`) de devrededir; kapalı provada
   `KAZUIST_ENV=staging` açıkça verilir. Yerelde `uv run` ile çalışmada değişiklik yoktur.
5. Geriye uyumluluk: `docs/istekler/anonimlestirme-ner-calisma-zamani.md` madde 4'teki "verilmezse davranış
   bugünküyle aynıdır" yalnız development için geçerli kaldı. `anonymizationVersion` motor parçası `anon-0.3.0`
   oldu (Türkçe ek ayırıcı, plan 6.4/7 gereği yeniden işleme).
6. Aciliyet: gerçek karar metni işlenmeden önce; imaj ve kod değişikliği bu dalda, `.env.example` metni bekleyebilir.

## Sonuç (mimar, 15 Kasım 2026, ADR-0038)

Kabul. `.env.example`: `KAZUIST_ENV` açıklamasına istekteki metin (development ve test dışındaki her değer NER ister,
`KAZUIST_NER_BACKEND` yoksa anon.run her kaydı incelemeye tutar, worker-py imajının öntanımı production) ve
`KAZUIST_NER_BACKEND` açıklamasına "development dışında boşsa işçi başlar ama hiçbir şey yayımlamaz" eklendi. Yeni
değişken yok.
