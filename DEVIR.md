# Devir kaydı

En üstteki bölüm günceldir. Her ajan işini bitirince kendi bölümünü en üste ekler.

## Dalga 1, mimar, ikinci istek turu (dalga-1/mimar/istekler-2), 2026-10-25

Durum: PR açık, birleştirilmedi. Sözleşme v1.2; ADR-0026 ve güncellenen ADR-0024 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md (ikinci tur).

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
