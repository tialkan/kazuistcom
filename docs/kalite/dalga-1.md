# Dalga 1 kapı raporu (kalite-guvenlik)

## Güncel aday ölçümü, 27 Ekim 2026

Kalite-guvenlik izole `1a97d36` adayını ölçtü: JS 569 geçti/3 atlandı, Python 143 geçti/3 atlandı, enjeksiyon 60/60. Tip, lint, biçim, metin (826 dosya), OpenAPI ve web/worker üretim derlemesi geçti. Workspace, E2E/security bağımlılıkları ve frozen all-extras Python audit temiz; lisans taramasında yasaklı lisans yok. Zayıf copyleft inceleme etiketleri korunur. Gitleaks 167 committe sızıntı bulmadı. Scanner iki test ve dokuz negatif alt senaryoyla geçti. Yerel ayrıntı: `/tmp/kazuist-kalite-son-tarama`.

Bağımsız denetçi aynı adayda 76 hedefli testi ve ayrı PostgreSQL18 child-process SIGKILL/kilit kurtarma testini geçirdi; yeni kritik/yüksek/orta bulgu bildirmedi. O6 gerçek kaynak metni/sürümü ve silinen hesapta frozen alıcı düzeltmeleri adayda kapalıdır; gerçek SMTP kabulü ölçülmedi. D3 gerçek süreç çökmesi kanıtı artık vardır; sağlayıcı seviyesinde tam bir kez finansal işlem garantisi çıkarılmaz. PR44/45 main fef96e3'e dörder yeşil CI ile alındı; esbuild bulgusu kapalı. ADR0027 kullanıcı tarafından onaylandı; ADR0028 öneridir, O9 yönetici iade işi sürer.

Dalga1 **5/9, açık**: staging A/AAAA boş; gerçek uygulama sandbox akışı, beş bağlayıcının staging ölçümü ve hukuki hazırlık eksik. Hukuki yedi doğrulama işareti sürer. Final adayda E2E/axe/Lighthouse tekrarlanmadı; eski 108 E2E sonucu bu adaya mal edilmez. GitHub run40405096283 dört işi de adımlar başlamadan hesap ödeme/harcama kısıtıyla durdurdu; son HEAD için dört yeşil CI olmadan birleştirme yok. Orkestranın paralel yerel test denemesi Vitest cache ENOTEMPTY hatasıyla durdu; bu başarı diye sayılmadı, yukarıdaki sayılar kalite ajanının ayrı worktree ölçümüdür.

Önceki bölümler tarihsel kanıttır.

## Hazırlık yeniden ölçümü, 26 Ekim 2026

Kalite-guvenlik ajanı izole `597d401` üzerinde ölçtü; bağımsız denetçi ayrıca main `ef4479a`, şema `09fb90d`, PR39 `3a241fe` ve rapor düzeltmesi `75e94da` adaylarını inceledi. Dalga 1 kapısı **5/9, açık**. Bu bir sonraki dalgaya veya canlı ödemeye kabul değildir. Aşağıdaki 25 ve 22 Ekim bölümleri tarihsel kanıttır.

- PR35 CI40213442857 ve PR37 CI40213483001 dört completed/success işiyle main'e alındı. Kalite, 25 Ekim'de çalışmış ikinci run'ın artefaktını 26 Ekim'de yeniden okudu: pip-audit exit0, tarama status0. Güncel tarama kodu/kilit dosyasıyla fark yok. Yerel gitleaks148commit/sızıntı0; iki tarama negatif testi dokuz hata alt senaryosu ve başarı yoluyla geçti. O-09 kapanışı destekleniyor.
- Python güvenlik düzeltmesi ve NER geçişi: GLiNER gerçek yeni ONNX20belgede span1.0, max skor fark0.0000199676. Kalite ve bağımsız denetçi model hash'ini manifestle ayrı hesaplayıp doğruladı; parity çalışmasını yeniden yaptıkları iddia edilmez. SHA256 `03f8a927c1c010c337bce2dfe9d25cdb41a245f4a8e26ff8cd457028beb0e3ef`. Bağımsız küçük dinamik batch/token/padding ONNX testi de geçti.
- Node orta esbuild bulgusu bu ölçümde sürüyordu. Orkestra sonradan PR44 dar bağımlılık yamasını hazırladı; düşük eşik dahil yerel audit temiz ve DB27/web88 test geçti. PR44 dört CI ve kalite tekrar ölçümü olmadan kapanmış sayılmaz.
- D3/D8 uygulama eksikleri bağımsız kontrolle kapalı. D3 gerçek PostgreSQL backend/process crash testi yapılmadı; PGlite/pool taklidi sınırı korunur. D4, PR38 değişmez ürün sürümü şemasının birleştirilmesine bağlıdır; ADR0027 henüz öneridir.
- Mutabakat PR40 `75e94da`: bağımsız27test, gerçek özel sandbox raporunun ağsız adaptör doğrulaması. Özgün ödeme kimliği/kısmi iade bedeli ve O-N4 eksik rapor/sayfalama açığı kapalı. İptal/gecikmiş kayıt/staging sınırları ve gerçek uygulama checkout/abonelik kabulü açık.
- O6 PDF/kalıcı belge ve O9 silme tercihi adayları incelendi: owner-only4, teslim/notify21, atomik checkout/kurtarma17 ve sourcepreflight2 test geçti. Ancak ödeme öncesi yer tutucu metinler ve hesap silme iadelerinin yönetici sonuçlandırması açık. Ayrı düzeltme işleri sürüyor. Gerçek SMTP sağlayıcı kabulü ve staging ölçümü yok.

Kapı değişmeyen açıkları: staging; gerçek uygulama sandbox uçtan uca akışı; beş bağlayıcının staging çalışması; hukuki hazırlık (künye/yedi doğrulama işareti/yayım onayı). CI localhost'u staging veya taklit taşıyıcıyı gerçek teslim saymayız. Yeni bütünleşik aday son kalite ölçümüne sunulacak; bu hazırlık raporu onun yerine geçmez.

---

## Tarihsel yeniden ölçüm, 25 Ekim 2026

Bu bölüm güncel ölçümdür. Aşağıdaki 22 Ekim bölümü tarihsel kanıttır; oradaki açık bulgular ve test sayıları güncel durum diye okunmaz. Kapsam plan 5.6, 15, 17.2 Dalga 1 ve Ek I. Veri alınamayan madde geçmedi sayılır. Sentetik test, taklit sağlayıcı, yerel CI konteyneri ve gerçek staging ayrı değerlendirilir.

Denetlenen son ürün: main `219b903ae62bd138599205175bd77d7d8c9a5730` (PR #30-#33 dahil). Birleşik aday `4457292126a41e7640f45c1fe906da839baace54` için [CI 40202875693](https://github.com/tialkan/kazuistcom/actions/runs/40202875693) dört işte tamamlandı ve yeşil. Orkestra `git diff 4457292 219b903 -- apps packages services infra .github tests` çıktısının boş olduğunu teyit etti: ölçülen ürün ağacı son main ile aynı. Son main'in [push CI 40203467801](https://github.com/tialkan/kazuistcom/actions/runs/40203467801) sonucu da completed/success; node, python, docker ve gitleaks dört işte yeşil olarak orkestra tarafından doğrulandı.

### Komut ve CI kanıtı

- `gh run view 40202875693 --json status,conclusion,jobs`: completed/success; node, python, gitleaks, docker success. `gh run download 40202875693` ile `playwright-reports` ve `tarama` artefaktları ayrıca okundu.
- Node: tip/lint/metin, sözleşme lint/istemci güncelliği, i18n, üretim derlemesi geçti. Workspace JS testleri 496 geçti, 3 atlandı (2 canlı sağlayıcı, 1 bağımlılık testi); bağımlılık testi Docker işinde gerçek servislerle ayrıca koştu. Python 143 geçti, 3 optional-extra testi atlandı. Enjeksiyon 60/60.
- Docker: gerçek PostgreSQL/pgvector, Valkey, S3; migration iki kez (ikincisi no-op), db-smoke, root olmayan imajlar, health 200/503/200 ve gerçek işçi giriş noktaları geçti. Bu testler PGlite veya taklit servis sonucu değildir.
- HTTP güvenlik: 72 geçti, 20 yükleme testi atlandı. E2E: 108 geçti; axe 13 sayfa x 3 genişlik dahil. Hassas yollar, güvenlik başlıkları/CSP, oturum çerezi, IDOR, CSRF ve hız sınırı bu CI kapsamındadır. Atlanan yükleme testleri geçmedi: veri yok.
- Lighthouse mobil simüle, üçer koşu: `/` 96/96/96; `/fiyatlar` 97/99/98; `/en` 95/96/96. Performans 90 ve CLS bütçesi geçti. LCP `/` yaklaşık 2,63 sn, `/en` 2,77-2,81 sn; LCP uyarısı kapıyı kırmaz ve 2,5 sn hedefi bu sayfalarda sağlanmadı.
- Yerel birleşik 4457292: ledger120, notify16, gate3/admin8 ve enjeksiyon60 geçti. Anonimleştirme tekrar ölçümü aşağıda 3b1e172 kural katmanındadır; final ürün farkında anonimleştirme kodu değişmedi.

### Dalga 1'in dokuz maddesi

| No  | Madde                                | Hüküm             | Kanıt ve sınır                                                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Staging canlı                        | geçmedi: veri yok | 25 Ekim orkestra dış kontrolü: staging.kazuist.com A ve AAAA boş; HTTPS çözümlenmiyor. CI localhost dağıtımı staging değildir.                                                                                                                                                                                                                         |
| 2   | Giriş çalışır                        | geçti             | Üretim Docker imajında Playwright kayıt/giriş API ve arayüz akışları; HTTP oturumlu uçlar ve IDOR testleri. Eski K-01 ve O-01 güncel CI'da yeniden üretilemedi.                                                                                                                                                                                        |
| 3   | Defter özellik testleri              | geçti             | Yerel birleşik 4457292 `pnpm --filter @kazuist/ledger test`: 16 dosya, 120 test geçti; özellik testleri dahil. Final entegrasyon CI kanıtı aşağıda.                                                                                                                                                                                                    |
| 4   | iyzico sandbox mutlu yollar          | geçmedi           | Gerçek sandbox cevaplarından elde edilen fixture'lar bağdaştırıcı yanıt şekillerini sınar. Uygulama üzerinden gerçek Ödeme Formu/3DS, abonelik ilk tahsilat/yenileme, webhook, fatura ve mutabakat eşlemesi uçtan uca kanıtlanmadı. Fixture ve FakeIyzico ile geçen testler bu kapıyı kapatmaz.                                                        |
| 5   | YZ geçidi taklit ve gerçek sağlayıcı | geçti             | Taklit geçit CI'da; yerel 3b1e172 enjeksiyon/maskeleme 60/60. Gerçek OpenRouter 25 Ekim duman testi kayıtlı (`docs/ORKESTRA-DEVIR.md`, bölüm 5/7); ücretli çağrı yeniden yapılmadı. CI canlı sağlayıcı testlerini atlar.                                                                                                                               |
| 6   | Beş kaynak bağlayıcısı staging'de    | geçmedi: veri yok | Staging yok; fixture testleri gerçek staging çalışmasını kanıtlamaz. Kaynakların açılması onay bekliyor.                                                                                                                                                                                                                                               |
| 7   | Anonimleştirme 50 belge raporu       | geçti             | `uv run python ../../eval/anon/measure.py --out <geçici>`: 50 sentetik belge, ner=none, PERSON 418/430 (%97,21), mikro yakalama %98,30, kesinlik %100. NER aday raporu `eval/anon/raporlar/dalga-1-ner.md` ayrıca mevcut; bu tur model çalıştırılmadı. Çift etiketli belge 0, kappa yok. 200 gerçek karar ve %99,5 kişi yakalama yayın kapısı geçmedi. |
| 8   | Kabuk ve korunan Casuist sayfaları   | geçti             | CI üretim imajında Ek H 23 adres, kabuk/Casuist içerik ve görsel kontrolleri; 375, 768, 1440 px axe kritik/ciddi ihlal ve yatay taşma kapıları geçti.                                                                                                                                                                                                  |
| 9   | Hukuki taslaklar onaya hazır         | geçmedi           | `content/hukuki` altında 7 DOĞRULANACAK işareti sürüyor. Vergi dairesi, VKN ve KEP eksik; ayrıca barındırma, marka durumu ve e-posta sağlayıcısı alanları açık. Dinamik satın alma ürün/tutar alanları bu künye eksikliklerinden ayrıdır. README onaydan önce doğrulama işaretlerinin kapanmasını ister; hukuki yayım onayı yok.                       |

Sonuç: **Dalga 1 kapısı kapanmadı: 5 madde geçti, 4 madde geçmedi. Dalga 2'ye geçiş onayı verilmez.**

### Bağımlılık ve tarama kapsamı (O-07)

Yeşil CI güvenlik açığı sayısının sıfır olduğunu göstermez. Kaynak: CI 40202875693 `tarama` artefaktı; logda `pip-audit exit 1`, ardından `tarama status 0`. `tarama` artefaktı `pip-audit.txt`, 13 kayıt/3 paket bildiriyor:

| Paket               | Kapsam                                                                                                                                                           | Artefakt bulgusu                                                                                            | Düzeltme                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| pypdf 6.21.1        | Temel worker runtime; `connectors/rekabet.py` PDF ayrıştırır; Docker `uv sync --frozen --no-dev` ile kurar                                                       | CVE-2026-115572, CVE-2026-115585, CVE-2026-115580                                                           | 6.21.2                                                                       |
| transformers 4.57.6 | Yerel `ner` extra; üretim worker imajına bu extra kurulmaz                                                                                                       | 9 kayıt; bazı PYSEC kimlikleri farklı fix sürümleriyle tekrar listelenir, 9 benzersiz açık iddiası değildir | Artefakta göre 5.0.0/5.0.0rc3, 5.3.0, 5.5.0, 5.10.0; bazı kayıtlarda fix yok |
| setuptools 84.0.0   | `--all-extras` export içindeki spaCy/thinc/torch kolları; standart yerel uv ortamında yok. Temel Python imajındaki ayrıca sağlanan sürüm bu artefaktla ölçülmedi | GHSA-xmj3-9gf7-h52w                                                                                         | 84.1.0                                                                       |

Node audit: esbuild geliştirme zincirinde 1 orta. Certifi artık 2026.10.19, önceki certifi kaydı bu artefakta yok. Açıkların istismar edilebilirlik ve şiddet analizi tamamlanmadığından **yüksek güvenlik bulgusu sıfır** hükmü verilmez; özellikle pypdf runtime bulguları sahip orkestra/veri-toplama tarafından incelenmelidir.

Yeni **O-09, orta, sahibi kalite-guvenlik/orkestra**: `tests/security/tarama/tarama.sh`, `pip-audit` dönüş kodunu `p` ile yazıyor fakat birleşik `status` değerine yansıtmıyor. `pip-audit exit 1` ile genel tarama yeşil olabilir. Node alt paket audit'leri de pipeline içinde yalnız çıktı üretir. Kapı değerlendirmesi rapor içeriğini ayrıca incelemelidir. Bu tur davranış değiştirilmedi.

### Bağımsız ödeme denetimi ve kalan ürün işleri

Dördüncü denetimde Y-N7 (teknik iyzico hatasında siparişin kalıcı başarısızlaşması), Y-N8 (bildirim ayrıntılarının push kanallarına taşınması), Y5, O5 (yeni ödeme onay alanları), O-N1 ve O9 paket-only silinmiş kullanıcı backend kurtarması birleşik 4457292 üzerinde bağımsız denetçi tarafından kapandı. Kalite yeniden kontrolü: ledger 120, bildirim 16, web ödeme kapısı 3, admin 8, enjeksiyon 60 geçti (toplam 207). D6 migration denetimi önceki 27 testle kapandı. O9 kullanıcı arayüzündeki silmeden önce bakiye uyarısı/iade seçeneği kapsamı henüz kapanmış sayılmaz. Güncel açık/kapalı tüm ödeme bulguları `docs/denetim/defter-odeme.md` dördüncü denetim bölümünden izlenir; eski 22 Ekim kritik/yüksek sayıları bu tur için kullanılmaz.

### Açık kapsam ve sonraki adım

Staging/TLS/Basic Auth/noindex, gerçek sandbox mutlu yolları, beş bağlayıcının staging çalışması ve hukuki hazırlık tamamlanmadan kapı kapanmaz. OWASP ZAP, k6 (200 arama/50 özet), yükleme saldırıları ve Ek I staging robotları için veri yok; yükleme uçları henüz olmadığı için atlanan testler başarı sayılmaz. Lighthouse yerel mobil laboratuvar ölçümüdür; CrUX/RUM ve üretim performansını kanıtlamaz. LCP bütçesi uyarı olduğundan yeşil CI LCP 2,5 sn altı iddiası da değildir.

---

## Tarihsel ölçüm, 22 Ekim 2026

- Tarih: 2026-10-22. Denetlenen: main 1386148 (PR #1-#18, denetim raporu docs/denetim/defter-odeme.md dahil).
- Kapsam: plan 15.2, 17.2 Dalga 1 satırı; 5.6, 15.1, 15.3/7-13 ve Ek I'nın bu dalgada ölçülebilen kısmı.
- Kural: veri alınamayan ölçüm "geçmedi: veri yok" yazılır, geçti sayılmaz. Bu rapor kendi yazmadığım işi
  denetler; düzeltmeler sahip ajanlara `docs/istekler/kalite-*.md` ile açıldı.
- Ortam: macOS (Apple M4), Node 26.1.0, pnpm 11.0.8, Python 3.12 (uv). Docker yok. Yerel üretim derlemesi
  (`pnpm build`, Next.js standalone, `NODE_ENV=production`) 127.0.0.1:3300'te; Homebrew PostgreSQL 18.6 ve
  pgvector 0.8.7 ile geçici küme (port 55433, migration 0000-0003 uygulandı, `infra/scripts/db-smoke.sql`
  geçti), Homebrew Redis 8 (db 7). Sırlar her açılışta rastgele üretildi; iyzico için yalnız ağ çağrısı
  yapılmayan uçlarda kullanılan sahte `sandbox-kalite-*` değerleri verildi. Gerçek anahtar kullanılmadı.

## Sonuç

**Dalga 1 kapısı kapanmadı.** 9 kapı maddesinden 3'ü geçti, 6'sı geçmedi (1 ve 6 tamamen veri yok; 4 ve
5'te gerçek sandbox ve gerçek sağlayıcı verisi yok). Açık kritik
bulgu 3 (biri bu rapordan, ikisi ödeme denetiminden), açık yüksek bulgu 8 (biri bu rapordan, yedisi ödeme
denetiminden; Y7 için düzeltme PR #18 birleşti, denetçi teyidi bekliyor).

## Kapı maddeleri (plan 17.2, Dalga 1)

| No | Madde | Durum | Kanıt özeti |
|---|---|---|---|
| 1 | Staging canlı | geçmedi: veri yok | `dig +short staging.kazuist.com A` boş; `curl https://staging.kazuist.com/api/version` bağlantı yok (000). VPS ve Coolify hesabı yok. |
| 2 | Giriş çalışır | geçmedi | Kayıt ve giriş API'si 200, fakat oturumlu her statik uç üretim derlemesinde 500 (K-01). /kayit ve /giris'te form yok (O-01). |
| 3 | Defter özellik testleri geçer | geçti | `packages/ledger` 57 test, fast-check özellikleri 3/3 (bakiye, idempotency, parti sınırı; rezervasyon kapanışı; olay tekilliği). Not: ödeme denetimi defter dışı servis katmanında kritik bulgu buldu (madde 4). |
| 4 | iyzico sandbox mutlu yollar | geçmedi | Sandbox anahtarı yok (`~/Desktop/kazuist-iyzico-sandbox.txt` mevcut değil): gerçek sandbox denemesi veri yok. Ayrıca docs/denetim/defter-odeme.md K1, K2 (kritik) ve Y1-Y6 açık; FakeIyzico yanlış yanıt alanını taklit ediyor, taklitle geçen mutlu yol kanıt sayılmaz. |
| 5 | YZ geçidi taklit ve bir gerçek sağlayıcıyla | geçmedi | Taklit: `packages/ai-gateway` 40 test geçti, istem enjeksiyonu setinin 54/60 durumu geçti (O-03). Gerçek sağlayıcı: veri yok (`~/Desktop/kazuist-anthropic.txt` yok; `smoke.live.test.ts` atlandı). |
| 6 | Mevzuat, RG, KVKK, Rekabet, OpenAlex bağlayıcıları staging'de | geçmedi: veri yok | Staging yok. Yerelde fikstürle `uv run pytest tests/test_connectors.py` 20/20; bütün kaynaklarda `tarik_onayi: bekliyor`. |
| 7 | Anonimleştirme 50 belgede ölçüm raporu | geçti | `eval/anon/raporlar/dalga-1.md` ve `dalga-1-ner.md` var; `measure.py` yeniden çalıştırıldı, sayılar birebir (PERSON yakalama 418/430 = %97,21, kesinlik %100, TCKN/IBAN/telefon/e-posta %100). Set sentetiktir; 15.3/2 yayın kapısı için kanıt değildir. |
| 8 | Kabuk ve korunan Casuist sayfaları | geçti | Ek H 23 adres: 17'si doğrudan 200, 5'i tek 301 ile 200, /eski 200; /en 200. 13 Casuist sayfasında görseller yükleniyor, içerik dili doğru. axe 39 ölçümde kritik ve ciddi ihlal 0, yatay taşma 0. Erken geçiş öncesi kapatılacak bağlantı bulguları O-05, D-03. |
| 9 | Hukuki taslaklar onaya hazır | geçmedi | 15 Türkçe ve 5 İngilizce taslak yayın kapısıyla gösteriliyor; ancak 24 `[DOĞRULANACAK]` işareti açık (README'ye göre onaydan önce kapanır) ve 2026-10-20'de onaylanan künye (MERSİS, sicil, adres) uyari, aydinlatma, on-bilgilendirme ve diğer metinlerde hâlâ yer tutucu (O-04). |

## Kalite kapıları (plan 15.1, A.18) bu dalgada

| Kapı | Durum | Kanıt özeti |
|---|---|---|
| Tüm testler (JS) | geçti | `pnpm test`: 363 geçti, 2 atlandı (canlı sağlayıcı ve gerçek servis testleri). |
| Tüm testler (Python) | geçti | `uv run pytest`: 143 geçti, 3 atlandı (presidio ve onnxruntime extra'ları kurulu değil). |
| Tip, lint, metin, derleme | geçti | `pnpm typecheck`, `pnpm lint`, `pnpm check:text` (713 dosya), `pnpm build` çıkış 0. |
| Kararsız test | geçmedi | `idor-rate.test.ts` "429 after 30 requests" CI'da 5012 ms ile zaman aşımı (O-02). |
| Playwright duman (yerel üretim derlemesi) | geçmedi | `tests/e2e`: 108 testten 103 geçti, 5 kaldı (K-01, O-01, O-05, D-01). |
| axe (375, 768, 1440 px) | geçti | 13 ana sayfa x 3 genişlik = 39 ölçüm, kritik ve ciddi 0. Orta: landmark (D-01, D-02); düşük: /eski boş tablo başlığı. |
| Lighthouse | geçmedi | Yerel tek ölçüm, mobil, simüle kısıtlama: / performans 89 (eşik 90), /fiyatlar 94, /hukuki/aydinlatma 93, /en 92, /tr 92; LCP 3,2-3,8 sn. Lighthouse CI bütçesi CI'da yok. Staging ve CrUX verisi yok. |
| k6 (200 arama, 50 özet) | geçmedi: veri yok | `/v1/search` ve `/v1/answers` uçları henüz yok (casuist, Dalga 2); k6 kurulu değil. |
| OWASP ZAP | geçmedi: veri yok | Staging yok. |
| Güvenlik başlıkları ve CSP | geçmedi | CSP, nosniff, Referrer-Policy, Permissions-Policy, HSTS hiçbir yanıtta yok (Y-01). X-Powered-By kapalı. |
| /.env, /.git erişimi | geçti | 22 hassas yol 404 (/.git/ önce 308, sonra 404); kaynak haritası 404; hata gövdelerinde iz yok. |
| Yetki ve IDOR | geçmedi | Misafir 401 (25/25), yönetici uçları kullanıcıya 403, sahte bearer 401, yabancı Origin ve Origin'siz çerez yazımı 403, başkasının aboneliğini iptal 404. Kullanıcının kendi verisi ve iade uçları K-01 yüzünden 500; bu yüzden IDOR örneklemesinin yarısı ölçülemedi. Geçici yerel düzeltmeyle (aşağıda) hepsi geçti. |
| Yükleme saldırıları | geçmedi: veri yok | Sözleşmedeki iki multipart uç (`/v1/templates/rules`, `/v1/writing-projects/{id}/docx-count`) yok (yazma, Dalga 2). Zip bombası, 20 000 girdi, 21 MB, tür sahteciliği, XXE ve zip slip testleri hazır, uç açılınca çalışır (20 test atlandı). |
| İstem enjeksiyonu seti | geçmedi | 15 pasaj, 4 soru, 10 kimlik durumu, iki sağlayıcı biçimi: 54/60. Sistem talimatı sabit, araç alanı yok, etiket kaçışı yok; boşluklu T.C. kimlik, küçük harfli IBAN ve noktalı telefon maskelenmeden gidiyor (O-03). |
| Sırlar (gitleaks) | geçti | `gitleaks git --redact .` tüm geçmiş: "no leaks found". |
| Bağımlılık denetimi | geçti (orta açık) | `pnpm audit`: yüksek 0, orta 1 (esbuild, yalnız drizzle-kit geliştirme yolu). `pip-audit` (kilit, tüm extra'lar): certifi 2026.10.18 bir kayıt, transformers 4.57.6 dokuz kayıt (yalnız yerel `ner` extra'sı, imajda yok) (O-07). |
| Lisans (AGPL, SSPL yok) | geçti | Node 333 + e2e 5 + security 17 paket, Python 26 paket: yasaklı 0. İncelenecek zayıf copyleft: sharp-libvips LGPL-3.0, lightningcss ve web-push ve axe-core MPL-2.0, psycopg LGPL-3.0, certifi MPL-2.0. |
| Webtools (Ek I) | geçmedi: veri yok | Bu dalgada zorunlu robot yok; WebSEO, WebSEC, WebKVKK, WebLINK Dalga 1E'de staging'e karşı koşulur ve staging yok. Yerel karşılıklar: WebLINK benzeri bağlantı testi geçmedi (O-05), robots.txt ve sitemap.xml 404 (O-06). |

## Bulgular

Önem ölçeği: kritik, yüksek, orta, düşük. Sahip, docs/sahiplik.md'ye göre.

### Kritik

**K-01. Oturumlu ve dinamik segmenti olmayan her uç üretim sunucusunda 500 döner.** Sahip: kimlik.
- Yer: `apps/web/src/server/auth/guard.ts:40-43` (`flatParams`). Next.js 16 statik rotada ikinci argümanı
  `{ params: undefined }` olarak verir (`next/dist/server/route-modules/app-route/module.js:302`:
  `params: context.params ? ... : undefined`). `route ? await route.params : {}` bu durumda `undefined`
  döndürür, `Object.entries(undefined)` TypeError atar, `withAuth` bunu yutup `internal` döner.
- Etki: GET/PATCH/DELETE /v1/me, /v1/me/export, /v1/me/consents, /v1/me/target-profession,
  /v1/me/edu-verification, /v1/kvkk-requests, /v1/wallet, /v1/wallet/ledger, /v1/invoices,
  /v1/checkout/*, /v1/refund-requests ve takedown dahil `withAuth` ile sarılı tüm statik uçlar kullanılamaz.
  Birim testleri handler'ı route argümanı olmadan çağırdığı için yakalamıyor.
- Kanıt (yerel üretim derlemesi, bearer):
  ```text
  POST /api/auth/sign-up/email 200
  GET /api/v1/me 500 {"code":"internal",...}
  GET /api/v1/me/consents 500   GET /api/v1/me/export 500
  GET /api/v1/wallet 500        GET /api/v1/wallet/ledger 500   GET /api/v1/invoices 500
  GET /api/v1/admin/flags 403   POST /api/v1/subscriptions/<uuid>/cancel 503 (dinamik rota, beklenen)
  ```
  Doğrulama için `guard.ts` satır 41 yerelde geçici olarak `(route?.params ? await route.params :
  undefined) ?? {}` yapıldı ve yeniden derlendi: aynı uçlar 200, cancel 404; güvenlik testlerinde yalnız
  başlık testleri kaldı (59 geçti). Değişiklik geri alındı, dala girmedi; rapordaki diğer bütün ölçümler
  değiştirilmemiş kodla yapıldı.
- Beklenen: plan 10.1, 10.10; sözleşme uçları 2xx. İstek: `docs/istekler/kalite-kimlik-oturum-uclari.md`.

**ÖD-K1, ÖD-K2.** docs/denetim/defter-odeme.md K1 (abonelik yenilemesi `paymentStatus`'tan okunuyor, her
başarılı yenileme başarısız sayılıyor) ve K2 (ilk abonelik webhook'u yenileme gibi işleniyor: çift kredi ve
fatura). Sahip: odeme. Açık. Bu kapı raporu ödeme maddesini bu yüzden de geçmedi sayar.

### Yüksek

**Y-01. Güvenlik başlıkları ve CSP yok (plan 5.6/1).** Sahip: altyapi (uygulama düzeyi başlıklar için
`next.config.ts` veya `src/proxy.ts`; ikisi de orkestra birleştirmesiyle).
- Kanıt: `curl -sI http://127.0.0.1:3300/fiyatlar` yanıtında yalnız Vary, x-nextjs-*, Cache-Control, ETag,
  Content-Type var. `tests/security/http/basliklar.spec.ts` 13/13 kaldı: Content-Security-Policy yok;
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Strict-Transport-Security yok (sayfa ve API).
  `grep -rniE "content-security|strict-transport|referrer-policy|permissions-policy" infra apps/web` yalnız
  bakım sayfasının nginx nosniff satırını buluyor.
- Etki: BYOK anahtarını XSS'e karşı koruyan katman yok; tıklama tuzağına (frame-ancestors) açık; WebSECRobot
  (1E kapısı) bu haliyle geçemez.
- Not: statik önceden oluşturulan sayfalar istek başına nonce alamaz; nonce için bu sayfaların dinamik
  işlenmesi veya Next.js'in belgelediği nonce akışı gerekir. İstek: `docs/istekler/kalite-guvenlik-basliklari.md`.

**ÖD-Y1..ÖD-Y7.** docs/denetim/defter-odeme.md yüksek bulguları; sahip odeme (Y7 yz-gecidi ile). Y7 için
PR #18 ("Roll back stream slot and counters when credit reservation fails (audit Y7)") main'de; denetçi
teyidi olmadan kapalı sayılmadı. Diğerleri açık.

### Orta

**O-01. /kayit ve /giris'te form yok; arayüzden kayıt ve giriş yapılamıyor.** Sahip: kimlik (on-yuz
bileşenleriyle). Sayfalar yalnız başlık ve açıklama basıyor ("forms ... come with the on-yuz components").
Kanıt: `tests/e2e/specs/hesap.spec.ts` UI testleri `getByLabel(/e-posta/i)` bulamıyor. Ayrıca bu sayfalar
kendi `<main>`'ini açıyor, kabuğun `<main id="icerik">` içinde iç içe main oluşuyor (axe
landmark-main-is-top-level, landmark-no-duplicate-main, landmark-unique; /giris, /kayit, /hesap). İstek:
`docs/istekler/kalite-kimlik-oturum-uclari.md`.

**O-02. `idor-rate.test.ts` kararsız: CI'da zaman aşımı.** Sahip: kimlik. Run 39634338462 (main, PR #12
birleşmesi): `× auth handler returns 429 with Retry-After after 30 requests per IP 5012ms`,
`Error: Test timed out in 5000ms`. Yerelde tek başına 3 çalıştırmada 1280-1357 ms. Neden: 31 ardışık
`/sign-in/email` çağrısının her biri parola karma işlemi yapıyor (Better Auth var olmayan kullanıcıda da
sabit zamanlı karma), PGlite ve 2 çekirdekli koşucuda 5 sn varsayılan süreyi aşıyor. İstek:
`docs/istekler/kalite-kimlik-kararsiz-test.md`.

**O-03. Kişisel veri temizleyicisi yaygın yazım biçimlerini kaçırıyor (plan 8.5).** Sahip: yz-gecidi.
`tests/security/enjeksiyon` iki sağlayıcı biçiminde 6 durum kaldı: A07 boşluklu T.C. kimlik
("100 000 001 46"), A08 küçük harfli IBAN ("tr33..."), A09 noktalı telefon ("0532.123.45.67") sağlayıcıya
giden gövdede maskesiz. Boşluklu IBAN, +90'lı telefon, e-posta, kart ve bitişik T.C. kimlik maskeleniyor.
Enjeksiyon tarafında 15 pasaj ve 4 soru durumunun tamamı geçti. İstek: `docs/istekler/kalite-yz-gecidi-maskeleme.md`.

**O-04. Hukuki taslaklar onaya hazır değil.** Sahip: hukuk-uyum. 24 `[DOĞRULANACAK]` işareti açık
(aydinlatma 1, abonelik 1, gizlilik 2, basvuru 2, cerezler 4, kosullar 5, mesafeli-satis 2, iade-ve-kredi 2,
yapay-zeka 1, topluluk 1, on-bilgilendirme 2, en/ai 1); bunların 3'ü Tarık kararı (yaş sınırı iki kez,
kosullar süre), diğerleri birincil kaynak kontrolü. docs/kararlar.md 2026-10-20 künye onayına rağmen
`uyari.md` {{TAM_UNVAN}}, {{MERSIS}}, {{SICIL}}, {{ADRES}}; `aydinlatma.md`, `on-bilgilendirme.md`,
`mesafeli-satis.md`, `abonelik.md` {{MERSIS}}, {{ADRES}} taşıyor. `cerezler.md:23` "kimlik ajanından"
beklenen çerez adları ölçüldü: oturum çerezi `kazuist.session_token` ön ekli, HttpOnly, SameSite=Lax,
üretimde Secure. İstek: `docs/istekler/kalite-hukuk-uyum-taslaklar.md`.

**O-05. Kabuktaki ve arşivdeki iç bağlantıların 9'u 404.** Sahip: on-yuz. Ana sayfa, /fiyatlar, /hukuki,
/en, /tr, /problem, /legal/privacy, /eski'deki aynı kökenli bağlantılar: `/ara`, `/atif-agi`, `/rehberler`,
`/yazma`, `/pratik`, `/kampus`, `/kaydettiklerim`, `/hesap/hedef` (kabuk sekmeleri ve Hedefim) ve `/demo`
(/eski arşiv içeriği, `_icerik/eski.json`) 404. Next.js Link ön getirmesi her sayfada bu 404'leri üretiyor.
Dalga 1'de modüller yok, ama erken geçişte (1E) WebLINKrobot "kırık bağlantı 0" ister. İstek:
`docs/istekler/kalite-on-yuz-baglantilar.md`.

**O-06. robots.txt, sitemap.xml, canonical ve hreflang yok.** Sahip: seo (Dalga 1E). `/robots.txt` 404,
`/sitemap.xml` 404, hiçbir sayfada `rel="canonical"` ve `hreflang` yok. Staging'in robots ile kapalı olması
(plan 13.2/6) ve Ek H hreflang çiftleri 1E kapısıdır. İstek: `docs/istekler/kalite-seo-erken-gecis.md`.

**O-07. Bağımlılık açıkları.** Sahip: orkestra (kilit dosyaları) ve anonimlestirme (`ner` extra).
certifi 2026.10.18 PYSEC-2026-4320 (düzeltme 2026.10.19, çalışma zamanında); transformers 4.57.6 dokuz
kayıt (yalnız yerel `ner` extra'sı); esbuild <=0.24.2 orta (drizzle-kit geliştirme yolu). İstek:
`docs/istekler/kalite-bagimlilik.md`.

**O-08. `withAuth` iç hatayı loglamıyor.** Sahip: kimlik. `guard.ts:110-112` `catch { return
apiError('internal') }`: istemciye requestId dönüyor ama sunucu logunda iz yok; K-01 yalnız kaynak okunarak
bulunabildi (web.log'da hata satırı 0). Plan 14.7 yapılandırılmış log; içerik ve kişisel veri yazmadan hata
türü ve requestId loglanmalı. İstek: `docs/istekler/kalite-kimlik-oturum-uclari.md`.

### Düşük

**D-01.** Ana sayfadaki şerh satırlarında birden çok etiketsiz `aside` (axe landmark-unique, 3 genişlikte);
sahip on-yuz (packages/ui `SerhSatiri`).

**D-02.** /eski karşılaştırma tablosunda boş `th` (axe empty-table-header, minor); sahip on-yuz.

**D-03.** Sonda eğik çizgili eski adreste iki atlama: `/tr/hukuki/uyari/` 308, sonra 301, sonra 200. Ek H
adresleri eğik çizgisiz; eski site haritası eğik çizgili adres içermiyorsa etki yok. Sahip: seo
(yönlendirmeler orkestra dosyası `next.config.ts`'de).

**D-04.** `<meta name="kazuist-version">` sayfa başında yok (plan 14.8); `/api/version` var ve commit'i
doğru dönüyor. Sahip: altyapi (layout orkestra dosyası).

**D-05.** İstemci IP'si okunamazsa (`TRUSTED_PROXY_COUNT=0` ve x-real-ip yok) tüm istekler `unknown`
kovasına düşüyor; 30 giriş denemesi herkesi bir dakika kilitler. Traefik X-Real-Ip yazdığı için üretimde
etkisi web portu doğrudan açık değilse yoktur; 14.9'daki port kapalılığı testiyle birlikte doğrulanmalı.
Sahip: kimlik.

**D-06.** Next.js, olmayan bir rotaya multipart POST'ta 409 "Server Action unavailable" döner (404 değil).
Zararsız; yükleme testleri bu yüzden uç varlığını gövdesiz POST ile yokluyor. Sahip yok, bilgi.

## Komutlar ve çıktı özetleri

```text
$ pnpm check:text                      check:text ok (713 files).
$ pnpm typecheck; pnpm lint            exit 0; exit 0
$ pnpm test                            i18n 12, contracts 103, ui 31, casuist 1, db 21, ledger 57,
                                       ai-gateway 40 (+1 atlandı), worker-node 26, web 72 (+1 atlandı)
$ pnpm build                           exit 0 (Next.js 16.4.2, standalone)
$ cd services/worker-py && uv run pytest -q      143 passed, 3 skipped
$ cd packages/ledger && pnpm exec vitest run test/properties.test.ts   3 passed
$ cd services/worker-py && uv run python ../../eval/anon/measure.py --out <geçici>
                                       micro recall 0.9830, precision 1.0; PERSON 418/430 (0.9721)
$ DATABASE_URL=... node infra/scripts/migrate.mjs  "appliedBefore":0,"appliedAfter":4
$ psql ... -f infra/scripts/db-smoke.sql           db-smoke: all checks passed
$ gh run view 39634338462 --log-failed            idor-rate ... Test timed out in 5000ms
$ cd tests/e2e && pnpm exec playwright test       103 passed, 5 failed
$ cd tests/security && KAZUIST_SEC_DATABASE_URL=... pnpm exec playwright test
                                       54 passed, 18 failed, 20 skipped
$ pnpm exec vitest run --config tests/security/enjeksiyon/vitest.config.ts   54 passed, 6 failed
$ sh tests/security/tarama/tarama.sh <geçici>    gitleaks no leaks; pnpm audit 1 moderate;
                                       pip-audit certifi 1, transformers 9; lisans yasaklı 0
$ npx lighthouse@13.5.0 <sayfa> (mobil, simüle)  / 89, /fiyatlar 94, /hukuki/aydinlatma 93, /en 92, /tr 92
$ dig +short staging.kazuist.com A                (boş)
```

Ek H çıktısı (ilk yanıt | izlenen son yanıt):

```text
/ /problem /how-it-works /evaluation /partner /about                   200 | 200 redirects=0
/legal/notice /legal/privacy /legal/cookies /legal/ai /legal/accessibility  200 | 200 redirects=0
/tr /tr/sorun /tr/nasil-calisir /tr/degerlendirme /tr/ortak /tr/hakkinda   200 | 200 redirects=0
/tr/hukuki/{uyari,gizlilik,cerezler,yapay-zeka,erisilebilirlik}        301 -> /hukuki/<ad> | 200 redirects=1
/eski /en                                                              200 | 200 redirects=0
```

Kalan e2e testleri: `hesap.spec.ts` API akışı (K-01), iki UI akışı (O-01), `sayfalar.spec.ts` tek main
(O-01), iç bağlantılar (O-05). Kalan güvenlik testleri: 13 başlık testi (Y-01), 5 oturumlu test (K-01).

## Bu dalgada eklenen testler ve CI durumu

| Yol | Ne | CI'da |
|---|---|---|
| `tests/e2e` | Ek H 23 adres, kabuk, hukuki sayfalar, Casuist sayfaları ve görselleri, iç bağlantılar, kayıt ve giriş (API ve UI), axe 3 genişlik | Çalışmıyor: çalışan sunucu ister, workspace dışı paket. İstek `kalite-ci-e2e.md`. |
| `tests/security/http` | Başlıklar ve CSP, çerez nitelikleri, hassas yollar, hata gövdeleri, HEAD, yetki ve IDOR (isteğe bağlı DB tohumlama), CSRF, hız sınırı, yükleme saldırıları | Çalışmıyor, aynı istek. |
| `tests/security/enjeksiyon` | İstem enjeksiyonu ve maskeleme seti (gerçek geçit ve bağdaştırıcılar, ağ yok) | Çalışmıyor; sunucu gerektirmez, CI'a tek adımla eklenebilir (aynı istek). |
| `tests/security/tarama` | gitleaks, pnpm audit, pip-audit, lisans denetimi | gitleaks ve audit CI'da zaten var; pip-audit ve lisans betiği yok (aynı istek). |

Bu PR CI'ı kırmaz: yeni paketler pnpm workspace'inde değil (kök kilit dosyası değişmedi), `pnpm test`
onları çalıştırmaz; dosyalar lint, Prettier ve metin kuralından geçer. Çalıştırma: `docs/kalite/README.md`.

## Kapanış koşulu

K-01, Y-01, ÖD-K1, ÖD-K2 ve ÖD-Y1..Y7 kapanıp yeniden ölçülene, staging kurulup 1, 4, 5 ve 6. maddeler
staging'de kanıtlanana ve hukuki taslaklardaki işaretler kapanana kadar Dalga 1 kapısı açık kalır.
