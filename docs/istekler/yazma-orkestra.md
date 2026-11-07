# İstek: yazma işi için orkestra bağlantıları

Kimden: yazma (dal codex/dalga2-yazma). Kime: orkestra (ve notlanan sahiplere).

## Bağımlılıklar (lisans kontrollü, kilit dosyası bu dalda `pnpm` ile güncellendi; birleştirmede yeniden üretin)

- apps/web: `docx` 9.15.2 (MIT), `fflate` 0.8.3 (MIT, docx bağımlılığı), `unpdf` 2.1.0 (MIT, pdf.js sarmalayıcısı; pdf.js Apache-2.0), `@kazuist/ai-gateway` (workspace), geliştirme: `yaml` 2.9.1 (ISC).
- apps/worker-node: geliştirme: `yaml` 2.9.1 (yalnız içerik kopyası testi).
- services/worker-py: yeni bağımlılık yok (zipfile ve ElementTree). `pyproject.toml` `testpaths` değerine `"docxcheck/tests"` eklenmeli; yoksa CI `uv run pytest` docxcheck testlerini (43) toplamaz. LibreOffice testleri `soffice` yoksa atlanır; CI'da soffice kurulursa (altyapi) atlanmadan koşar.
- AGPL/SSPL yok.

## Kayıtlar

1. `apps/worker-node/src/handlers.ts`: `'kalemcik.daily': createKalemcikDailyHandler({ db })` kaydı ve `kalemcikTick(db)` günlük zamanlayıcısı (`dailyBillingTick` gibi) `apps/worker-node/src/kalemcik/gunluk.ts` içinde hazır. `main.ts` içinde tick'in çağrılması da orkestradadır.
2. `services/worker-py/core/api.py` (veri-toplama): `from docxcheck.api import make_router` ve `app.include_router(make_router(env))`. Web `WORKER_PY_URL` + `KAZUIST_INTERNAL_TOKEN` ile `/internal/docxcheck` çağırır; yoksa denetim 503 döner.
3. Ortam: web için `WORKER_PY_URL`, `KAZUIST_INTERNAL_TOKEN`; YZ için `YAZMA_YZ=acik`, `OPENROUTER_API_KEY` (yz-gecidi isteğine bakın).
4. `content/kalemcik.yaml` ve `content/kisaltmalar.yaml` sahiplik tablosunda `icerik` yolundadır (`content/**`); plan 10.5/6-7 bu yolları adlandırdığı için yazma ajanı iki yeni dosyayı ekledi, içerik ve editör incelemesi için icerik ajanına devredilmelidir. Çalışma zamanı kopyaları `node apps/web/src/app/yazma/_veri/uret.ts` ile üretilir; testler sapmayı yakalar.
5. Kök `docs/sahiplik.md`: yazma satırına `apps/web/src/app/api/v1/{templates,journals,writing-projects,abbreviations,jobs}/**` ve `eval/rules/**` içeriği (`ekran/`, `kilavuz/`, `altin/`) eklenmeli. `/api/v1/jobs/[id]` başka modüller de kullanacaksa sahibi netleşmeli (şimdi yalnız `rules.extract` sahibine gösteriyor: `payload.userId`).
6. kalite-guvenlik: `tests/e2e/adresler.ts` listesine `/yazma`, `/yazma/sablon`, `/kalemcik`; yükleme saldırı testleri için `POST /api/v1/templates/rules` ve `/api/v1/templates/check` (zip bombası ve tür sahteciliği birim testleri var).
7. seo: `/yazma/dergiler/[slug]` onaylı profil sayfaları site haritasına (parçalı) girer; `/yazma` ve `/yazma/sablon` indekslenebilir sayfalardır.
8. on-yuz: `acikModuller` kümesine `/yazma` eklendi (bu işte izinli tek satır). `/kalemcik` modül sekmesi değil; Yazma sekmesinden kartla ulaşılır, kabuk gezinmesinde ayrı bağlantı isterseniz sizin kararınız.
9. altyapi: üretimde worker-py iç portu yalnız özel ağda; web ile aynı ağda olmalı.
