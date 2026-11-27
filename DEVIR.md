## 28 Kasım 2026, karşılama ve lansman sayfası (feat/karsilama-lansman)

- `/` artık tam ekran karşılama sahnesi: gök, dönen güneş ışınları, kaydırmayla sonsuz gün döngüsü, risograf bulutlar (ekranda en çok 3), dağ, Kazu, kuma gömülen KAZUIST harfleri, serap, kum taneleri, kâğıt dokusu. Eski ürün ana sayfası git geçmişinde.
- Tek çağrı düğmesi `/lansman` sayfasına gider; geri sayım 12 Aralık 2026 00:00 (İstanbul) içindir.
- Kod: `apps/web/src/app/_karsilama/`, `apps/web/src/app/lansman/`, görseller `apps/web/public/karsilama/` (Midjourney, webp). Metinler `packages/i18n/tr/ortak.json` > `karsilama`.
- Gökte el yazısı efekti: dağ stilindeki dolma kalem (`public/karsilama/kalem.webp`) akademik kelimeler yazar, kelime bitmeden ilk harfler silinmeye başlar. Yazı tipi Caveat 500 (OFL-1.1, `public/fonts/caveat/`), kelimeler `karsilama.yazilar`.
- Kazu tek pozda durur; Midjourney Editor ile yalnız gözleri ve yalnız kuyruğu yeniden çizilmiş iki kare (`kazu-goz`, `kazu-kuyruk`) arada göz kırpma ve kuyruk sallama verir.
- Lighthouse: `/` için performans eşiği 0,7'ye indirildi (`infra/lighthouse/lighthouserc.json` assertMatrix). Gerekçe: tam ekran görsel karşılama sahnesi; simüle mobilde ölçülen 0,77 ila 0,85. Diğer adreslerin eşiği 0,9 olarak kaldı. Sahne hareketi boşta başlar, ikincil görseller sonra yüklenir, dağ görseli önceliklidir.
- Açık: lansman saati Tarık'tan teyit edilmeli (00:00 varsayıldı).

## 15 Kasım 2026, kimlik: hesap ön ele geçirme, e-posta yokken 503, kaldırma ve anonimleştirme ekranları (kimlik/on-ele-gecirme-eposta-kuyruklar)

Bağımsız denetimin dört kimlik bulgusu. Sözleşme, şema, migration ve bağımlılık değişmedi.
- Ön ele geçirme: e-posta ve parolayla kayıt doğrulama istemediği için başkasının adresine hesap açılabiliyordu.
  Better Auth 1.7.11 e-posta koduyla girişte parola ve oturumları siliyor, Google ve Apple'ı doğrulanmamış hesaba
  bağlamıyor (`requireLocalEmailVerified`, artık `auth.ts`'te açıkça), ama passkey ve TOTP sırrını bırakıyor;
  `/email-otp/verify-email` ve `/email-otp/reset-password`'de hiçbir şey silmiyordu (test bunu kanıtladı: koruma
  kapatılınca 5 test kırılıyor). `server/auth/unproven.ts` users `update.before` kancasında, adresin ilk
  kanıtlandığı anda (kod doğrulanmış, satır hâlâ doğrulanmamış): kodla giriş ve oturumsuz adres doğrulamasında
  parola, Google ve Apple bağları, passkey, TOTP ve bütün oturumlar; parola sıfırlamada yeni parola dışında hepsi;
  aynı hesabın oturumundan adres doğrulamasında (kayıt olan kişi) yalnız diğer oturumlar silinir. Denetim kaydı
  `user.unproven_access_revoked` (yalnız alan adları). Kalan: kanıttan önce saldırgan parolayla girebilir ama hesapta
  kurbanın verisi yoktur; Google ile giren kurban önce kodla girmelidir (Better Auth 401 döner, giriş sayfası bunu
  ayrıca anlatmıyor).
- Kaldırma talepleri yalnız kayıt içindir (ADR-0031): `takedown.ts` Kampüs tablolarını okumuyor ve yazmıyor;
  sözleşmedeki `kampus_post` ve `kampus_file` hedefleri bilinmeyen hedef olarak 400.
- E-posta sağlayıcısı yokken (plan 14.6): `Mailer.configured`; kod gönderen formlar (`/email-otp/send-verification-otp`
  her tür, `request-password-reset`, `forget-password/email-otp`, `request-email-change`, edu.tr başlatma, hesapsız KVKK
  başvurusu) hiçbir şey yazmadan 503 ve `hata.epostaYok`. Sağlayıcı yapılandırılmış ama gönderim düşerse de 503:
  Better Auth gönderim hatasını yutup 200 döndüğü için `authHandler` isteği `trackMailFailures` (AsyncLocalStorage)
  içinde çalıştırır. Bu durumda parola sıfırlama yalnız var olan adreste 503 verir (sağlayıcı arızası sürerken adres
  varlığı sızar); yapılandırma yokken cevap adresten bağımsız. `istek.ts` bu 503 metnini `/api/auth` için de gösterir.
- Ekranlar `/hesap/yonetim/kaldirma` ve `/hesap/yonetim/anonimlestirme` (noindex; atıf kuyruğuyla aynı kapı,
  personel olmayana 404, onaysız personele güvenlik bağlantısı); `/hesap` Yönetim bölümünde bağlantılar. Kararlar
  mevcut `POST /v1/admin/queues/{queue}/{id}/decision` ile (`KuyrukKarari.tsx`). Kaldırma: talep ve ek maskeleme
  sonrası yayın adımı, adıma göre üç düğme, `bekliyor` taleplerde gizleme son anı ve kalan saat (12 saatten az ve
  dolmuş uyarı biçiminde, dolmuşlar başta ve üstte sayılır); iletişim adresi gösterilmez. Anonimleştirme: kayıt,
  sürüm, çocuk kuralı, yayın engeli, öneri başına tür, maske, yöntem, güven ve özgün metinden 40 karakterlik pencere
  (Python kod noktası ofsetiyle), ilk 20 öneri. 72 saat için işçi uyarısı sözleşme ve orkestra kaydı ister:
  `docs/istekler/kimlik-kaldirma-72-saat-uyarisi.md`.
- Testler: `on-ele-gecirme.test.ts` (8: kodla giriş, oturumsuz doğrulama, sıfırlama, sahibin oturumu, doğrulanmış
  hesaba dokunulmaz, Google bağlanmaz sonra bağlanır, yeni Google hesabı, plan), `eposta-yok.test.ts` (11: yapılandırma
  yok ve sağlayıcı hatası için dört kod formu, edu.tr, hesapsız KVKK; satır yazılmaz; adres bağımsızlığı; kayıt
  çalışır), `yonetim-kuyruklari.test.ts` (10: süre hesabı, Kampüs hedefi 400, sıralama ve süre, ek maskeleme adımı,
  iletişim adresi yok, gizleme sonrası sayaç, kod noktası penceresi, bozuk yük dışarıda, 20 sınırı, yetki ve karar).
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `check:text`, `pnpm build` temiz; `pnpm test` hepsi yeşil (web 816, 2
  atlanan). Yerel üretim derlemesi, geçici PostgreSQL 18 ve migration'larla iki ekran ve `/hesap` 375/768/1440,
  onaysız personel ekranı, e-posta sağlayıcısız `/giris` kod düğmesi: 16 axe taraması (WCAG 2.0/2.1 A ve AA) ihlal 0,
  yatay taşma 0; kullanıcıya iki ekran 404; ekrandan geçici gizleme `gecici_gizlendi` ve `hidden_at` yazdı. Ekran
  görüntüleri review.md T11 kararı beklendiği için depoya konmadı. Gerçek passkey töreni, gerçek Google ve SMTP
  denenmedi.

## 15 Kasım 2026, altyapi: main denetimi düzeltmeleri (altyapi/denetim-duzeltmeleri)

Bağımsız main denetiminin beş maddesi (#118, e229c70 üstünde). Yeni log satırları `@kazuist/log` ile (ADR-0039). Sözleşme, şema, migration ve bağımlılık değişmedi.
- `infra/docker-compose.prod.yml` worker-py: `KAZUIST_SCHEDULER`, `KAZUIST_SCHEDULER_DRY_RUN`,
  `KAZUIST_SCHEDULE_TICK_SECONDS` (öntanım 600, `float("")` zamanlayıcıyı düşürürdü), `KAZUIST_POLL_SECONDS` (öntanım
  5; `core/main.py` artık boşu öntanım sayıyor) ve eksik üç kaynak anahtarı `KAZUIST_SOURCE_AYM/YARGITAY/DANISTAY`
  (toplam 10). `infra/scripts/compose-env-check.py` CI'da işlenmiş compose JSON'una bakar: web, worker-node ve
  worker-py kodunun okuduğu her `KAZUIST_*` geçiyor mu, kaynak anahtarları `docs/kaynaklar` ile birebir mi
  (eski dosyada 7 eksik buluyor). Bilerek geçmeyenler gerekçesiyle betikte.
- Valkey: `allkeys-lru` ve kalıcılıksız yapı nonce ve para sayaçlarını sessizce silebiliyordu. Şimdi `noeviction`
  (dolunca yazma hata verir, istek kapalı düşer; `volatile-lru` tam da bu TTL'li anahtarları silerdi), AOF
  `everysec` adlandırılmış `valkeydata` biriminde, RDB kapalı, bellek 256m'den 384m'ye (AOF yeniden yazım fork'u).
  CI: politika, AOF ve yeniden başlatma sonrası TTL'li anahtarın kalması denetlenir.
- `/api/health`: `MAIL_SMTP_URL` kritik değişken (yoksa 503, eksik adlar yalnız logda ve bir kez). SMTP
  ulaşılabilirliği `deps.ts` `cachedPing` ile nodemailer `verify` (başarı 5 dk, hata 1 dk önbellek); ulaşılamazsa
  200 `{"status":"degraded"}`: 503 Traefik'in web'i trafikten çıkarmasına ve bütün sitenin bakım sayfasına
  düşmesine yol açardı, Uptime Kuma `"ok"` anahtar kelimesiyle yine uyarır. Compose'ta `MAIL_SMTP_URL` web ve
  worker-node için `:?`. CI: Mailpit ile 200 ok, değişkensiz 503 (adsız gövde), kapalı portla 200 degraded.
- `tests/e2e/adresler.ts` (kalite-guvenlik yolu): `ANA_SAYFALAR`'a `/ara`, `/yazma`, `/tespit`, `/rehberler`,
  `/kaydettiklerim`, `/hesap/yz-anahtari`. `infra/lighthouse/lighthouserc.json`: 7 sayfa, erişilebilirlik 0,95 ve
  SEO 0,9 hata eşiği (plan 1412), `is-crawlable` atlanır (CI sunucusu bilerek noindex). İlk CI turunda
  `/hukuki/aydinlatma` SEO 0,88 aldı (meta açıklaması yok, `hukuki/[belge]/page.tsx` `generateMetadata`); sayfa
  listeden çıkarıldı, eşik gevşetilmedi, istek `docs/istekler/on-yuz-hukuki-meta-aciklama.md`.
- `apps/worker-node/src/runner.ts` (orkestra yolu): LISTEN istemcisinin `error`/`end` dinleyicisi yoktu, bağlantı
  koptuğunda işlenmemiş `error` süreci düşürüyordu. `pgListen` kırık istemciyi yok eder, 1 sn'den 30 sn'ye ikiye
  katlanan beklemeyle yeniden LISTEN eder, sonra her kanalı bir kez bildirir (kopukken kaçan NOTIFY'lar). İlk bağlantı
  hatası yine fırlatır. `test/listen.test.ts` sahte havuzla ve CI'da gerçek PostgreSQL'de `pg_terminate_backend` ile.
- Runbook: `ilk-kurulum.md` (10 kaynak, zamanlayıcı, `MAIL_SMTP_URL` zorunlu), `izleme.md` (sağlık yanıtları, Valkey
  belleği), `coolify.md`, `yedek.md`, `vps-secimi.md`.
- Kimlik için not: web'in `smtpMailer`'ı `MAIL_FROM`'u okumuyor (sabit gönderen); worker-node okuyor.

## 15 Kasım 2026, yz-gecidi: teklif metni sunucu yapılandırmasına bağlı, tavan uyarısı, USD/TL kuru (yz-gecidi/platform-yz-yapilandirma)

Bağımsız denetim bulgusu: `OPENROUTER_API_KEY` boşken /fiyatlar ve `byok.json` `satisKapali.metin` günlük ücretsiz hak ve
50 promosyon kredisi vaat ediyor, platform özeti 503 dönüyordu. Sözleşme, şema, migration ve bağımlılık değişmedi.
- `packages/ai-gateway/src/config.ts` (yeni, `@kazuist/ai-gateway/config`): `platformAiAvailable(env)` bir platform
  anahtarı ve pozitif `AI_DAILY_BUDGET_TRY` birlikteyse doğru; `usdTryRate(env)` `AI_USD_TRY_RATE`'i okur (boş 50,
  1-1000 arası noktalı ondalık, geçersizse 50 ve `invalid` işareti). `gateway.ts` `USD_TL` sabiti kalktı,
  `GatewayDeps.usdTryRate` (sınır dışı değer kurulumda `RangeError`).
- `gecit.ts`: platform anahtarları yalnız `platformAiAvailable` doğruyken gateway'e verilir (önceden tavan boşsa
  1.000 TL varsayılanıyla harcanıyordu), anahtar var tavan yoksa adı yazan tek uyarı; `SummaryDeps.platformAcik`;
  `ozet.ts` platform kipini arama ve sayaçtan önce 503 ve `byok.ozet.platformKapali` ile reddeder.
- Teklif: `/fiyatlar` (`fiyatlar.ts` `gorunenPlanlar`, `promosyonVar`) platform kapalıyken Ücretsiz satırında ve
  girişte BYOK'u, ödeme kapalıyken promosyon cümlesini ve 90 gün kuralını göstermez; plan 4.2 tablosu (`planlar`)
  aynı, test plan.md'yle eşleşir. `/ara` özet alanı (`OzetAlani` `platformYz` prop) anahtarsız ve platform kapalıyken
  "Kendi anahtarınızı ekleyin" düğmesiyle /hesap/yz-anahtari'ya yönlendirir, platform çağrısı yapmaz; 402 ve 503'te
  sunucunun mesajı ve BYOK bağlantısı. `/odeme` ve `/hesap/yz-anahtari` (`ByokAyarlari` `platformYz`) da günlük hak
  vaat etmez. Tarayıcıya yalnız bir boolean gider; ortam değeri gitmez.
- Tavan uyarısı (plan 8.7/2): `BudgetGuard` kancası `PlatformCapAlert`; `crossed` tavanı geçen harcamada günde bir ve
  örnekler arasında tek (atomik sayaç), `refused` süreç başına günde bir. `gecit.ts` `platformCapAlert` stderr'e JSON
  satırı (`event: platform_tavan`, gün, harcama, tavan) `@kazuist/log` `logEvent` ile yazar (ADR-0039, #117 ile
  birleştirildi; yapılandırma uyarıları da `logEvent('warn', ...)`) ve `buildSummaryDeps({ onPlatformCap })` ikinci
  alıcı alır. Personel bildirimi sözleşme değişikliği ister: `docs/istekler/yz-gecidi-platform-tavan-uyarisi.md`.
- Belgeler: `.env.example`, `infra/docker-compose.prod.yml` (`AI_USD_TRY_RATE` geçişi), `docs/runbook/ilk-kurulum.md`,
  `packages/ai-gateway/SAGLAYICILAR.md`.
- Sahiplik dışı dokunulan yollar (orkestra görevi gereği): on-yuz `(kabuk)/fiyatlar/**`, casuist `ara/**`, odeme
  `(odeme)/odeme/page.tsx`, kimlik `(hesap)/**` iki dosya, mimar `.env.example`, altyapi compose ve runbook satırı.
- Açık: `content/hukuki/tr/kosullar.md` ve `aydinlatma.md` günlük ücretsiz hakkı hizmet tanımı olarak anar
  (hukuk-uyum); `yazma/_sunucu/yz.ts` `yzAcikMi` yalnız anahtara bakıyor, tavan yoksa gateway 503 verir (yazma);
  platform kapalı ve ödeme açık durumda kredi satılabilir ama harcanamaz (odeme kararı).


## 15 Kasım 2026, hukuk-uyum: hukuki metinler dar çekirdekli ilk yayına göre; Hetzner Standart Sözleşme 2 kontrol listesi

ADR-0038 madde 8 (dar çekirdek), ADR-0030 (Hetzner, Almanya) ve yayındaki BYOK koduna göre. Sözleşme, şema ve kod
değişmedi; yalnız `content/hukuki/**` ve `docs/kvkk/**` (ve bu iki paylaşılan dosya).
- 12 metin `2026-11-15.1` (status yine `taslak`): kosullar, cerezler, erisilebilirlik, uyari, aydinlatma, gizlilik,
  yapay-zeka, acik-riza, iade-ve-kredi, on-bilgilendirme, mesafeli-satis, abonelik. basvuru ve kaldirma değişmedi.
- Gizli modüller: kosullar 2 hizmet tanımı yalnız Ara ve kaynaklı özet, Kaydettiklerim, Yazma (şablon, kısaltma),
  Rehberler, /tespit; Kalemcik, Pratik, atıf ağı, "desteler" ve "oyunlar" çıktı; cerezler 2'den pratik anahtarları,
  erisilebilirlik'ten atıf ağı tablo görünümü, aydinlatma 2'den yazma projeleri (yalnız Kalemcik yazıyor) çıktı.
- BYOK (byok/settings.ts, client.ts, adapters/index.ts satır 145, byok.json): anahtar `kazuist.byok.v1`, varsayılan
  sessionStorage, seçimle localStorage, tek depoda; anahtar Kazuist'e gitmez; maskeli paket tarayıcıdan doğrudan
  OpenRouter'a, `data_collection: deny`, seçimle `zdr`; tarayıcıda `assertMasked`; verify `save: false`. Aktarma modu
  arayüzde yok (OzetAlani.tsx yalnız platform); doğrudan Gemini yok, Gemini bölümü yapay-zeka'dan çıktı, acik-riza 3
  ve 4 "şu anda kullanılmaz".
- Ödeme kapalı (`odemeAcik`): kosullar 1 ve 5, aydinlatma 2-4, gizlilik 3, yapay-zeka 7 ve iade-ve-kredi girişi;
  üç PDF metninde yalnız TASLAK notu değişti, gövde ve `pdf_fields` aynı.
- Barındırma "Almanya"; aydinlatma 5 m.9/4-(c), Standart Sözleşme 2, beş iş günü ve "bildirilmeden kişisel veri
  işlenmez" koşulu; [DOĞRULANACAK] işareti bilerek açık.
- docs/kvkk: envanter satır 16, 17, 19 güncellendi, satır 30 BYOK eklendi; aktarim.md:46 "BYOK arayüzü henüz yok"
  düzeltildi (istemci modu yayında, hukukçu değerlendirmesi işareti), aktarma modu, iyzico ve e-Arşiv satırları;
  yukumlulukler.md ödeme kapalı yayına göre; app-privacy-taslak.md; yeni `hetzner-standart-sozlesme-bildirimi.md`
  (Kurul'un Standart Sözleşme 2 PDF'i ve bildirim modülü kılavuzu okundu; Yönetmelik m.14 ve Kanun m.9/5, m.18/1-(d)
  15 Kasım'da birincil kaynaktan).
- Doğrulama: hukuk-uyum ajanında kabuk yok; `pnpm test`, `pnpm check:text`, `pnpm build` çalıştırılmadı. Elle:
  U+2014 ve yasak ifade taraması temiz (Grep), iç içe liste yok (md.ts desteklemiyor), PDF metinlerinde
  `pdf_fields` gövdede duruyor.
- Açık: sunucu ucu `byok_aktarma`yı yz_aktarim onayıyla hâlâ kabul ediyor (casuist, yz-gecidi kararı); Hetzner'ın
  imzalayıp imzalamayacağı; yer tutucular (VKN, vergi dairesi, KEP, yedek ve e-posta sağlayıcısı).


## 15 Kasım 2026, mimar: sunucu logları tek temizleyiciden geçer, ADR-0039 (arch/shared-safe-error-log)

Orkestra görevi: PR #115'in `apps/web/src/server/auth/log.ts` temizleyicisini ortak yere taşımak, apps/web ve
apps/worker-node'daki bütün sunucu log çağrılarını ona bağlamak, ham `console.error(err)`'u CI'da yasaklamak ve
edu_claims testini CI `docker` işinde gerçek PostgreSQL'e karşı çalıştırmak. Dal `origin/main` üstünde, PR #115 dalı
(`kimlik/anon-onay-ve-log-temizligi`) içine birleştirildi; PR #115 önce ya da bununla birlikte birleşmeli.
`packages/contracts` ve `packages/db` değişmedi; dış bağımlılık yok.
- `packages/log` (yeni, `@kazuist/log`, mimarın, ADR ile değişir): `safeErrorFields`, `writeLog`, `logEvent`,
  `logError`, `logWarn`, `logRequestError`, `serviceLog`. Alanlar tipte ilkel; çalışma anında nesneler düşer, metin 256
  karakter, dizi 32 öge, e-posta biçimli parça `redacted`. Testler: `test/log.test.ts` (Drizzle biçimli hata, cause
  zinciri, kanallar, `at`/`level` ezilmez, çalışma anı koruması) ve `test/lint-rule.test.ts` (depo ESLint yapılandırması
  gerçek sunucu yollarında; kontrol denemesi: worker-node globu kaldırılınca 3 test kırmızı).
- `eslint.config.mjs`: `apps/web/src`, `apps/worker-node/src` ve `packages/*/src` için `no-console` ve log çağrısında
  `.message`, `.stack`, `.detail`, `.hint`, `.query`, `.params`, `.cause`, `.toString`, `String()`, `JSON.*()` yasağı.
  Muaf: `packages/log/src`, testler, `apps/web/src/app/*/_veri/uret.ts`.
- Bağlanan yerler: kimlik `auth.ts`, `guard.ts` (`internalError` artık `logRequestError('api', ...)`, hız sınırı uyarısı
  `logEvent`), `page-session.ts`, `log.ts` (yalnız `betterAuthLog` kaldı, `logEvent` ile yazar); casuist `ara/page.tsx`,
  `kaydettiklerim/page.tsx`, `ara/_sunucu/hiz.ts` (`logError(req, err)` imzası korunur, `logRequestError('casuist')`;
  atif-agi API'si de bunu kullanır), `ara/_sunucu/gecit.ts` (yapılandırma hatası, defter uyarısı, YZ geçidi metrikleri
  `sanitizeMetric` ile `logEvent`); yazma `kurallar.ts` ve `uclar.ts` (`logWarn`); on-yuz `(kabuk)/_kabuk/oturumYukle.ts`;
  altyapi `server/deps.ts` (`pg.pool`, `valkey`); worker-node `main.ts`, `queue.ts`, `runner.ts` (`serviceLog`,
  `safeErrorFields`; `QueueLog` ve `Log` artık `ServiceLog`), `notify/dispatch.ts` (`logError('notify')`). Ödeme
  (`server/billing`, `(odeme)`, worker-node `billing`) ve kampus kalıntısı yolunda log çağrısı yoktu.
- Satır biçimi değişiklikleri: YZ geçidi metrik satırına `at`, `level`; `pg.pool` ve `valkey` satırlarına `level`;
  worker-node hata satırları SQLSTATE alanlarını taşıyabilir; Error olmayan değer `Unknown`. Diğer satırlar aynı
  (var olan satır testleri değişmeden geçti).
- CI: `docker` işine "web edu_claims ... against the real PostgreSQL" adımı (`KAZUIST_IT_DATABASE_URL`, worker-node
  purge adımından sonra). Yerelde PostgreSQL 18.6 ve pgvector 0.8.7 geçici kümesinde çalıştırıldı: postgres arka ucu 5
  test (iki bağlantılı yarış dahil), aynı veri tabanında ikinci çalıştırma da yeşil.
- Belgeler: ADR-0039 (Önerildi), `docs/adr/README.md`, `docs/sahiplik.md` (`packages/log/**` mimarda, ortak dosya
  notu), `docs/ip/arka-plan-kaydi.md`, `docs/ilerleme.md`.
- Açık: CLAUDE.md "Güvenlik" bölümüne ADR-0039 satırı önerildi; CLAUDE.md bu dalda değişmedi (Tarık onayı).

## 15 Kasım 2026, kimlik: anonimleştirme onayı anon.run kuyruğa alır, loglanan hatalar temizlenir (kimlik/anon-onay-ve-log-temizligi)

Orkestra görevi: `docs/istekler/anonimlestirme-onay-ve-acik-kaynak.md` madde 3 (PR #114) ve Drizzle hata mesajlarının
loglara girmemesi. PR #111 dalı (`kimlik/edu-claims-yeniden-goster`) bu dalın tabanına birleştirildi. `packages/contracts`
ve `packages/db` değişmedi; yeni bağımlılık yok.
- `apps/web/src/server/auth/admin.ts` `decideAnonymization`: `anonymization` kuyruğunda kalem tek işlemde kapanır
  (`decision IS NULL` koşullu güncelleme); `onay` ve `subject_type = 'record'` ise aynı işlemde istek dosyasındaki SQL ile
  `anon.run` eklenir (`payload = {recordId}`, `dedupe_key = anon:<recordId>`, kuyrukta veya çalışan iş eklemeyi yutar).
  `ret` ve `duzelt` yalnız kararı yazar. İkinci karar `not_found` (404). Denetim satırı `admin.queue.<karar>`,
  `diff = { queue, closed, recordId, jobQueued, patchPaths }`.
- `apps/web/src/server/auth/log.ts` (yeni): `safeErrorFields(err)` hatanın yalnız sınıf adını ve `cause` zincirinden SQLSTATE,
  `constraint`, `table`, `column` tanımlayıcılarını verir; `message`, `detail`, `hint`, `query`, `params` hiç okunmaz.
  `logError(at, err, extra)` tek JSON satırı yazar. `betterAuthLog` Better Auth'un `logger.log`'u: yalnız warn ve error,
  serbest metin mesaj ancak kısa ve sabit cümle görünümündeyse (rakam, tırnak, `@`, "query" yok) kalır, yoksa `redacted`.
- Uygulandığı yerler: `auth.ts` (`logger: { log: betterAuthLog }`, `runHook`), `guard.ts` (`internalError`; `withAuth` ve
  `withPublic` oturum çözümü, hız sınırı ve yönetici denetimini de `try` içine aldı, böylece çerçeveye ham hata gitmez),
  `handlers.ts` (`authHandler` hataları `internalError`'a), `page-session.ts`.
- Bulgu: Better Auth 1.7.11 yönlendiricisi yakalanmayan hatayı nesnesiyle, "column/relation/table" içeren hatanın
  `message`'ını düz metin loglar; Drizzle mesajı sorgu parametrelerini (e-posta) taşır. Kontrol denemesinde `logger`
  seçeneği kaldırılınca kayıt testi adresi logda buldu; seçenekle temiz.
- Test `__tests__/admin-kvkk.test.ts` (anonimleştirme bloğu, 6 test): onaydan sonra `anon:<id>` anahtarlı tek `anon.run`,
  ikinci onay 404, denetim satırı; kuyrukta bekleyen iş eklemeyi yutar; `done` iş yenisini engellemez; `ret`/`duzelt` iş
  eklemez; kayıt dışı konu iş eklemez; personel olmayan 403. `__tests__/log-sanitizer.test.ts` (8 test): bütün `console`
  kanalları yakalanırken PGlite tetikleyicileri e-postayı hem Postgres mesajına hem Drizzle parametresine koyar; Better
  Auth kaydı, e-posta kodu girişi, edu.tr başlatma (500, `code: P0001`), kamuya açık kaldırma talebi ve `internalError`
  çıktısında adres yok.
- Dokunulmayan: kimlik dışındaki modüllerin log satırları (ödeme, casuist, yazma vb.) bu sanitizer'ı kullanmıyor;
  `apps/worker-node` zaten yalnız hata sınıfını logluyor.

## 15 Kasım 2026, casuist: açık kaynak kurul adları dizin, embedding ve özet dışında (casuist/uye-adlari-dizin-disi)

İstek `docs/istekler/anonimlestirme-onay-ve-acik-kaynak.md` madde 4 (#114 main'de, 52c6951 üstünde). Sözleşme,
şema, migration ve bağımlılık değişmedi; `jobs.result` biçimi aynı.
- `services/worker-py/nlp/panel_names.py` ve `nlp/job.py`: `embed.chunks` parça sınırlarını ve `char_start`,
  `char_end`'i yine `masked_text`'ten keser, parça metnini `anonymizer.public_names.index_text` ile üretir: kurul
  satırlarında açık kalan üye adları ve metindeki diğer anılmaları (tam ad, soyadı, kesme ekli) `[Üye n]`. Adlar bütün
  metinde bir kez bulunur; karşı oy gibi kurul satırı olmayan parçada da aynı numara, parça sınırının böldüğü ad iki
  yanda da etiket. Yerine koymalar `index_text` ile aynı anonimleştirici işlevlerinden hesaplanır ve bütün metne
  uygulandığında `index_text(masked_text)` ile birebir aynı olmadığı an iş `IndexTextMismatch` ile düşer, hiçbir parça
  yazılmaz (kapalı hata). Ofsetler UTF-16 biriminde (TS ile aynı). Açık adı olmayan metin aynen kalır.
- Sonuç: `chunks.text`, `chunks.tsv`, embedding girdisi, arama sonucu parçası ve özet istemine giden pasajlar üye adı
  taşımaz; `records.masked_text` ve kayıt sayfası değişmedi (Ek E adları kayıt sayfasında gösterir).
- TypeScript tarafında `index_text` kopyası yok. `packages/casuist/src/panel.ts` `showsPanelNames`: kurul etiketiyle
  başlayıp büyük harfli adla ya da hiçbir şeyle biten satır varsa doğru (anonimleştiricinin `find_panel_members`'ının
  bulduğu her metni kapsar, fazlası yalnız anlık pasajı kaybeder). Böyle bir metinden `sql.ts` anlık pasajı
  (`passages`, BYOK `chunks` yeniden kurulumu), fikstür `MemoryBackend` ve `seedCorpus` parça kesmez; parçaları worker
  yazar. Desenler `packages/casuist/fixtures/kurul-satiri.json`'da; Python testi bunları gerçek kararlarda dener.
- Yan düzeltmeler: `sql.ts` `chunks()` anlık pasajı bölümsüz kesiyordu, `passages()` bölümlü; karar kayıtlarında BYOK
  verify başka metin kurup kapalı düşüyordu, ikisi aynı kurala bağlandı. `promptPassage` `charEnd`'i kırpılmamış
  parçada satırın `char_end`'inden alır (`[Üye n]` metni kısaltır, ofset `masked_text`'te kalır).
- Testler: `nlp/tests/test_panel_names.py` gerçek AYM bireysel başvuru (5 üye) ve norm denetimi (17 üye) kararı
  anonimleştirilip `embed.chunks`'tan geçer: `masked_text`'te bütün üyeler okunur, parça metninde, embedding girdisinde
  ve `jobs.result`'ta tam ad ve soyadı sayısı 0, etiketler `[Üye 1]`..`[Üye n]`; gerçek metne eklenen karşı oyda üye
  aynı numarayı alır; kapalı kaynak AYM, Yargıtay ve Danıştay metinleri aynen parçalanır; sapma testi; TS deseni
  açık metinleri yakalar, kapalıları yakalamaz. `KAZUIST_TEST_DATABASE_URL` ile gerçek PostgreSQL'de norm denetimi
  kararı: `masked_text` tsvector'ü 17 soyadının hepsini bulur, `chunks.tsv` hiçbirini. PGlite (`sql.test.ts`): açık
  kurullu metinden anlık pasaj yok, kayıt sayfası metni aynı, worker biçimli parçalarla tsv, sonuç parçası ve istem
  pasajında ad yok, kapalı karar anlık pasajı bölümlü yeniden kurulur. Adlar testlerde yalnız sayılır.
- Doğrulama: `uv run pytest` 567 geçti, 17 atlandı; yerel geçici PostgreSQL 18 (migration 0000-0008) ile 572 geçti,
  12 atlandı. `pnpm test` (casuist 124, web 787/2 atlandı ve diğerleri), `pnpm typecheck`, `pnpm lint`,
  `pnpm check:text`, `pnpm build` yeşil.
- Açık: `eval/embed/olc.py` fikstür derlemini `index_chunks`'sız keser (fikstürde açık kurul adı yok, etki 0). AYM
  kaynağı açılmadan önce bu dal main'de olmalı. İsteğe bağlı: anonimleştirici `public_names`'e
  yerine koyma listesini döndüren bir işlev eklerse `panel_names.member_replacements` ona bağlanıp kopya kalkar.

## 15 Kasım 2026, anonimlestirme: açık kaynak eşleşmesi (AYM), kurul satırları, editör onayının uygulanması (anonimlestirme/acik-kaynak-onay)

Yönlendirme `mimar-yonlendirme-4-sozlesme-v1-6.md` "anonimlestirme" maddesi ve orkestranın onay işi. Sözleşme, şema,
migration ve bağımlılık değişmedi; `jobs.result` biçimi aynı. İstek: `docs/istekler/anonimlestirme-onay-ve-acik-kaynak.md`.
- Eşleşme (`policy.py`, `policy.yaml`): `open_source_match` her açık kaynak için `source_keys` (kayıt
  `source_key` ad alanı, `aym:`) ve `courts` ("Anayasa Mahkemesi", "T.C. ...", AİHM ve ABAD adları) tutar; mahkeme adı
  NFKC, Türkçe küçük harf, aksan, nokta ve boşluk farkı gözetmeden ama tam eşitlikle karşılaştırılır ("Alman Federal
  Anayasa Mahkemesi", "Uluslararası Adalet Divanı" eşleşmez). Bozuk tablo yüklemede hata verir. `policy_version`
  ekE-2026.11.0, `ENGINE_VERSION` anon-0.4.0.
- Kimin adı açık (`roles.find_panel_members`, `pipeline._open_panel`): yalnız kararın kendi kurul satırlarındaki
  üyeler ("Başkan : Ad SOYAD", "Üyeler :" ve altındaki tek ad satırları, "Başkan A Başkanvekili B" imza satırları, tek
  başına etiket ve alt satırda ad). Önceki kural "rolü hakim olan her span" idi: AYM eşleşseydi cümle içindeki "Belediye
  Başkanı X", "meclis üyeleri Y" ve ilk derece hâkimi de açılacaktı. Kurulda adı geçen biri başka yerde taraf, vekil,
  raportör rolüyle anılıyorsa her yerde maskeli; maskeli bir kişiyle aynı soyadı taşıyan yalnız soyadı anması maskeli.
- Kural katmanı: rol ipucu araması tutulan adın sonundan sürer (önceden "Üye A Üye B Üye C" satırında ortadaki üye
  hiç maskelenmiyordu; Yargıtay ve Danıştay imza satırlarında da geçerli). Yeni ipuçları: "Raportör" (`[Raportör]`,
  politika hâkim ve savcı satırına eklendi) ve yalnız etiket biçiminde "Başvurucu :" (`[Başvurucu]`, cümle içinde
  "başvurucunun Adalet Bakanlığına" kurum adını yakalıyordu). STOP: Başkanvekili, Üyeler, Üyesi, Raportör, Başvurucu.
- `public_names.index_text`: arama dizini ve özet için açık üye adlarını `[Üye n]` yapan saf fonksiyon; casuist'in
  parça metninde kullanması istendi (Ek E: kişi adıyla arama ve dizin yok, FR-21).
- Editör onayı (`store.py`, `job.py`, `approvals.py`): `anon.run`, aynı sürümün en son kararı `onay` ise ve bütün
  inceleme öğelerini kapsıyorsa yayımlar (`masked_text`, `anonymized`, `embed.chunks`, spanlarda `reviewed_by`,
  `reviewed_at`); sonraki `ret` veya `duzelt` onayı iptal eder; `blocked` kalem onayla yayımlanmaz.
  `python -m anonymizer.approvals` onaylı ve yayımlanmamış kayıtlar için `anon.run` koyar. Tetik kimliğin
  (`admin.ts`, istek madde 3).
- Fikstür sayıları (yalnız kural katmanı, ad yazdırmadan): AYM bireysel başvuru 5 kurul adı açık (Başkan ve 4 üye),
  raportör maskeli, başvurucu ve vekil kaynakta baş harfle; aynı metin açık kaynak dışı mahkemeyle 6 kişi maskeli. AYM
  norm denetimi imza bloğunda 17 üye açık, metindeki raportör maskeli; kaynak dışıyla 18 maskeli. Yargıtay HGK ve
  Danıştay İDDK fikstürlerinde kişi spanı 0, maskelenmemiş taraf adı 0 (iki kaynak da tarafları kendisi gizliyor:
  "Taraflar arasındaki", "(DAVALI) : ..."); kalan büyük harfli diziler mahkeme, kurum, genelge adı ve "Tetkik
  Hâkimi" (her biri beklenen ifadeyle doğrulandı). Gerçek metne yazılan sentetik taraf, vekil ve imza satırı maskeli.
- Ölçüm: `eval/anon/raporlar/anon-0.4.0-{sentetik,zor}.json` anon-0.3.0 ile aynı (sentetik kişi %97,21, zor %28,99,
  kesinlik %100). 15.3/2 kapısı kanıtlanmadı, geçmedi sayılır.
- Doğrulama: `uv run pytest` 533 geçti, 15 atlandı; `KAZUIST_IT_DATABASE_URL` ile (yerel geçici PostgreSQL 18.6,
  migration 0000-0008) 534 geçti, 14 atlandı: onay, kuyruklama, yayın, `ret` iptali ve ölü iş koruması gerçek SQL ile.
- Açık: kimlik tetikleyicisi ve casuist `index_text` kullanımı (istek); `duzelt` yaması uygulanmıyor; AİHM ve ABAD
  kurul biçimleri (İngilizce "composed of") tanınmıyor, bu kaynaklarda üyeler maskeli kalır (güvenli yön);
  `docs/kaynaklar/aym.md` notu veri-toplama'da.
## 15 Kasım 2026, kimlik: edu_claims okuması, 23505 eşlemesi, ek maskeleme sonrası yeniden gösterme (kimlik/edu-claims-yeniden-goster)

Orkestra görevi: `docs/istekler/mimar-yonlendirme-4-sozlesme-v1-6.md` kimlik maddeleri 1 ve 2, DEVIR'deki açık iş
("ek_maskeleme sonrası yeniden gösterme adımı yok"). `packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
- `apps/web/src/server/auth/edu.ts`: `claimedByOther` `edu_claims`'ten tek satır okur (`email` birincil anahtar);
  eski `normalizedColumn` taraması kalktı. Onay işleminde tetikleyicinin SQLSTATE 23505 (`constraint = 'edu_claims_pkey'`)
  hatası `isEduClaimConflict` ile tanınır (Drizzle sarmalayıcısında `cause` zinciri) ve `taken` sonucuna, uçta 400
  `hata.eduKullanimda`'ya eşlenir; işlem bütünüyle geri alınır (rol ve profil dahil). Danışma kilidi kaldırıldı: iki eş
  zamanlı onay `edu_claims` birincil anahtarında sıralanır, ikincisi 23505 alır; gerçek PostgreSQL'de iki bağlantılı
  yarış testiyle doğrulandı.
- Test `__tests__/edu-claims.test.ts`: her zaman PGlite, `KAZUIST_IT_DATABASE_URL` verilirse gerçek PostgreSQL. Tetikleyicinin
  yazdığı talep ve yıllık yenileme; geri doldurulmuş talebin (çağıranın satırı olmadan) kodu engellemesi; kontrol ile
  güncelleme arasına giren yazıcı (test tetikleyicisi) ve 23505 eşlemesi; başka 23505'in (users e-posta) karışmaması;
  yalnız sunucuda iki bağlantılı gerçek yarış. Not: Drizzle'ın hata mesajı sorgu parametrelerini (adres dahil) taşır;
  bu hata loglanmaz, yutulur.
- `apps/web/src/server/auth/takedown.ts`: kayıt hedefli `ek_maskeleme` kararı `anon.run`'a ek olarak `takedowns`
  kuyruğunda bir yeniden gösterme kalemi açar (`subject_type = 'takedown_release'`, `subject_id` talep,
  `payload = { action: 'release_after_remask', takedownId, recordId }`). Kalem kararı (`decideRelease`, aynı
  `POST /v1/admin/queues/takedowns/{itemId}/decision` ucu, personel, passkey ve ikinci adım):
  - `onay`: yalnız yeniden maskeleme bitmişse: kaydın en yeni `anon.run` işi (`anon:<id>`) `done`, `masked_text` dolu ve
    `anonymized`, açık `anonymization` kalemi yok. Değilse 409 `hata.maskelemeBekliyor`, kalem açık, kayıt gizli. Bitmişse
    kalem kapanır ve `records.hidden_at` temizlenir; aynı hedefte `gecici_gizlendi`, `kalici_kaldirma` ya da yeniden
    gösterme kalemi onaylanmamış başka `ek_maskeleme` varsa kayıt gizli kalır (o talep sonuçlanınca gösterilir).
  - `ret`: kalem kapanır, kayıt kalıcı olarak gizli kalır. `duzelt`: `anon.run` yeniden kuyruğa, kalem açık.
  - Kapatma ve gösterme tek işlemde, hedef üzerinde danışma kilidiyle; denetim kaydı `takedown.release.<karar>`.
  - `otherRequestKeepsHidden` artık yeniden gösterme kalemi onaylanmış `ek_maskeleme` talebini gizleyen saymaz; `ret`
    yolu da bunu kullanır. Bu değişiklikten önce sonuçlanmış `ek_maskeleme` taleplerinin kalemi yoktur ve gizli tutmaya
    devam ederler (güvenli yön).
- Bilgi: anonimleştirme kuyruğundaki `onay` kararı bugün kimse tarafından uygulanmıyor (`masked_text` boş kalır);
  inceleme gerektiren yeniden maskelemede kayıt, anonimleştirici onaylı maskeleri yayımlayana kadar gösterilemez.
- Test `admin-kvkk.test.ts`: erken onay 409; incelemeye düşen çalışma ve onaylanan anonimleştirme kalemi sonrası yine
  409; personel olmayan 403; yayımlanınca onay kaydı gösterir, kalem kapanır, denetim satırı; iki maskeleme talebi;
  geçici gizlenen talebin `ret`'i; kalıcı kaldırma altında gizli kalma ve kalem `ret`'i; kalem `duzelt`'i.
- Açık: yönetim panelinde takedowns kuyruğu ekranı yok (yalnız API); Kampüs hedefleri için yeniden maskeleme yok.
## 15 Kasım 2026, casuist ve yz-gecidi: sözleşme v1.6 sonrası süzgeç geçişi ve temizlik (casuist-contract-1-6-filters)

`docs/istekler/mimar-yonlendirme-4-sozlesme-v1-6.md` casuist madde 1-3 ve yz-gecidi madde 1-2. Sözleşme, şema ve
bağımlılık değişmedi.
- casuist: `apps/web/src/app/ara/_sunucu/ozet.ts` `preparePost` `PrepareRequest.filters`'ı `search()`'e
  `POST /v1/answers` ile aynı biçimde geçirir. `hasControlChars` ve iki uçtaki ek satır kalktı (kural artık şemada,
  `QuestionText`); 400 testi kaldı. `packages/casuist/src/api.ts` `toSearchResponse` dönüş tipi yalnız `SearchResponse`.
  `/ara` (`page.tsx`, `OzetAlani.tsx`, `_bilesen/byok.ts`) iki özet kipinde de sayfanın süzgeçlerini gönderir;
  `filtreler` prop tipi `AnswerFilters`.
- yz-gecidi: `packages/ai-gateway/src/byok/client.ts` `PrepareBody.filters` ve `ByokRunInput.filters`; `setFilters` boş
  alanları atar, hiç süzgeç yoksa gövde eskisiyle aynıdır. `packages/i18n/tr/byok.json` `ozet.filtre` kaldırıldı.
  `scrubParts` denetim karakteri silmesi değişmedi.
- ADR-0001 "en az 12 karakter" diyor, plan ve kod 20: mimara istek `docs/istekler/casuist-adr-0001-alinti-uzunlugu.md`;
  `validator.ts` yorumundaki eski "12" anlatımı düzeltildi.
- Doğrulama: web 776 ve 1 atlanan (yeni: prepare süzgeçleri ve platformla aynı kaynaklar, sözleşme dışı süzgeç 400,
  BYOK uçtan uca süzgeç), ai-gateway 144 ve 3 atlanan (yeni: prepare gövdesinde süzgeç), casuist 119, i18n 23; `pnpm typecheck`, `pnpm lint`,
  `pnpm check:text`, `pnpm build` yeşil. Playwright `byok.spec.ts` yerel üretim derlemesinde (PostgreSQL 18.6, boş
  derlem, CI koşulu) 9/9. Süzgeçli BYOK özeti tarayıcıda (fikstür derlem, OpenRouter taklit): prepare gövdesinde
  süzgeçler, kaynaklar yalnız Kurul kararı, eski not yok; 375, 768, 1440 px ekran görüntüsü, axe ciddi ve kritik 0.
- Açık: `byok.spec.ts`'in fikstür derlemli dalı (yerel koşu) başarısız, bu PR'dan bağımsız: taklit model alıntıyı
  pasajın ilk satırından (künye) alıyor, doğrulayıcı künyeden alıntıyı #101 kuralıyla (main'e #106 ile girdi) reddediyor. CI boş derlemle
  çekimser dalı koşar ve geçer. Dosya kalite-guvenlik'in; `modelReply` künye satırını atlamalı.
## 15 Kasım 2026, veri-toplama: sözleşme v1.6 sonrası işler (yönlendirme 4)

- `core/sources.py`: `RECORD_PROTOCOL_STATUSES` `gerekli_yapilmadi` içerir (veri tabanı enum'uyla aynı küme, testle
  `packages/db/src/schema/corpus.ts` karşılaştırılır); Yargıtay ve Danıştay kayıtları artık `gerekli_yapilmadi` yazar.
- `core/discovery.py`: `_CASE_NO` sözleşmeyle aynı desen (`^[0-9]{4}/[0-9A-Za-z()-]+(?:/[0-9]+)?\Z`, en çok 50,
  ASCII rakam); belge kimliği `^[0-9]{1,20}\Z`. Sonda `/<rakam>` taşıyan numara artık `BadJob` ile ölmez. Belge başı ve
  `core/scheduler.py` başı v1.6'ya göre güncellendi; `contract_pending` düzeneği ileri sürümler için kaldı.
- `tests/test_scheduler_e2e.py` (yeni): `run_tick` gerçek `ENQUEUE_ONCE_SQL` ile sahte jobs tablosuna yazar, gerçek
  `JobConsumer` gerçek `CLAIM_JOBS_SQL` ile alıp gerçek `ingest.fetch` işleyicisine verir; hiçbir iş geçersiz yük diye
  gömülmez, işleyici `BadJob` atmaz, keşif işlerinin kuyruğa koyduğu devam işleri sözleşmeye uyar, dry-run CLI
  `contract_pending` üretmez. `docs/kaynaklar/{yargitay,danistay,README}.md` metinleri güncellendi.
- Doğrulama: `uv run pytest` 535 geçti, 15 atlandı; `pnpm check:text` geçti.

## 15 Kasım 2026, mimar: sözleşme v1.6, migration 0008, ADR-0038 (mimar/sozlesme-v1-6)

Yedi istek tek ADR ve tek sürümle işlendi; yalnız ekler, yıkıcı adım yok; canlı veri tabanına hiçbir şey uygulanmadı.
Taban: PR #105 (veri-toplama), #103 (on-yuz), #106, #107, #108 ve #104 birleştikten sonraki main; yeni yükleri üreten kod #105'tedir.
- Sürüm: `packages/contracts` ve `packages/db` 1.6.0 (`openapi.yaml`, `CONTRACT_VERSION`, iki `package.json`);
  `src/generated/api.ts` yeniden üretildi. Migration `0008_v1_6_edu_claims_protocol_status.sql` ve snapshot. Kaldırıcı
  adım B (ADR-0036) artık "migration 0008" değil, o gün sıradaki boş numara.
- `ingest.fetch` (`packages/contracts/src/jobs.ts`, `services/worker-py/core/jobs.py`): `z.union`; KVKK ve Rekabet liste,
  AYM liste ve belge, Yargıtay ve Danıştay liste ve belge biçimleri. İstekten iki sapma: AYM kimliği `z.guid()`
  (bankanın kimlikleri RFC 9562 değil, fikstürde sürüm hanesi 0), esas ve karar numarası `case_number` biçiminde (sonda
  `/<rakam>`, ASCII rakam, en çok 50). Ortak fikstüre 10 geçerli ve 21 geçersiz örnek. `tests/test_scheduler.py`'deki
  `contract_pending` testi "bütün gece işleri sözleşmede" testine çevrildi (veri-toplama dosyası, sözleşmenin sonucu).
- `protocol_status` `gerekli_yapilmadi` (istekte `gerekli`; kaynak dosyalarındaki sözcük).
- `edu_claims` (posta kutusu birincil anahtar), `edu_mailbox()` ve `edu_verifications_claim` tetikleyicisi: her yazıcı
  bağlanır, başka hesabın posta kutusu 23505 (`edu_claims_pkey`, mesajda adres yok); `users`'a yabancı anahtar yok
  (purge değişmedi); geri doldurmada en eski kazanır, diğer satırlar değişmez ve adressiz `WARNING` ile sayılır;
  `edu_verifications_user_idx`.
- OpenAPI: `SearchResponse.degraded` (açık liste, bilinen değer `vektor`), ortak `QuestionText` (C0 ve DEL deseni) ve `AnswerFilters`,
  `PrepareRequest.filters`. Zod: `QuestionText`, `QUESTION_TEXT_PATTERN`, `AnswerFilters`.
- `.env.example`: `KAZUIST_ENV` ve `KAZUIST_NER_BACKEND` açıklamaları, `KAZUIST_MODULLER`, `KAZUIST_SCHEDULER`,
  `KAZUIST_SCHEDULER_DRY_RUN`, `KAZUIST_SCHEDULE_TICK_SECONDS`, `KAZUIST_SOURCE_{AYM,YARGITAY,DANISTAY}`.
- Belgeler: ADR-0038 (dar çekirdek kaydı madde 8; ADR-0033'e not), ADR dizini, IP kaydı, sahiplik (byok.json
  yz-gecidi, worker-py testleri veri-toplama, tarihli teyit notu), istek sonuçları, v1.6 karar tablosu, yönlendirme
  `docs/istekler/mimar-yonlendirme-4-sozlesme-v1-6.md`.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, Redocly lint, i18n denetimi, `pnpm test` (contracts 160,
  db 62, web 773 ve 1 atlanan, worker-node 118, ledger 174, casuist 119, ai-gateway 143 ve 3 atlanan, ui 31, i18n 23),
  `pnpm build`, enjeksiyon seti 60/60 ve `uv run pytest` (513 geçti, 15 atlandı) geçti; `check:generated` commit'ten sonra
  temiz. Gerçek PostgreSQL 18.6 (yerel, geçici küme): v1.5 verisinde migration 0008, geri doldurma ve `WARNING`, iki
  oturumun aynı posta kutusunu aynı anda doğrulaması (ikinci oturum bekledi, sonra 23505), REPEATABLE READ'de 23505,
  yeni enum değerinin yazılması.
- Açık: veri-toplama `RECORD_PROTOCOL_STATUSES` ve `_CASE_NO`; kimlik `claimedByOther` ve 23505 eşlemesi; casuist ve
  yz-gecidi süzgeç geçişi (yönlendirme dosyasında). ADR-0038 ve ADR-0033 Tarık onayı bekliyor.

## 15 Kasım 2026, altyapi: tek sunucu üretimi, GHCR imajları, sunucu dışı yedek ve geri yükleme testi (altyapi/tek-sunucu-uretim)

Orkestra görevi (review.md P2, ADR-0033): hedef tek Hetzner x86 sunucusu (8 vCPU, 16 GB; CX43 ya da CPX42, henüz
alınmadı), Coolify, Cloudflare DNS only, ödemesiz ve BYOK ile yayın. Sunucu olmadığı için hiçbir sunucu, DNS ya da
Coolify işlemi yapılmadı; her şey CI'da gerçek Docker ile sınandı. `packages/contracts` ve `packages/db` değişmedi;
yeni npm ya da Python bağımlılığı yok. Sunucu tarafında restic resmî imajı (0.19.1, BSD-2-Clause, özetle sabit)
kullanılır.
- CI (`.github/workflows/ci.yml`): imajlar `docker/build-push-action@v7` ile `linux/amd64` ve GHA katman önbelleğiyle
  derlenir; PR'da yalnız derleme ve test. Yeni `publish` işi yalnız main push'unda ve node, python, gitleaks, docker
  yeşilse beş imajı GHCR'ye iter (`ghcr.io/tialkan/kazuist-{web,worker-node,migrate,worker-py,maintenance}`, etiket
  sha ve `main`), itilen imajın root olmadığını ve revision etiketini denetler. `BUILT_AT` commit zamanıdır (aynı
  commit aynı katmanlar), `APP_VERSION` `apps/web/package.json`'dan. main koşuları artık yarıda iptal edilmez.
- `infra/docker-compose.prod.yml`: Coolify Docker Compose kaynağı; bellek sınırları (takas dahil) postgres 6g,
  worker-py 3g, web 1g, worker-node 512m, migrate 512m, valkey 256m, bakım 64m; sağlık denetimleri; migrate kapısı
  (`service_completed_successfully`); `ports:` yok; `pgdata` birimi; `/srv/kazuist/raw-store` bind;
  `/srv/kazuist/models/{ner,embed}` salt okunur; uygulamalar root değil, `cap_drop: ALL`, `no-new-privileges`;
  zorunlu değişkenler `${X:?}`. Web'e on-yuz'un `KAZUIST_MODULLER` (PR 103, isteğe bağlı) ve bütün hizmetlere tek
  zorunlu `KAZUIST_ENV` verilir (worker-py imaj öntanımı production olduğu için provada `staging` açıkça girilir).
  CI aynı dosyayı CI imajlarıyla ayağa kaldırır; sağlık, sınırlar, port yokluğu, uid, ham arşiv yazımı, model
  klasörünün salt okunurluğu, `/api/version` commit'i ve worker-py iç API'sine erişimi denetler.
- CI'daki yığın sınaması gerçek bir hata buldu: boş `KAZUIST_POLL_SECONDS` worker-py'yi `float('')` ile düşürüyor
  (`core/main.py`, veri-toplama). Değişken compose dosyasından çıkarıldı, diğer isteğe bağlı değişkenlerin boşu
  tanımsız saydığı kontrol edildi; istek `docs/istekler/altyapi-worker-py-bos-degisken.md`.
- worker-py: ham arşiv `/data/raw-store` (`KAZUIST_RAW_DIR`), imajda `app` sahipli.
- `/api/health`: `S3_ENDPOINT` ve `S3_BUCKET` kritik listeden çıktı (okuyan kod yok); test ve CI S3'süz 200'ü sınar.
  `.env.example` için mimara istek: `docs/istekler/altyapi-env-example-tek-sunucu.md`.
- `.dockerignore`: `apps/web/**/_kanit` (yaklaşık 29 MB), `infra/backup`, compose dosyaları, `review.md`; CI imajların
  içinde arar.
- `infra/backup/`: `backup.sh` (pg_dump özel biçim, `pg_restore --list` denetimi, roller, ham arşiv, Coolify `.env`
  ve yedekleri; saklama 4 son, 7 gün, 4 hafta, 6 ay; pazar prune ve %5 veri denetimi; başarı ve hata ping'i),
  `restore-test.sh` (geçici, ağsız PostgreSQL'e `pg_restore --single-transaction`, migration, uzantı, defter dengesi,
  satır sayıları canlıyla yan yana, isteğe bağlı `db-smoke.sql` ve doğruluk sorgusu, ham arşivden 50 dosya sha256,
  süreler, her durumda temizlik), `disk-check.sh` (disk, inode, yedek yaşı), systemd zamanlayıcıları (6 saatte bir;
  RPO 6 saat). CI: işaret satırı, yedek, geri yükleme, işaretin varlığı, yanlış sorgunun testi düşürmesi, kapsayıcısız
  yedeğin hata vermesi.
- CI docker işine `KAZUIST_IT_DATABASE_URL="$DATABASE_URL" pnpm --filter @kazuist/worker-node exec vitest run
  src/account` eklendi.
- Runbook: yeni `docs/runbook/ilk-kurulum.md` (Hetzner Firewall, SSH, ufw, takas, Coolify kurulumu ve tünel, klasörler,
  GHCR girişi, Coolify kaynağı, değersiz değişken tablosu, ilk dağıtım, kapalı prova `KAZUIST_ENV=staging`, yayın
  günü); `coolify.md`, `dagitim.md` (elle terfi, dış kabul testleri), `geri-alma.md` (sha ile geri dönüş),
  `yedek.md` (restic, felaket kurtarma), `izleme.md` (yalnız dış izleme ve kalp atışı; GlitchTip, Uptime Kuma, Umami
  bu sunucuda yok), `dns-yedek.md` (geçici prova alt alanı), `vps-secimi.md` (CX43 ve CPX42, 15 Kasım okuması)
  yeniden yazıldı.

Açık: sunucu siparişi; Storage Box; GHCR okuma token'ı ya da paketleri açık yapma kararı; dış izleme servisi seçimi;
sunucuda ilk geri yükleme testi ve raporu; kapalı prova alt alanı için DNS onayı; Coolify'ın `container_name` ve
`exclude_from_hc` davranışının kurulum günü doğrulanması; arm64 derlemesi (yalnız Arm sunucu seçilirse); sürekli WAL
arşivi (RPO 6 saatten kısa istenirse); hukuk-uyum için yedeklerde silinen hesap verisinin 6 aya kadar kalması.

## 15 Kasım 2026, on-yuz: dar çekirdekli yayın bayrağı, hata ve yükleme sayfaları, bağlantı denetimi (on-yuz/dar-cekirdek-yayin)

Orkestra görevi (Tarık kararı): ilk yayın dar çekirdek; onaylı içeriği olmayan modül üretimde görünmez.
`packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
- Tek karar dosyası `apps/web/src/app/(kabuk)/_kabuk/yayin.ts`: `ertelenenModuller = pratik, kalemcik, atif-agi`.
  Üretim derlemesinde (`NODE_ENV=production`, `KAZUIST_ENV` development ya da test değilse; güvenli tarafta kapanır)
  bu modüller sekmelerden, alt bilgiden, ana sayfadan, Yazma'daki Kalemcik kartından, site haritasından ve
  llms.txt'den çıkar; rotaları `layout.tsx` içindeki `notFound()` ile 404 döner. `KAZUIST_MODULLER=pratik,...` ya da
  `hepsi` üretimde açar. `next dev`, testler ve `KAZUIST_ENV=development` ile başlatılan yerel üretim hepsini gösterir.
- `app/error.tsx` ve `app/global-error.tsx` (ortak gövde `HataGovdesi.tsx`; yalnız digest, ileti ve yığın yok),
  `not-found.tsx` başlığı; `loading.tsx` Kaydettiklerim ve Atıf ağı için; Yazma'da dergi listesi `Suspense` ile
  (dergi profili 404'ü 200'e dönmesin diye `yazma/loading.tsx` konmadı). Metinler `ortak.json` `durum.*`.
- Ana sayfa: yer tutucu künyeler yerine fikstür derleminden KVKK m.11, TBK m.49 ve m.72 (metin resmî metinden
  kısaltıldı); `/` ve `/bakim` başlıkları `title.absolute` ile tek markalı.
- Kırık bağlantı: `/hesap/cuzdan` (ödeme ve fesih bildirimleri) yerine `/hesap`; `apps/web/test/baglantilar.test.ts`
  web, worker-node ve sözlüklerdeki sabit iç adresleri sayfa dosyasına karşı denetler. `/yonetim` yalnız robots
  yasak listesinde, bağlantı yok.
- Yazma: kredi yetersizliği ve bütçe tavanı (`GatewayError`/`ReservationError` `insufficient_credits`, `BudgetError`,
  platform anahtarına OpenRouter 402) `kredi_yetersiz` ve `butce_tavani` kodlarıyla ayrı iletiye düşer; kural çıkarma
  iş kaydında ve kısaltma `X-Yazma-Oneri` başlığında. Sonnet yedeği bu durumda denenmez.
- Doğrulama: typecheck, lint, check:text, web 693 (1 atlandı), worker-node 118, i18n 23, ui 31, build yeşil;
  üretim kipinde `/pratik`, `/kalemcik`, `/atif-agi` 404, geliştirme kipinde 200; 5 sayfa x 375/768/1440 axe 0,
  taşma 0 (`docs/tasarim/ekran/dar-cekirdek/`).
- İstekler: `docs/istekler/on-yuz-dar-cekirdek-yayin.md` (mimar ADR ve `.env.example`, altyapı web imajında
  `KAZUIST_ENV=production`).
## 15 Kasım 2026, veri-toplama: AYM, Yargıtay, Danıştay bağlayıcıları, keşif işleri ve zamanlayıcı (worktree-agent-ac159744b3b120907)

Üç yeni kaynak (hepsi `tarik_onayi: bekliyor`, anahtar varsayılan kapalı), kuyruk tabanlı keşif ve zamanlayıcı. Sözleşme,
şema ve bağımlılık değişmedi; yeni yük biçimleri için `docs/istekler/veri-toplama-ingest-payloadlari.md` (o gelene kadar
yeni kaynak işlerini tüketici "invalid payload" diye gömer, zamanlayıcı onları `contract_pending` diye atlar).
- `connectors/aym.py` (norm denetimi 5.620 ve bireysel başvuru 18.003; yalnız JSON ucu `POST /api/core/public/search`;
  PDF/UDF indirmeleri sitenin CAPTCHA kapısında olduğu için hiç kullanılmaz; başvurucu adı `basvuruAdi` hiçbir kayda
  kopyalanmaz), `connectors/yargitay.py` (BGK=İBK 40, HGK, CGK) ve `connectors/danistay.py` (İBK siteden 0 sonuç, İDDK,
  VDDK), `connectors/judicial.py` (paragraf ve tablo satırı farkındalıklı HTML'den metin, tarih ve numara yardımcıları).
- `core/fetcher.py`: POST (JSON gövde) desteği, POST yönlendirmede tekrarlanmaz; `core/challenge.py`: CAPTCHA ve bot
  denetimi cevabı (`DisplayCaptcha`, `reCaptchaTimeout`, reCAPTCHA, hCaptcha, CDN sayfaları) kaynağı anında durdurur
  (`ChallengeDetected`), elle `reset` gerekir; aşılmaz. Üstbilgi yalnız `KazuistBot/1.0`; taklit Origin, Referer yok.
- `core/discovery.py`: liste işi bilinmeyen kararlar için belge işi ve sıradaki sayfa işini kuyruğa alır (kuyruk durumu
  devam noktası); KVKK ve Rekabet için de liste işi. `core/runtime.py` yeni yükleri yönlendirir; `Repository.known_source_keys`.
- `core/scheduler.py`: RG günlük (07:00 sonrası), KVKK, Rekabet, AYM, Yargıtay, Danıştay haftalık, EUR-Lex aylık, 01:00-06:00
  penceresi, eski yıllar için günde bir birim-yıl doldurma; anahtar, onay, kesici ve pencereye uyar; `python -m core.scheduler
  --dry-run`; `KAZUIST_SCHEDULER=on` işçide döngüyü başlatır (`core/main.py`), `KAZUIST_SCHEDULER_DRY_RUN=on` yalnız loglar.
- `core/cli.py`: `python -m core.cli sources | probe <kaynak>` küçük canlı örnek ve hata oranı.
- Mevzuat düzeltmesi: bağlayıcı sayfa kabuğunu çekiyordu (madde yok); metin `/anasayfa/MevzuatFihristDetayIframe` adresinden
  çekilir. mevzuat.gov.tr ve resmigazete.gov.tr bu ağdan cevap vermiyor (TLS tamam, HTTP cevabı yok), ham baytla doğrulama açık.
- Belgeler: `docs/kaynaklar/{aym,yargitay,danistay}.md` (robots, koşullar, kişisel veri, hız, protokol), mevzuat, resmi-gazete,
  kvkk, rekabet ve README güncellendi. Kod alınmadı (yargi-mcp yalnız uç şekli için okundu), `NOTICE` değişmedi.
- Doğrulama: `uv run pytest` 391 geçti, 15 atlandı (önce 328); `pnpm check:text` temiz. Gerçek canlı kontrol:
  aym, yargitay, danistay, kvkk, rekabet hata oranı 0,0; resmi-gazete ve mevzuat robots.txt okunamadı.
## 15 Kasım 2026, yz-gecidi: kaynaklı özet talimatı doğrulayıcının yeni kurallarıyla (yz-gecidi/ozet-talimati-dogrulayici)

Orkestra görevi: #101'in doğrulayıcı kurallarını modele söylemek, Ek D'yi #102 sonrası plan metniyle hizalı
tutmak. Dal #101'in dalından açıldı; main (#90-#102, #102 dahil) içine birleştirildi. `packages/contracts`,
`packages/db` ve `plan.md` bu dalda değişmedi (plan.md main ile aynı); yeni bağımlılık yok. Ayrıca
main'deki eski yz-gecidi satırının ikinci kopyası `docs/ilerleme.md`'den çıkarıldı (kimlik satırının kopyası kaldı).
- Birleştirme çakışmaları (casuist yolları, sahibine bilgi): `packages/casuist/src/answer/passages.ts` main'in
  `promptPassage` yardımcısı #101'in `body` ve `section` alanlarıyla birleşti (künye artık `kunye(r, section)`;
  `loadPromptPassages` de bölümlü künyeyi yeniden kurar); `apps/web/src/app/ara/_sunucu/sql.test.ts` içe aktarma
  listesi; `DEVIR.md` ve `docs/ilerleme.md` iki tarafın satırları korunarak.
- `packages/ai-gateway/src/prompt.ts` `SOURCED_SUMMARY_SYSTEM`: Ek D.1'in her satırı birebir (kural 2 #102
  metniyle: en az 20 karakter, künye satırından değil gövdeden, olumsuzluk korunur). Ek D'de olmayan üç ek: künye
  paragrafı (ilk satır künye, gerisi gövde, kararda "(Bölüm: ...)"), kural 3'e yazıyla sayı ve birim cümlesi
  ("on beş gün" için "15 gün" olur, "otuz gün" ve "on beş iş günü" olmaz), kural 6'ya iddia ve savunma, yargılama
  süreci ve karşı oy pasajının hükmü tek başına kurmadığı cümle. Kural numaraları 1-9 aynı. Ekler için plan isteği:
  `docs/istekler/yz-gecidi-ek-d-talimat.md` (önerilen Ek D.1, 7.4/3, 7.4/6, D.2/c ve pasaj biçimi metni).
- Tarayıcı kopyası yok: BYOK istemcisi talimatı `/v1/answers/prepare` paketinden (`bundle.system`, HMAC kapsamında)
  alır; değişiklik kendiliğinden geçer.
- Testler: `test/prompt.test.ts` (15): plan.md Ek D.1'in her satırı talimatta, dokuz kural sırasıyla; her kural
  için ifade; `MIN_QUOTE_CHARS`, `SECTION_LABELS`, `NON_BINDING_SECTIONS` ve `kunye()` ile çapraz denetim;
  talimattaki örnekler casuist doğrulayıcısında aynı sonucu veriyor (`alinti_kisa`, `alinti_bulunamadi`,
  `olumsuzluk`, `dayanaksiz_sayi`, `destekleyici`). Eski talimatla 15 testin 8'i düşüyor (elle denendi).
- Ölçüm düzeneği: `test/ozet-ab.ts` 50 soruyu fikstürde arar, üretimdeki gibi maskeler ve sarar, çıktıyı
  `parseJsonLines` ve doğrulayıcıyla sayar (yalnız sayı, metin yok); `test/ozet-ab.test.ts` betikli modelle
  düzeneği sınar (36/36 kabul, künye alıntısı 50/50 düşer, 15 karakterlik alıntı 36/36 çekimser);
  `test/ozet-ab.live.test.ts` ve `pnpm --filter @kazuist/ai-gateway test:ab` eski ve yeni talimatı gerçek modelle
  karşılaştırır (OpenRouter, zdr, 2 x 50 çağrı, tahminen 0,45 M girdi tokenı).
- Doğrulama (main #90, #91 ve #102 birleştikten sonra): typecheck, lint, check:text, build temiz; testler gateway
  143/3 skip, web 756/1 skip, casuist 119, worker-node 118, ledger 174, contracts 152, db 54, ui 31, i18n 23,
  worker-py 450/15 skip, enjeksiyon 60/60 önce ve sonra. `node eval/rag/olc.ts` önce ve sonra aynı (getirme 36/36, birebir satır 36/36, birebir cümle 67/67,
  saldırı 0/283; yalnız arama süresi oynadı). Bu iki set talimatı modele göndermez; modelli çekimserlik ölçülmedi
  ve geçti sayılmadı: `~/Desktop/kazuist-openrouter.txt` yok.
- Açık: canlı A/B (anahtar dosyası gelince `test:ab`); orkestra Ek D eklerini plana alır; ADR-0001'deki "en az 12
  karakter" ifadesi mimarındır.

## 15 Kasım 2026, casuist: dış inceleme düzeltmeleri, doğrulayıcı, karar bölümleri, AND öncelikli arama (casuist/inceleme-dogrulayici-arama)

Orkestra görevi: dış incelemenin beş maddesi. `packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
Komşu işler: `docs/istekler/casuist-arama-kalitesi.md` (mimar `degraded` alanı, veri-toplama AB satırları,
yz-gecidi ve plan Ek D metni, altyapı CI adımı).
- Doğrulayıcı (`packages/casuist/src/answer/`): alıntı künye satırından değil pasaj gövdesinden (`body`); sayı
  denetimi künyeyi kapsamaya devam eder. `MIN_QUOTE_CHARS` 12'den 20'ye (ölçüm `eval/rag/alinti.ts`, rapor
  `eval/rag/raporlar/alinti-esigi.md`: 12'de %14,5, 16'da %10,0, 20'de %6,6, 24'te %5,1, 32'de %3,8 genel alıntı;
  dirsek 20, alıntılanamayan yalnız "III. Tazminat" gibi başlık parçaları). Yazıyla sayı ve birim
  (`quantities.ts`: bir..doksan, yüz, bin, milyon, milyar, birleşik "onbeş", gün/ay/yıl/iş günü/yüzde/lira ...):
  aynı değer ve birim gerekir, "15 gün" ile "on beş gün" birbirini karşılar, "on beş gün" ile "otuz gün" düşer.
  Olumsuzluk (`negation.ts`, ret nedeni `olumsuzluk`): -mA- eki ünlü uyumuyla (kararname, komedi dışarıda),
  -mAzlIk adları, "işlenip işlenmediğini" ve "yok edilir" olumsuz sayılmaz; alıntı kelime sonuna ve ardından gelen
  "değil/yok"a uzatılır; eklenen, düşen ve fiil bazında çevrilen (-AmAz/-Abilir) olumsuzluk düşer. Durumu
  değişti, yürürlükten kalktı ya da bozuldu olan kaynakta `guncellik` uyarısı her zaman (ozet.json metni
  güncellendi).
- Karar bölümleri: `chunk.ts` ve `services/worker-py/nlp/chunk.py` (ikisi de casuist'in) karar ve kurul kararında
  başlıkları tanır (satır başında ve satırı birleşmiş metinlerde cümle sonundan sonra numaralı başlık): `iddia`,
  `surec`, `gerekce`, `hukum`, `karsi_oy`. Başlık yeni parça başlatır; yalnız başlık olan satır sonrakine katılır.
  `parcalar.json` bölümlerle yeniden üretildi, Python eşliği testte. Worker kayıt türünü okur (`READ_SQL`
  `type::text`). İddia, süreç ve karşı oy pasajı bağlayıcı kayıttan gelse de cümleyi tek başına bağlayıcı yapmaz
  (`bindingPassage`, `destekleyici`); bölüm künyede "(Bölüm: karşı oy)" olarak modele ve imzalı isteme geçer.
- EUR-Lex: `connectors/eurlex.py` `karsilastirmali` (veri-toplama yolu, orkestra talimatıyla tek satır ve test).
  Eski satırlar upsert ile düzelmediği için casuist `SERVED_AUTHORITY`/`servedAuthority` ile AB ve yabancı kayıtları
  etikette ve otorite süzgecinde karşılaştırmalı sunar (doktrin hariç); canlı kaynak kayıtlarına da uygulanır.
- Arama: `sql.ts` tam metin kolu önce `websearch_to_tsquery('turkish')` (AND, tırnaklı ifade korunur, operatör
  geçmez), 5 kayıttan azsa OR sorgusu eklenir (`OR_FALLBACK_BELOW`, ölçüm için `fullText: 'or'`). `degraded`
  `/v1/search` yanıtında (boş değilken) ve `/ara`'da "Kısıtlı arama" notu (`KisitliArama.tsx`).
- `/ara`: özet ve Kaydet giriş bağlantıları `/giris?sonra=` ile aynı aramaya döner (`donusAdresi`: safeNext'in
  kabul ettiği katı yüzde kodlama, 200 karakter sınırı); taranan kaynaklar listesinde Yargıtay yok (bağlayıcısı
  yok), Rekabet ve OpenAlex/Crossref eklendi, fikstür kipinde fikstür içeriği yazılır; meta açıklaması mahkeme
  kararı iddia etmiyor.
- Ölçüm (50 soruluk set, fikstür): getirme ilk 10 %100 (36/36) önce ve sonra; birebir satır 36/36; ilk üç pasajın
  ilk cümlesi birebir 67/67 (önce 69/69, parça sınırları değişti). Yeni saldırılar önceki kodda 139/283 satır
  gösterdi (künyeden alıntı 36/36, yazıyla sayı 36/36, eklenen olumsuzluk 34/34, düşen olumsuzluk 33/33), şimdi
  0/283. PostgreSQL (PGlite) üzerinde OR ve AND öncelikli: recall@10 1,0 ve MRR@10 0,905 aynı; 36 sorunun hiçbirinde
  AND tek başına 5 kayda ulaşmadı (75 kayıtlık derlem), yani bu sette etki ölçülemedi; gerçek corpus ölçülmedi.
- Test: casuist 118, web 675/1 skip (yeni: giriş dönüşü, Kısıtlı arama, AND öncelikli, AB otoritesi, set-50
  PostgreSQL), worker-py 312/10 skip, enjeksiyon 60/60; typecheck, lint, check:text, build yeşil. Yerel üretim
  derlemesinde (fikstür) `/ara` 375/768/1440 axe ihlali 0; dönüş bağlantısı `/giris` sayfasına safeNext'ten geçerek
  ulaşıyor. "Kısıtlı arama" notu fikstürde görünmez (fikstürün vektör kolu var); render testiyle doğrulandı.
- Açık: plan Ek D metni ve model talimatı yeni kurallara göre (istek madde 3), üretimde AB satırlarının veri
  düzeltmesi (Tarık onayı), `degraded` sözleşme alanı, olc.ts'in CI adımı.

## 14 Kasım 2026, kimlik: atıf kuyruğu kararları, bildirim ve push uçları, iade bağlantısı (kimlik/v1-5-atif-bildirim-iade)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` kimlik madde 3 ve 4; `hukuk-uyum-p5-tutarlilik.md` madde 4 ikinci
alt madde (review.md P8 madde 3). Sözleşme, şema, migration ve bağımlılık değişmedi. Canlı veri tabanına hiçbir şey
uygulanmadı.
- Atıf kuyruğu: yeni uç yok; sözleşmedeki `POST /v1/admin/queues/{queue}/{itemId}/decision` `citations` kuyruğunda
  artık kenarı yazar (`server/auth/citation-queue.ts`, `admin.ts` `decideCitation`). `onay` `confirmed = true,
  rejected = false`; `ret` `rejected = true, confirmed = false`, `confidence` korunur (eski `confidence = 0` biçimi
  yazılmaz). `payload.kind` `karar` ise `citation_edges`, `doktrin` ise `work_citations`; kenar yalnız
  `from_record_id = payload.recordId` ise güncellenir. Kuyruk satırının kapanması ve kenar yazımı tek işlem; ikinci
  karar 404; `duzelt` bu kuyrukta 400. Denetim kaydı `admin.queue.<karar>`, fark: tür, kenar kimliği, `applied`.
  Yetki mevcut yönetim kapısı: editör ya da yönetici, passkey oturumu, oturumda TOTP onayı.
- Editör ekranı `/hesap/yonetim/atif-kuyrugu` (noindex): aynı kapı (`account-view.ts` `staffReady`); personel
  olmayana 404, onaysız personele güvenlik sayfası bağlantısı. Aday başına tür, aday karar ya da eser, atıf yapan
  kararın başlığı ve numaraları, güven, gerekçe kodları, maskeli bağlam, isteğe bağlı not, Onaylayın ve Reddedin.
  `/hesap` personel için "Yönetim" bölümünü gösterir.
- Uçlar (sözleşmede `planlandi` idi): `GET`/`PUT /v1/notifications/preferences` (kanal haritası o kanalı değiştirir,
  gönderilmeyen kanal saklı kalır; zorunlu e-posta türleri `odeme`, `fesih_teyidi` haritadan düşer, işçinin listesiyle
  test eşitliği), `POST /v1/push/web-subscriptions` (yalnız tarayıcı push servislerinin https uç noktaları ve RFC 8291
  anahtar uzunlukları: işçi bu adrese POST attığı için SSRF koruması), `POST /v1/push/apns-tokens`. Aynı cihaz başka
  hesapta kayıtlıysa çağırana taşınır; kanal başına en çok 10 cihaz; yeni hız kuralı `pushUser` (saatte 20). Hepsi
  sözleşme zod şemasıyla, kullanıcı kimliği yalnız oturumdan; denetim kaydında kanal adı, uç nokta ya da jeton yok.
- `/hesap/bildirimler`: dört üretilen tür (teslim hatırlatması, Kalemcik, ödeme, fesih) için e-posta, tarayıcı ve
  iPhone kutuları; zorunlu e-posta kutuları işaretli ve kapalı; sessiz saat notu (22.00-08.00, `quiet-hours.ts`).
  Ayrı "Kampanya ve duyurular" kutusu `acik_riza_pazarlama` onayını `acik-riza.md` sürümüyle yazar, ardından
  e-posta `kampanya` tercihini aynı değere çeker. Kutu metni `acik-riza.md` madde 2 ile kelimesi kelimesine aynı
  (test). Tarayıcıda Web Push aboneliği başlatan kod (service worker, VAPID açık anahtarı) bu PR'da yok.
- `/hesap/iade` ve `/hesap` üzerinde "İade talebi" bağlantısı: kural, kayıtlı e-posta, `teknoloji@kulular.com`'a
  konulu e-posta bağlantısı (`kunye.ts`), iade kuralları bağlantısı. Uygulama içi sipariş bazında talep için sipariş
  listesi gerekiyor: `docs/istekler/kimlik-iade-siparis-listesi.md` (odeme).
- İstekler: `kimlik-v1-5-planlandi-ekleri.md` (mimar: `openapi.yaml` 1787, 1816, 1842. satırlardaki
  `x-kazuist-uygulama: planlandi` kalkmalı; kalkana kadar `packages/contracts/test/rotalar.test.ts` "a marked path
  has no handler" bu üç yolla kırmızı), `kimlik-atif-ret-yazimi.md` (atif-agi: `store.py` upsert ve budama
  `NOT rejected` almalı, yoksa reddedilen aday yeniden kuyruğa döner; `atif-agi/_sunucu/sql.ts` `NOT rejected`).
- Testler: `server/auth/__tests__/atif-kuyrugu.test.ts` (10: yetki 401/403/403, onay, ret, doktrin, çift karar,
  duzelt, yanlış kuyruk, başka kayda işaret eden sahte satır kenara dokunmaz, ekran okuma modeli, ekran kapısı),
  `bildirim-uclari.test.ts` (13: tercih PUT anlamı, geçersiz gövde, IDOR, SSRF listesi, anahtar uzunluğu, taşıma,
  10 cihaz sınırı, 429, ticari onay metni ve okuma modeli), `idor-rate.test.ts` misafir listesine dört yeni uç,
  yönetim listesine atıf kuyruğu. Ret yazımı geçici olarak eski biçime çevrilince 3 test kırıldı (elle denendi).
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` temiz; `pnpm -r --no-bail test`: web 672
  (1 atlanan), worker-node 113, contracts 146/147 (tek kırmızı yukarıdaki ek; üç satır yerelde geçici silinince
  147/147, dosya geri alındı), diğer paketler yeşil. Yerel üretim derlemesi, PostgreSQL 18 ve migration'larla
  `/hesap`, `/hesap/bildirimler`, `/hesap/iade`, `/hesap/yonetim/atif-kuyrugu` (onaylı ve onaysız editör) 375/768/1440:
  axe (WCAG 2.0/2.1 A ve AA) ihlal 0, yatay taşma 0; kullanıcıya editör ekranı 404. Playwright ile tercih kaydı,
  ticari onay (consents satırı ve `kampanya: true`), bir onay ve bir ret (kenar `true,false,0.82`, eser atfı
  `false,true,0.71`, iki denetim satırı) uçtan uca geçti. Ekran görüntüleri review.md T11 kararı beklendiği için depoya
  konmadı. Gerçek passkey töreni ve gerçek push teslimi denenmedi.

## 14 Kasım 2026, mimar: sözleşme 1.5.1, yazma projesi gövdeleri ve iki belge düzeltmesi (mimar/v1-5-1-yazma-proje-girdisi)

Orkestra isteği. Şema ve migration değişmedi; yeni bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- Sözleşme 1.5.1 (ADR-0035 sonuna not): `createWritingProject` artık `WritingProjectCreateInput` alır (`title`
  kırpılır ve 1-300, `kind` `tez|makale|odev`, `targetWords` 0-2.000.000 tam sayı zorunlu; `deadline` isteğe bağlı).
  `updateWritingProject` `WritingProjectInput` ile kalır; şema `WritingProjectCreateInput.partial()` oldu (aynı
  sınırlar, `deadline: null` reddedilir). Önceden sözleşme POST'ta hiçbir alanı zorunlu tutmuyordu, sunucu ise üçünü
  istiyordu. Sürüm `openapi.yaml`, `CONTRACT_VERSION` ve `packages/contracts/package.json`'da 1.5.1; `packages/db`
  1.5.0'da kaldı. `src/generated/api.ts` yeniden üretildi.
- Yazma yolunda tek dokunuş (orkestra isteğiyle): `apps/web/src/app/yazma/_sunucu/uclar.ts` `projelerPost` ve
  `projePatch` sözleşme şemalarını kullanır; `projeler.ts` içindeki yerel `ProjeGirdisi`, `ProjeGuncelleme` ve
  `projeTurleri` kalktı. `api.test.ts`'e eksik zorunlu alan, üst sınır ve PATCH kuralları için test eklendi.
- `packages/contracts/test/writing-projects.test.ts`: zorunlu alanlar, kırpma, sınırlar, kısmi PATCH ve OpenAPI ile
  zod sınırlarının eşitliği. OpenAPI'de `maximum` elle değiştirilince test kırıldı (denendi, geri alındı).
- Belgeler: `docs/istekler/atif-agi-sema.md` kuyruk bölümündeki eski ret kuralı `rejected = true` olarak düzeltildi,
  okuma kuralına `NOT rejected` notu eklendi. Plan 12 madde 8 ve Ek A icerik satırı "dört ton ve veri olmayan anlarda
  sakin yüz" oldu; review.md P4 tablosuna not; `yazma-kalemcik-notr-ton.md`'ye Sonuç; v1.5 yönlendirme belgesinin yazma
  madde 3'üne ilerleme notu.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (contracts 152, web 646 ve 1 atlanan,
  worker-node 113, db 54, ledger 174, casuist 107), `pnpm build`, Redocly lint, i18n denetimi ve enjeksiyon seti
  geçti; `check:generated` commit'ten sonra temiz.
- Açık: `.claude/agents/icerik.md` hâlâ "beş ton" diyor (ajan tanımı; Tarık onayıyla düzeltilir).
  `docs/tasarim/gorsel-istemleri.md` 4.7'deki "açık soru" notu artık cevaplı (orkestra yolu). Yazma'nın kalan yerel
  şemaları (`IlerlemeGirdisi`, `HitapGirdisi`, şablon ve kısaltma gövdeleri) yönlendirme belgesindeki gibi açık.
## 15 Kasım 2026, yz-gecidi: platform TL tavanı her platform çağrısında, kullanıcıya bağlı BYOK doğrulaması, yazma geçitten (yz-gecidi/butce-byok-baglama)

Orkestra görevi: PR #95 sonrası main'de kalan dört madde. `packages/contracts` ve `packages/db` değişmedi; yeni
bağımlılık yok. Sözleşme isteği: `docs/istekler/yz-gecidi-soru-denetim-karakteri.md`. Orkestra açıkça istediği
için sahiplik dışı yollar da değişti: `apps/web/src/app/ara/_sunucu/{ozet,gecit}.ts` ve testleri, `packages/casuist`
(`backend.ts`, `sql.ts`, `memory.ts`, `answer/passages.ts`, `test/answer.test.ts`), `apps/web/src/app/yazma/**`,
`eval/rules/olc.ts` (yalnız yeni imza).
- Bütçe (`budget.ts`): platform TL tavanı artık her platform çağrısını durdurur: ücretsiz hak
  (`platform_tavan_ucretsiz_durdu`) ve kredili çağrı, promosyon kredisi dahil (`platform_tavan_kredili_durdu`).
  BYOK yalnız eşzamanlı akış yuvası tutar. `AdmitInput.platform` zorunlu. Yeni IP kredi tavanı
  (`ipDailyCredits`, varsayılan 3.000) çok hesapla promosyon kredisi harcamayı sınırlar. Bütün sınırlar önce
  denetlenir, sonra sayılır: reddedilen çağrı sayaç bırakmaz; `rollback` IP kredi sayacını da geri alır.
  Plan 8.7/2 "kredili işlem sürer" diyor; bu PR orkestra talimatıyla bundan ayrılıyor, plan metni orkestranın.
- BYOK prepare ve verify (`protocol.ts`, `ozet.ts`): imzalı paket kullanıcıya (`subject`, kullanıcı kimliğinin
  anahtarlı özeti; Valkey ham kimliği tutmaz), rotaya ve (K-kimliği, kayıt, parça, pasaj SHA-256) listesine
  bağlı (kanonik biçim `kazuist-byok-v2`). verify pasajları istemden ayrıştırmaz: `loadPromptPassages` kayıt ve
  parçayı arama deposundan (yalnız yayımlanabilir kayıt, anlık parça kimlikleri dahil) yükler, prepare ile aynı
  `promptPassage` üreticisiyle kurar, aynı maskelemeyle (pasajlar önce, `scrubSourced`) maskeler, özetleri
  karşılaştırır; uymazsa 409, başka kullanıcı 403, eski biçim 400, yeniden kullanım 410.
- Maskeleme: `scrubSourced` soru ve pasajları tek etiket uzayında, pasajlar önce maskeler; pasaj maskesi soruya
  bağlı değildir (verify soruyu saklamadan yeniden kurar). Geçidin `run()` da aynı sırayı kullanır. Denetim
  karakterleri maskelemeden önce silinir; web ucu (`POST /v1/answers`, `/prepare`) C0 (sekme ve satır sonu
  hariç) ve DEL içeren soruyu 400 ile reddeder.
- Akış iptali: istemci akışı bıraktığında geçit çalışması kapanmıyordu; kullanıcının akış yuvası sızıyor, iki
  iptalden sonra kullanıcı yeniden başlatmaya kadar 429 alıyordu. `ozet.ts` `closeRun` hem satır döngüsünün
  sonunda hem akış kapanınca çalışır; test düzeltme olmadan kırılıyor (elle denendi).
- Yazma: `kural-cikarma.ts` kılavuz metnini `neutralize()` ile istemine koyar (`@kazuist/ai-gateway/prompt`, Node
  tip ayıklamasıyla yüklenebilir; eval/rules oracle kipi çalışır); `normallestir` `‹›` işaretlerini geri katlar.
  `kisaltmaIstemi` de nötrler. `yz.ts` yalnız `gateway.complete` çağırır: kişi adı tanıyıcısı, kullanıcı, IP ve
  TL bütçesi, kredi tutma (plan 4.4: kural çıkarma 30, kısaltma 2), şema geçerse tüketim, geçmezse çözme,
  maliyet olayı. Uçlar porta kullanıcı ve IP verir (`YzKimlik`).
- Geçit (`gateway.ts`): ortak çağrı çekirdeği (`open`/`finish`), yeni `complete()` (`modelTier`, `accept`,
  `restoreLabels`), erken bırakmada sağlayıcı akışı kapanır. `kisaltma_oneri` rotası. `buildSummaryDeps`
  `onCost`'u geçirir; `ValidatedChargeLedger` yalnız `ozet:` isteklerine dokunur.
- Sonnet akıl yürütme: platform Sonnet 5.5 çağrısı OpenRouter'da `reasoning.effort: low`, Anthropic doğrudan
  yedeğinde `output_config.effort: low` gönderir (models API ve Anthropic effort sayfası 15 Kasım'da okundu,
  `SAGLAYICILAR.md`). Haiku'ya parametre gönderilmiyor.
- Doğrulama (main 7cbe91b üzerine yeniden temellendikten sonra): `pnpm typecheck`, `pnpm lint`,
  `pnpm check:text`, `pnpm test` (ai-gateway 126, casuist 108, web 719 ve 1 atlanan, ledger 174, worker-node
  118), enjeksiyon seti 60/60, `pnpm build`. Yerel üretim sunucusu (PostgreSQL 18, Redis, fikstür derlemi):
  `byok.spec.ts` 9/9; elle akış prepare 200 (11 kaynak), aynı kullanıcı verify 200 ve satır kabul, yeniden
  kullanım 410, başka kullanıcı 403, denetim karakterli soru 400.
  Canlı sağlayıcı duman testi çalışmadı: OpenRouter ve Anthropic anahtar dosyası yok.
- Açık: Haiku 5.5 varsayılan düşünme (`medium`) 400 tokenlik standart özette canlı ölçülmeli; yazmada kredi
  yetersiz ya da bütçe dolu durumu `model` koduyla düşüyor (ayrı kod ve metin yazma ajanının); plan 8.7/2
  metni; sözleşmede soru denetim karakteri kuralı (istek yazıldı); eval/rules canlı kipi Node tip ayıklamasıyla
  geçit dizinini yükleyemiyor (önceden de böyleydi).
## 15 Kasım 2026, anonimlestirme: üretimde NER zorunlu, Türkçe ek ayırıcı, worker-py model birimleri (anonimlestirme/ner-zorunlu-ek-ayirici)

Orkestra görevi: main'de doğrulanan açık. `KAZUIST_NER_BACKEND` boşken `backend_from_env()` NullBackend döndürüyor,
`publishable = not review` olduğu için kayıt NER olmadan yayımlanıyordu; imaj `ner-runtime` ekstrasını ve model
birimini taşımıyordu. `packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok (`ner-runtime` ADR-0026
ile kilitte).
- Güvenli kapanma: `ner.ner_required()` `KAZUIST_ENV` `development`, `test` ya da boş değilse doğrudur (production,
  staging ve yanlış yazılmış değerler dahil). O ortamda model yoksa `anonymize` sonucu `blocked =
  "ner_unavailable"` taşır, `publishable` false olur; anon.run spanları ve `payload.blocked` içeren bir editör
  kuyruğu satırını yazar, `records.anonymized` false, `masked_text` NULL, embed.chunks kuyruğa girmez. Yükseltme
  yerine kaydetme seçildi: hata işlemi geri alır ve kaydın daha önce yayımlanmış metnini yerinde bırakırdı; böylece
  yeniden çalıştırma eski açık metni de geri çeker. Log yalnız kimlik ve nedeni yazar. `jobs.result` biçimi aynı.
- Yayılım düzeltmesi: bir anma, kişisinin en güçlü tohumundan daha güvenilir olamaz (`min(seed.score, 0.9)`).
  Önceden düşük puanlı bir NER spanı kendi konumundaki 0,9'luk yayılım ikiziyle editör kuyruğundan çıkıyordu.
- İmaj (`infra/docker/worker-py/Dockerfile`, altyapınındır, orkestra talimatıyla): `uv sync --frozen --no-dev
  --extra ner-runtime`; `ENV KAZUIST_ENV=production KAZUIST_NER_DIR=/models/ner KAZUIST_EMBED_DIR=/models/embed
  HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1`. CI'a imaj içinde onnxruntime içe aktarma ve modelsiz güvenli kapanma
  adımı eklendi (`.github/workflows/ci.yml`). Runbook: `docs/runbook/dagitim.md` "worker-py model birimleri"
  (yalnız okunur `/models/ner` ve `/models/embed`, Coolify adımı, izinler, değişkenler, bellek).
- Kurulum denetimi: `python -m anonymizer.model_check` (manifest anahtarı ve revizyonu, ONNX sha256, yükleme,
  sentetik cümlede kişi adı); metin yazdırmaz.
- Türkçe ek ayırıcı `anonymizer/suffixes.py`: kesme işaretinden sonraki çekim ekleri (çoğul, iyelik, hâl, -ki,
  ek eylem; yapım ekleri asla), düz ve tipografik kesme işaretleri, büyük harfli ekler; "O'Neil" bölünmez.
  Anahtarlar eksiz (`name_key`), NER spanı kesme işaretinde biter (`person_end`), yayılım boşlukları esnek eşler ve
  bilinen tam adın kesmesiz ekini ("AHMET YILMAZIN") bütün sözcükle maskeler. Yeni kural `find_suffixed_names`:
  rol sözcüğü olmadan iki ile dört büyük harfli sözcük ve kesme işaretli ek ("Tarkan Özdağ'a"); yer, kurum ve cümle
  başı sözcük listeleri eler, tek sözcük alınmaz, puan 0,75 olduğu için editöre düşer, aynı karakterleri örten NER
  spanı onu kapatır. `ENGINE_VERSION` anon-0.3.0 (plan 6.4/7 gereği yeniden işleme).
- Ölçüm (yalnız kural katmanı, NER modeli bu makinede yok; `eval/anon/raporlar/anon-0.3.0-{sentetik,zor}.json`):
  sentetik kişi 418/430 (%97,21) önce ve sonra aynı, kesinlik %100, editör kuyruğu 52 öğe aynı; zor set kişi 9/69
  (%13,04) -> 20/69 (%28,99), kesinlik 10/10 -> 21/21, editör kuyruğu 0 -> 11 öğe (5 belge). Zor set kuralları
  yazan ajan ailesinin elinden çıktı, küçük ve iyimser; 15.3/2 kapısı kanıtlanmadı, geçmedi sayılır.
- Test: worker-py 426 geçti, 10 atlandı (`ner-runtime` ile 429/7); ruff temiz; `pnpm lint`, `pnpm check:text` temiz.
- İstek: `docs/istekler/anonimlestirme-ner-zorunlu.md` (mimar `.env.example` açıklaması; veri-toplama bilgi: imaj
  öntanımı `KAZUIST_ENV=production` kaynak onay denetimini de açar).
- Açık: NER'li yapılandırmada (rules+akdeniz27) yeni kod ölçülmedi (model dosyaları yerelde yok); kesmesiz ekli ilk
  anma ("Davacı Ahmet Yılmazın") anahtara eki taşır; "Ayşe Hanım'ın" gibi unvanlı tek adlar; 200 gerçek karar seti.

## 14 Kasım 2026, casuist: embedding modeli ölçümü ve önerisi (casuist/embed-model-secimi)

Vektör kolunun kapalı olma nedeni (model seçilmemişti) için plan 5.3'ün üç adayı ölçüldü ve ADR-0037 (Önerildi,
Tarık onayı bekliyor) BGE-M3 int8'i önerir. Öntanım değişmedi: `KAZUIST_EMBED_BACKEND` boşken işçi vektörsüz yazar.
Sözleşme, şema, migration ve bağımlılık değişmedi (dışa aktarma ve ölçüm mevcut `ner` ve `ner-runtime`
ekstralarıyla). Model dosyaları depo dışında (`~/.cache/kazuist-embed`), yalnız resmî Hugging Face depolarından
sabit revizyonla indirildi.
- `eval/embed/hazirla.py`: `indir` (sabit revizyon, her dosya Hub özetine karşı, lisans model kartı ve API'den),
  `hazirla` (BGE-M3 ve e5 için resmî ONNX, Qwen3 için `torch.onnx` dışa aktarımı ve Torch eşdeğerliği), `nicemle`
  (int8, fp32 ile kosinüs uyumu manifeste).
- `eval/embed/olc.py` (vektör kolu tek başına; isabet@k, nDCG@10, MRR, cevapsız sorularda en üst kosinüs, eşleştirilmiş
  bootstrap farkı, gecikme, RSS), `eval/embed/hibrit.ts` (aynı vektörlerle `search()`), `eval/embed/set-sentetik.json`
  (60 soru, düşük kelime örtüşmesi, etiketler editör teyidi bekliyor), raporlar `eval/embed/raporlar/`.
- `services/worker-py/nlp/embedder.py`: adaylar revizyon ve lisansla sabit; `OnnxEmbedder` öntanımda metin başına
  bir çalıştırma (int8'de yığınla gömülen vektör yığın arkadaşlarına bağlıydı, CPU'da yığın hız kazandırmadı);
  `batch_size` artırılırsa uzunluğa göre gruplar ve yığın başına 4096 dolgu tokenı sınırı.
- `services/worker-py/nlp/model_check.py`: kurulum denetimi (`python -m nlp.model_check <klasör> --quantized`).
- `docs/adr/0037-embedding-modeli.md` ve ADR dizini satırı (mimarın yolu; orkestranın görevlendirmesiyle),
  `docs/istekler/altyapi-embed-model-birimi.md` (`--extra ner-runtime`, `/models/embed`, değişkenler, bellek).
- `packages/casuist/tsconfig.json` `eval/embed/*.ts`'yi de tip denetimine alır.
- Sonuç (Apple M4, 4 iş parçacığı; `eval/embed/raporlar/`): BGE-M3 ile multilingual-e5-large arasında vektör
  kolunda fark gösterilemedi (int8 eşleştirilmiş nDCG@10 farkı +0,002 [-0,038, +0,043], 99 soru); ikisi de int8'de
  Qwen3-Embedding-0.6B'den iyi (+0,11). Hibritte BGE-M3 int8 sentetik sette nDCG@10'u 0,610'dan 0,748'e çıkardı,
  rag-50'yi düşürmedi. e5 kosinüsleri dar ve yüksek olduğundan cevapsız 11 sorunun 11'inde ilk sonuç "Yüksek
  ilgililik" aldı (BGE-M3'te 1, vektörsüzle aynı); karar buna dayanıyor. BGE-M3 int8: disk 542 MB, yüklenince
  yaklaşık 1,4 GB RSS (macOS), sorgu p95 13 ms, saniyede yaklaşık 16 parça. Lisanslar: BGE-M3 MIT, e5 MIT, Qwen3
  Apache-2.0 (sabit revizyonların model kartı ve Hub API'si).
- Doğrulama: worker-py `uv run pytest` 336 geçti, 7 atlandı (ekstralı ortam; üç gerçek model testi dahil); ekstrasız,
  CI benzeri ortamda 328 geçti, 15 atlandı. `pnpm check:text`, `pnpm typecheck`, `pnpm lint`, casuist vitest 107
  geçti; `pnpm build` geçti. Arayüz değişmediği için ekran görüntüsü ve axe yok.
- Açık: 300 soruluk `eval/embed` seti; CAX21'de yeniden ölçüm; sorgu gömme HTTP servisi (web `KAZUIST_EMBED_URL`;
  tek model kopyası paylaşılmalı); parçaya kayıt başlığı ekleme kararı (ADR-0026 okuma kuralı); `.env.example`
  açıklaması (mimar); altyapi birimi.
## 15 Kasım 2026, kimlik: hesap silme tek işlemde, kaldırma kararında gizleme, doğrulanmış e-posta kapıları (kimlik/purge-takedown-verified-gates)

Orkestra görevi: main üzerinde doğrulanmış üç hata. `packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
- `apps/worker-node/src/account/purge.ts`: `account.purge` artık tek işlemde ve tek bağlantıda (pg.Pool'dan istemci
  alınır). Eskiden işlemsiz siliyor, `wallets.user_id` (ON DELETE yok) yüzünden `delete from users` 23503 ile
  düşüyor, e-posta değiştirilip bırakılıyordu; cascade hiç çalışmadığından kütüphane, yazma projeleri ve günlükleri,
  hatırlatıcılar, şablon kuralları, kart ve sınav kayıtları, Kampüs profili, bildirim işleri ve KVKK başvurusunun
  kişisel alanları kalıyordu. `purgeSteps` packages/db şemasındaki her `users` yabancı anahtarını açıkça siler ya da
  bağı kaldırır; rıza ve denetim kaydı yalnız özetle, KVKK başvurusu tür, durum, tarih ve özetle kalır. Yasal saklama
  satırları (`retainedReferences`: cüzdan, kredi lotları, defter, sipariş, ödeme, abonelik, fatura, iade, IAP,
  dondurulmuş sözleşme belgeleri) dokunulmadan kalır ve anonim mezar taşı `users` satırına bağlanır; boş cüzdan
  silinir. İkinci çalıştırma `already_anonymised` ile atlanır.
- Entegrasyon testi `purge-integration.test.ts`: her zaman PGlite'ta, `KAZUIST_IT_DATABASE_URL` verilirse gerçek
  PostgreSQL'de de (pg.Pool yolu). Kullanıcı her `users` tablosunda işaretli satırla tohumlanır; silmeden sonra işaret
  her tablonun her satırının metin biçiminde aranır (yalnız `order_legal_documents` yasal saklama olarak muaf).
  Yeni bir `users` yabancı anahtarı `purgeSteps` ya da `retainedReferences`'a eklenmezse test kırılır. Kısmi hata
  testi her satırın yerinde kaldığını kanıtlar.
- `apps/web/src/server/auth/takedown.ts`: `ek_maskeleme` hedefi gizli tutar (gizli değilse gizler) ve kayıtlar için
  `anon.run` kuyruğa alır (tekilleştirme anahtarı `anon:<id>`, ingest hattıyla aynı). `ret` hedefi yalnız bu talep
  gizlediyse ve aynı hedefte `gecici_gizlendi`, `kalici_kaldirma` ya da `ek_maskeleme` durumunda başka talep yoksa
  gösterir. Gizleme zamanı `coalesce` ile korunur.
- Doğrulanmış e-posta: `Principal.emailVerified` her istekte veritabanından okunur. Kayıt promosyonu
  (`grantPromoIfVerified`) yalnız doğrulanmış ve silinmemiş hesaba: Google ve Apple oluşturmada, e-posta ve parola
  hesabı e-posta kodu doğrulanınca (`databaseHooks.user.update.after`). Ücretsiz özet hakkı
  `apps/web/src/app/ara/_sunucu/ozet.ts`'de `p.emailVerified` ister (casuist yolunda tek satır, orkestra görevi
  gereği; test `ozet.test.ts`). Giriş doğrulamasız açık kalır; kredi ve BYOK kullanılabilir.
- edu.tr: `normalizeEduEmail` (küçük harf, boşluk, sondaki nokta, `+etiket`); başka hesapta doğrulanmış posta kutusu
  için kod gönderilmez ve onay danışma kilidi altında yeniden denetlenir (400, `hata.eduKullanimda`). Veritabanı
  güvencesi isteği: `docs/istekler/kimlik-edu-tekil.md`.
- Açık: `ek_maskeleme` sonrası yeniden gösterme için editör ya da anonimleştirici adımı yok (hedef gizli kalır);
  Kampüs hedefinde yeniden maskeleme yok. CI'da gerçek PostgreSQL ile purge testi için docker işine
  `KAZUIST_IT_DATABASE_URL=... pnpm --filter @kazuist/worker-node exec vitest run src/account` adımı altyapıya.

## 15 Kasım 2026, yz-gecidi: BYOK arayüzü, ödeme kapalı yayın, geçit zaman aşımı ve uzlaşma (yz-gecidi/byok-arayuz-odeme-kapali)

Orkestra görevi: review.md P8 madde 4 ve 5, plan K-08, K-09, FR-84, 8. bölüm. `packages/contracts` ve `packages/db`
değişmedi; yeni bağımlılık yok. Sözleşme ve sahiplik isteği: `docs/istekler/yz-gecidi-byok.md`.
- BYOK arayüzü `/hesap/yz-anahtari` (oturum istemez): OpenRouter, önerilen üç model ya da elle model kimliği,
  anahtar yalnız tarayıcıda (varsayılan sessionStorage, açık seçimle localStorage ve uyarı), gizlilik öncelikli
  (`provider.zdr`), anahtarı sil, "Anahtarı dene" (`GET openrouter.ai/api/v1/key`; ücretsiz katman ve sınırsız
  anahtar uyarısı), `:free` modelde ücretsiz model uyarısı. Kayıtlı anahtar forma geri yazılmaz, maskeli gösterilir.
- `/ara` kaynaklı özet: tarayıcıda anahtar varsa BYOK istemci protokolü (prepare, tarayıcıdan doğrudan OpenRouter,
  casuist tarayıcı doğrulayıcısı, verify); yoksa günlük ücretsiz hak. Hak bitince (402) BYOK bağlantısı.
  Maskeleme sunucuda `scrubParts` ile, tarayıcı göndermeden önce `assertMasked` ile yeniden denetler.
- CSP `connect-src 'self' https://openrouter.ai` (`BYOK_CONNECT_ORIGINS`); başka köken yok.
- Ödeme kapalı yayın: `apps/web/src/server/billing/acik.ts` `odemeAcik()` üç `IYZICO_*` değişkenine bakar. Yoksa
  `/fiyatlar` "Kredi satışı henüz açılmadı" notu, `/odeme` ödeme adımı yerine ücretsiz hak ve BYOK bağlantıları.
  `/fiyatlar` her durumda BYOK bölümü gösterir.
- Geçit (P8.5): her sağlayıcı çağrısında ilk bayt ve toplam süre sınırı (`adapters/deadline.ts`, rota başına
  `timeoutMs`; zaman aşımı `ProviderTimeoutError` 504, çıktı yokken yedek sağlayıcıya geçer). Akış sonunda
  `consume` ya da `release` hatası artık akışı kırmaz: türsüz hata bir kez yeniden denenir, maliyet olayı
  `creditsCharged` (defterin gerçekten aldığı), `creditsDue` ve `settlement` taşır, `onSettleFailure` uyarısı
  (gecit.ts yalnız kimlik ve tutar loglar), harcama sayacı uzlaşmadan önce yazılır. Soru ve pasajlar `scrubParts`
  ile tek etiket uzayında maskelenir; denetim karakterleri silinir, ayırıcı kayması kapandı.
- Üretimde `VALKEY_URL` (ya da `BETTER_AUTH_SECRET`) yoksa `buildSummaryDeps` `GatewayConfigError` atar ve
  değişken adını loglar; özet uçları 503 döner (önceden sessizce bellek sayacı).
- Tarayıcı derlemesi `@kazuist/ai-gateway/browser` (`browser.ts`); içe aktarma zinciri Node yerleşiği içermez,
  test zorlar.
- Test: ai-gateway 104 (deadline, settlement, browser yeni), web 666 (gerçek prepare/verify ile BYOK uçtan uca,
  üretim yapılandırması, `/fiyatlar` ve `/odeme` satış durumu), enjeksiyon 60/60, e2e 108/108 (yeni
  `byok.spec.ts` 9 test, openrouter.ai tarayıcıda taklit). axe 375/768/1440 ihlal 0. Canlı OpenRouter duman testi
  çalışmadı: anahtar dosyası yok.
- Açık: derin özette Sonnet 5.5 zorunlu akıl yürütme (SAGLAYICILAR.md), `PrepareRequest.filters` (istek),
  Anthropic, OpenAI ve Gemini için tarayıcı BYOK'u (CSP ve CORS denetimiyle birlikte), `USD_TL` sabiti.

## 14 Kasım 2026, yazma: rota şemaları sözleşmeden, Kalemcik sakin yüz, zip bombası testi (yazma/rota-sozlesme-sakin-yuz)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` yazma madde 3 ve `docs/istekler/yazma-kalemcik-notr-ton.md` kararı.
`packages/contracts` ve `packages/db` değişmedi; yeni bağımlılık yok.
- `apps/web/src/app/yazma/_sunucu/uclar.ts` ve `projeler.ts`: yerel zod şemaları kalktı. `WritingProjectInput`,
  `WritingProgressInput`, `WritingSettings`, `AbbreviationsInput` JSON gövdelerini, `TemplateRulesUpload`,
  `TemplateCheckUpload`, `DocxCountUpload` çok parçalı gövdeleri doğrular. Sözleşme yalnız biçimi söyler (proje
  alanlarının hepsi isteğe bağlı); sunucu, sözleşme şeması geçtikten sonra eskisi gibi şunları ister: yeni projede
  başlık, tür ve hedef zorunlu; başlık ve not kırpılır, boş başlık olmaz, hedef en çok 2 milyon kelime.
- Davranış değişikliği (testle gösterildi): kılavuz yüklemede `institutionName` 200 karakterden uzunsa artık 400
  (eskiden kırpılıyordu); sözleşme `max 200` diyor. `kind` yoksa `tez`. `rules` parçası metin değilse 400.
- Kalemcik: yükleniyor ve proje yok durumlarında `SakinKoc` (`dusunceli` yüzü, ton etiketi ve mesaj satırı yok;
  yüklenirken ekran okuyucuya "Yükleniyor"). `packages/i18n/tr/kalemcik.json` `kalemcik.yukleniyor` eklendi.
- `cekirdek.test.ts` zip bombası: 70 MB sıkıştırma yerine bildirilen boyutu 70 MB yazılmış küçük arşiv (aynı sınır,
  sınırın altındaki gerçek boyutuyla okunabildiği de sınanır) ve 61 MB gerçek bomba (seviye 1, açık 60 sn zaman aşımı).
- Test: `yazma/api.test.ts` yeni blok, `kalemcik/kalemcik.test.tsx`. Doğrulama: typecheck, lint, tam `pnpm test` iki kez
  (web 637 geçti), build; 375/768/1440 axe 0 (yükleniyor ve proje yok).

## 14 Kasım 2026, atif-agi: sözleşme v1.5 atıf ağı maddeleri (atif-agi/v1-5-rejected)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` atif-agi madde 1 ve 3 (madde 2 zaten açılabilir durumdaydı).
Sözleşme, şema ve migration değişmedi; yeni bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `services/worker-py/citations/store.py`: `UPSERT_EDGE_SQL` ve `UPSERT_WORK_CITATION_SQL` yalnız
  `confirmed = false AND NOT rejected` satırlarını günceller; `PRUNE_EDGES_SQL` ve `PRUNE_WORK_CITATIONS_SQL`
  `rejected` satırları silmez. Başlıktaki "until a rejected column exists" notu kalktı. `SqlCitationStore(doctrine=True)`
  çağıran tarafın seçimidir; `job.py` mağaza fabrikasını dışarıdan aldığı için orada değişiklik gerekmedi.
- `apps/web/src/app/atif-agi/_sunucu/sql.ts`: kenar görünürlüğü `NOT e.rejected AND (e.confirmed OR
  e.confidence >= 0.90)`, eser okuması `NOT wc.rejected AND (wc.confirmed OR wc.confidence >= 0.90)`; eski
  `confidence > 0` ret biçimi kalktı (migration 0007 o satırları `rejected = true` yaptı). `42P01` yedeği
  zararsız olduğu için bırakıldı.
- Test: `services/worker-py/citations/tests/test_llm_job.py` (upsert ve budama koşulları), `sunucu.test.ts` (ağ ve
  kayıt ağı sorgularının `NOT rejected` taşıması).
- Açık: retde `rejected = true` yazacak editör ekranı kimliğin (yönlendirme kimlik madde 4); bu PR yalnız okuma ve
  yazma tarafını hazırlar. `packages/casuist/src/sql.ts` casuist ajanınındır, dokunulmadı.
## 14 Kasım 2026, casuist: reddedilen atıf kenarları sayılmaz (sözleşme v1.5, casuist/v1-5-reddedilen-kenarlar)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` casuist maddesi. Sözleşme, şema ve migration değişmedi; yeni
bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `packages/casuist/src/sql.ts`: `records()` içindeki `cited_by` alt sorgusu tek bir sabitten (`COUNTED_EDGE`)
  gelir: `NOT e.rejected AND ((e.confirmed AND e.confidence > 0) OR e.confidence >= 0.90::real)`. Ret v1.5'te
  `rejected` ile işaretlenir; `confidence > 0` eski ret biçimini (`confirmed = true, confidence = 0`) yazıcılar
  geçene kadar dışarıda tutar. casuist yollarında `citation_edges` ya da `work_citations` okuyan başka sorgu yok.
- Eşik düzeltmesi: `confidence` `real`; çıplak `0.90` float8 olarak karşılaştırıldığı için `0.9::real`
  (0.8999999761...) eşiğin altında kalıyordu ve güveni tam yayın eşiğinde (`citations/scoring.py`
  `PUBLISH_MIN = 0.90`) olan kenar sayılmıyordu. Eşik `0.90::real` ile karşılaştırılır; atif-agi'nin parametreli
  sorgusu (`$2` `real` olarak çıkarsanır, PGlite'ta denendi) zaten böyle davranıyordu; atıf ağı ekranı ile önem
  puanı artık eşikte aynı kenarları sayar.
- Test: `apps/web/src/app/ara/_sunucu/sql.test.ts` (PGlite, migration 0007 dahil) yedi kenarla sayımı sınar
  (0.99 ve 0.90 sayılır, onaylı 0.6 sayılır, onaysız 0.6 sayılmaz, `rejected` yüksek güveni ve onayı ezer, eski
  ret biçimi sayılmaz), sonra sayılan bir kenarı `rejected` yapıp sayının düştüğünü görür. `NOT e.rejected`
  geçici olarak kaldırılınca test 3 yerine 5 bulup kırıldı; `::real` olmadan 3 yerine 2 bulup kırıldı.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (casuist 107, web 645/1 skip,
  worker-node 113, tümü geçti), `pnpm build`.
- Açık: `/v1/records/{id}/versions` `planlandi` (bu PR'da yazılmadı). Doktrin kayıtlarının önem puanı hâlâ
  `openalex_cited_by`'dan gelir; `work_citations` sayımı istenirse ayrı iş.
## 14 Kasım 2026, odeme: sözleşme v1.5 temizliği ve ön bilgilendirme alanları (odeme/v1-5-temizlik)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` odeme maddesi 1 ve `docs/istekler/hukuk-uyum-p5-tutarlilik.md`
madde 4 (ilk alt madde). Sözleşme, şema, migration ve bağımlılık değişmedi.
- `apps/worker-node/src/billing/jobs.ts`: çağrılmayan `enqueueDailyBillingSql` kaldırıldı (testi yoktu, depoda başka
  kullanan yok). Günlük zamanlama `src/handlers.ts` `dailyBillingTick` içinde zaten `enqueueJob(..., { once: true,
  dedupeKey: '<tür>:<UTC gün>' })` ile; `test/runner.test.ts` "does not queue a finished day again after a restart"
  `done` satırından sonra yeniden kuyruğa almadığını sınıyor.
- `packages/ledger/src/billing/contract-doc.ts`: `DOC_FIELDS['on-bilgilendirme']` ve `orderFields` içinden
  `IOS_SURUM` çıktı (metin 2026-11-12.1 sürümünde bu alan yok).
- `packages/ledger/test/billing/contract-doc.test.ts`: üç sipariş metninin ön bilgisi `LegalFrontMatter` ile okunur;
  `DOC_FIELDS[slug]` ön bilgideki `pdf_fields` ile birebir aynı, her alan gövdede yer tutucu ve gövdedeki her sipariş
  yer tutucusu (şirket alanları `KEP`, `TELEFON` dışında) listede. `orderFields` paket ve tarihsel yıllık plan için
  bütün alanları doldurur; ön bilgilendirme formunda açık kalan tek alan `KEP`. Eski liste ile iki test kırılıyor
  (elle denendi).
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (ledger 174, worker-node 113, web 644 ve
  1 atlanan), `pnpm build` geçti.
- Açık: hukuk-uyum isteği madde 4 ikinci alt madde (hesap sayfasında iade talebi bağlantısı, review.md P8 madde 3)
  bu PR'da yapılmadı; hesap sayfası kimliğin yoludur, bağlantı eklenince hukuk-uyum metni günceller.

## 13 Kasım 2026, on-yuz: hukuki ön bilgi listeleri ve topluluk belgesinin kaldırılması (on-yuz/p5-hukuki-on-bilgi)

docs/istekler/hukuk-uyum-p5-tutarlilik.md madde 1 ve 2.
- `apps/web/src/app/(kabuk)/_hukuki/md.ts` `onBilgi` YAML akış dizisini (`pdf_fields: [A, B]`, tırnaklı öğe, boş
  `[]`) ve blok dizisini (`key:` ardından `- A`) okur; iç içe dizi ve köşeli parantezli başlık dize kalır. Test her
  hukuki metnin ön bilgisini `yaml` paketinin sonucuyla karşılaştırır.
- Sahiplik dışı (istek gereği aynı PR, hukuk-uyum): `on-bilgilendirme.md`, `mesafeli-satis.md`, `abonelik.md` ön
  bilgisine istekteki listelerle `pdf: true` ve `pdf_fields`; sürüm değişmedi (gövde değişmedi). on-bilgilendirme
  "Gösterim kuralları" notundaki `{{...}}` yayın kapısında açık yer tutucu sayılıyordu ve metin hiç yayımlanamazdı;
  "Ön bilgideki `pdf_fields` alanları" diye yazıldı. content/hukuki/README.md buna göre güncellendi.
- `_hukuki/test/odeme-gosterimi.test.tsx`: gerçek dosyalar ve ledger `orderFields` ile; taslakken ödeme adımı kapalı,
  yalnız `status: yayinda` ve `{{KEP}}` doldurulunca `buildCheckoutLegalPresentation` iki metni doldurur, `CheckoutStep`
  alıcı ve ürünle gösterir, `createLegalSnapshot` (paket ve yıllık abonelik) geçer. Metinlerle ödeme arasında yalnız
  yayın onayı ve KEP kaldı.
- Topluluk (ADR-0031): `content/hukuki/tr/topluluk.md` silindi; `rotalar.ts` `hukukiBelgeler`, `ortak.json`
  `hukuki.belge.topluluk`, `tests/e2e/adresler.ts` `HUKUKI_TR` (kalite-guvenlik, istek gereği) çıkarıldı.
  `hukuki/[belge]/page.tsx` bilinmeyen ve kaldırılan slug için 404 verir (sayfa dinamik olduğundan
  `dynamicParams = false` tek başına engellemiyordu; `/hukuki/yok` 200 "hazırlanıyor" dönüyordu).
- Doğrulama: typecheck, lint, check:text, `pnpm test` (web 644), build; yerel üretimde `/hukuki/topluluk` 404,
  e2e 99/99; 16 sayfa 375/768/1440 axe 0, taşma 0 (`docs/tasarim/ekran/hukuki-*`, `ana-sayfa-*`, `axe-sonuc.json`).
- Açık: odeme `DOC_FIELDS['on-bilgilendirme']` içinde `IOS_SURUM` (istek madde 4); `apps/web/test/seo.test.ts`
  taslak listesinde `topluluk` zararsız kaldı (orkestra).
## 13 Kasım 2026, kimlik: bildirim teslim kaydı ve step-up sözleşme şeması (sözleşme v1.5)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` kimlik madde 1 ve 2. Sözleşme, şema ve migration değişmedi;
yeni bağımlılık yok. Canlı veri tabanına hiçbir şey uygulanmadı.
- `apps/worker-node/src/notify/dispatch.ts`: kuyruk işleyicisi iş kimliğini `dispatch(deps, payload, job)`'a verir.
  Her denemenin başında `deliveredTargetsSql`, her başarılı teslimden hemen sonra `recordDeliverySql`; e-posta
  hedefi `'email'`, push hedefi uç noktanın ya da APNs jetonunun HMAC-SHA256'sı (64 küçük harf onaltılık, ham değer
  yazılmaz). Kayıtlı hedef aynı işin yeniden denemesinde gönderilmez. Bir push hatası artık işi
  `PushDeliveryError` ile düşürür ve yeniden deneme yalnız eksik hedefleri gönderir; son denemede iş
  `push_partial` ile biter. Hiçbir şey gitmediyse iş eskisi gibi hata verir.
- Sessiz saat ertelemesi ham `insert into jobs` yerine `enqueueJob(db, 'notify.send', payload, { once: true,
  dedupeKey: 'notify.send:defer:<iş>', runAfter })`: ertelemenin kendisi yeniden denenirse ikinci iş açılmaz. Bir
  şeyi zaten teslim etmiş bir yeniden deneme ertelenmez (yeni iş yeni teslim kaydı açardı), kalan hedefleri hemen
  gönderir.
- `apps/worker-node/src/notify/target-hash.ts`: anahtar `BETTER_AUTH_SECRET`'tan HKDF-SHA256 (bilgi etiketi
  `notification-target`); `NotifyDeps.targetKey` ile verilebilir, verilmezse ortamdan türetilir (`main.ts`
  değişmedi). Anahtar yoksa push en iyi çabayla gönderilir ve kaydedilmez; e-posta yine kaydedilir.
- `apps/web/src/server/auth/handlers.ts` `stepUpConfirm`: `EduVerificationConfirm` yerine sözleşmedeki
  `StepUpConfirmInput`; rota `apps/web/src/app/api/auth/step-up/confirm/route.ts` zaten sözleşmedeki
  `/auth/step-up/confirm` yolundaydı.
- Test: `apps/worker-node/src/notify/__tests__/idempotency.test.ts` (PGlite, migration 0007 dahil): özet biçimi,
  ham değerin tabloya yazılmaması, aynı işin ikinci çalışmasında sıfır teslim, push hatasında yalnız eksik hedefin
  yeniden gönderimi, son denemede `push_partial`, anahtarsız durum, ertelemenin tek iş açması, teslim etmiş
  denemenin ertelenmemesi ve gerçek tüketiciyle (`createConsumer`) uçtan uca yeniden deneme.
- Doğrulama: `pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm test` (worker-node 112, web 628, tümü geçti),
  `pnpm build`.
- Açık: yönlendirme madde 3 (`planlandi` uçlar: bildirim tercihleri, Web Push ve APNs kayıt uçları) ve madde 4
  (atıf kuyruğu editör ekranı) bu PR'da yapılmadı.
## 13 Kasım 2026, yazma: sözleşme v1.5 yazma maddeleri (yazma/v1-5-yazma-maddeleri)

`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` "yazma" bölümünün 1 ve 2. maddeleri; 3. madde (rota dosyalarında
sözleşme şemaları) ve 4. madde bu PR'da yapılmadı.
- `apps/worker-node/src/kalemcik/gunluk.ts` `kalemcikTick`: `enqueueKalemcikDailySql` kalktı;
  `enqueueJob(db, 'kalemcik.daily', {}, { once: true, dedupeKey: 'kalemcik.daily:' + gun, runAfter: gunBasi08(gun) })`
  (`gunBasi08` İstanbul 08.00, `+03:00`). Yeniden başlatılan süreç bitmiş günü yeniden kuyruğa koymaz (`done` satırı
  için test var). `KUYRUK_SQL` (`notify.send`) değişmedi: koşullu UPDATE korur.
- `apps/web/src/app/yazma/_sunucu/kurallar.ts` `isOlustur`: `rules.extract` satırına `maxAttempts: 1`; bayat kilit
  temizliği artık satırı `dead` yapar. `api.test.ts` satırın `max_attempts = 1` olduğunu sınar.
- Kalemcik "nötr ton" sorusu cevaplandı: ayrı yüz gerekmez (`docs/istekler/yazma-kalemcik-notr-ton.md`); plan 12/8
  metninin düzeltilmesi mimar ve orkestraya bırakıldı.
- Doğrulama: `pnpm typecheck`, `lint`, `test` (worker-node 103, web 628), `build` geçti.
## 13 Kasım 2026, seo: küçük işler (codex/seo-kucuk-isler)

Yeni bağımlılık yok; contracts ve db değişmedi. `twitter.card` `summary_large_image` (OG görseli `app/opengraph-image.tsx`'ten gelir;
`docs/istekler/seo-p6-og-gorseli.md` kapandı). `acikModuller` ve `modulAcik` silindi; `(seo)/_seo/adresler.ts`, `rehberler/_bilesen/metin.ts`,
`rehberler/kontrol-listesi/page.tsx`, ilgili testler, `apps/web/test/seo.test.ts` ve `kabuk.test.tsx` `moduller`e geçti
(`docs/istekler/on-yuz-acik-modul-listesi.md` kapandı). Sahiplik dışı dokunuş: `rotalar.ts` ve `kabuk.test.tsx` (on-yuz),
`rehberler/**` (icerik), `apps/web/test/seo.test.ts` (orkestra); görevlendirme orkestradan.

## 12 Kasım 2026, mimar: sözleşme v1.5, P1 adım A (codex/p1-sozlesme-v1-5)

review.md P1 madde 4, 5 (doğrulama), 6 (ekleme) ve 8; plan `docs/istekler/mimar-p1-sozlesme-temizligi.md` adım A.
ADR-0035 "Önerildi, Tarık onayı bekliyor"; sözleşme ve şema 1.5.0; migration
`0007_v1_5_jobs_citations_deliveries.sql` yalnız ekler. Adım B (kaldırıcı, ADR-0036, migration 0008) yapılmadı. Canlı
veri tabanına hiçbir şey uygulanmadı. Yeni bağımlılık yok.
- İş kuyruğu (`packages/db/src/jobs.ts`, `services/worker-py/core/jobs.py`): bitirme, hata, gömme ve kalp atışı
  işçi kimliğini eşler ve `RETURNING` döndürür (kilit kaybı loglanır, iş yeni sahibinde kalır); bayat kilit deneme
  sınırında `dead`; kalp atışı 300 sn; `pruneJobsSql` (done 14, failed/dead 90 gün, 5000'lik batch);
  `enqueueOnceSql` ve doğrulayan `enqueueJob`. Python SQL'i test içinde TypeScript metniyle karşılaştırılır.
- İş yükleri: `parseJobPayload`, beş yerel şema sözleşmede, `jobPayloadExempt`; worker-node ve worker-py tüketicileri
  geçersiz yükü çalıştırmadan `invalid payload` ile gömer, yük loglanmaz. Ortak fikstür
  `packages/contracts/test/fixtures/job-payloads.json` hem zod hem Python testinde.
- OpenAPI: `x-kazuist-uygulama` (`planlandi` 11, `kaldirilacak` 11 Kampüs yolu); dört yeni uç
  (`/v1/templates/check`, `/v1/templates/rules/{id}`, `/v1/writing-projects/ayarlar`, `/auth/step-up/confirm`) ve
  `extractTemplateRules.kind`; `rotalar.test.ts` yol, ek ve HTTP yöntemi eşleşmesini sınar. TS istemcisi yeniden
  üretildi; Swift istemcisi üretilmedi (`apps/ios` yok).
- Şema: `works.work_key`, `work_citations`, `citation_edges.rejected` (eski ret biçimi işaretlendi), ifade
  dizinleri, `sources_raw_record_idx`, `jobs_dedupe_idx`, `jobs_finished_idx`, `notification_deliveries`.
- Sahiplik dışı dokunuşlar (plan adım A gereği): orkestra `apps/worker-node/src/{queue,runner,handlers}.ts` ve
  `test/{queue,runner,billing}.test.ts`; anonimlestirme `anonymizer/tests/test_anonymizer.py` içinde tüketici
  testinin kayıt kimliği UUID oldu. yazma ve odeme dosyalarına dokunulmadı; yönlendirme
  `docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md`.
- `.env.example`: `KAZUIST_EMBED_BACKEND`, `_DIR`, `_THREADS`, `_QUANTIZED`, `KAZUIST_TEST_DATABASE_URL`.
- Doğrulama: `pnpm check:text`, `typecheck`, `lint`, `test` (contracts 148, db 54, worker-node 102, web 598, tüm
  paketler geçti), `build`, Redocly lint temiz, enjeksiyon seti 60/60; `uv run pytest` 308 geçti 10 atlandı.
  Geçici yerel PostgreSQL 18.6 ve pgvector kümesinde (sonra durduruldu): v1.4 verisi üstüne 0007 ve ikinci kez
  boş geçiş, ret işaretlemesi, ifade dizini planı, iki bağlantıda `enqueueOnce` yarışı (10/10 tek satır), iki
  işçide SKIP LOCKED çakışmasızlığı, kilit kaybı, temizlik ve cascade; Python tüketicisinde psycopg ile kalp atışı,
  gömme ve kilit kaybı; `nlp/tests/test_pg.py` 4/4.
- Açık: ADR-0035 onayı; ADR-0036 ve Tarık'ın yıkıcı migration onayı; `live.fetch` kapsam kararı; yönlendirme
  dosyasındaki sahip işleri (yazma `kalemcikTick`, kimlik teslim kaydı, atif-agi ve casuist `rejected`).
## 12 Kasım 2026, hukuk-uyum: P5 metinler, KVKK envanteri, protokoller, Midjourney değerlendirmesi

review.md P5 ve ADR-0034 ek görevi. Yalnız `content/hukuki/**`, `docs/kvkk/**`, `docs/protokol/**`, `docs/ip/**`,
orkestranın verdiği `docs/hukuk/**` ve istek dosyası değişti; kod, sözleşme ve şema değişmedi. Bütün metinler
`status: taslak`; yayım kararı verilmedi.
- Metinler (sürüm 2026-11-12.1): barındırma Hetzner AB'ye göre (uyari, aydinlatma, gizlilik); Kampüs çıktı (aydinlatma,
  kosullar, kaldirma; topluluk "uygulanmaz" notuna indi); ADR-0029 (kosullar 5, iade-ve-kredi 6, on-bilgilendirme,
  mesafeli-satis); koda göre düzeltmeler: kodda olmayan virüs taraması ve koyu tema iddiası çıktı, localStorage
  anahtarları (pratik, rehber) çerez politikasına girdi, kaldırma ve hesapsız KVKK başvurusu e-posta yoluna çekildi,
  18 yaş beyanı koşul onayına bağlandı. on-bilgilendirme'ye 6563 m.3/1 bilgileri eklendi, `IOS_SURUM` çıktı.
  abonelik `consent_kind` v1.1 değerine (abonelik_sozlesmesi) çekildi. Ürünle eşleşme tablosu `content/hukuki/README.md`.
- Birincil kaynaktan okunanlar (12 Kasım): KVKK m.5, 6, 9, 10, 11, 13, 14, 16 (mevzuat.gov.tr); Yurt Dışına Aktarım
  Yönetmeliği RG 10/7/2024, 32598 m.14-16 (resmigazete.gov.tr); Kurul'un dört standart sözleşmesi ve bildirim modülü
  (kvkk.gov.tr); VERBİS istisna eşikleri (kvkk.gov.tr/Icerik/8388); 6563 m.2, 3, 4; FSEK m.1/B, 4, 6, 8, 15, 16, 18,
  21, 31, 48-58, ek m.8; TTK m.82; VUK m.253; Ticari İletiler Yön. RG 30998 değişikliği; Hetzner veri koruma ve sertifika
  sayfaları. Kapanan işaretler: gizlilik saklama süresi, protokol README FSEK ek m.8, denge testi FSEK m.31.
- `docs/kvkk/envanter.md` (29 satır, önerilen saklama süreleriyle), `aktarim.md` (Hetzner Standart Sözleşme 2 ve risk),
  `yukumlulukler.md` (ETBİS, VERBİS, İYS, e-Arşiv ve diğerleri), `app-privacy-taslak.md`, `denge-testi.md` (T4, T5).
- Protokol yazıları: altısı da 2026-11-12; "Türkiye'deki sunucularımızda anonimleştirilir" cümlesi çıktı (T4'e bağlı
  işaret), FSEK m.31 ve ek m.8 çerçevesi, 0,5 istek/sn, onaylı adres ve e-posta.
- `docs/hukuk/midjourney-telif.md`: Midjourney koşulları 403 döndü, aşılmadı, "doğrulanmadı"; FSEK m.1/B, 8, 18, 52, 55,
  56 üzerinden seçenek B riskleri, uygulama kuralları, çizer sözleşmesi madde listesi. `docs/ip/arka-plan-kaydi.md`
  görsel varlık tablosu.
- Önemli bulgu: Hetzner'ın sayfası bireysel sözleşme imzalamadığını söylüyor; KVKK Standart Sözleşme 2 iki tarafın
  imzasını istiyor. İmza alınamazsa ADR-0033 ön koşul 1 karşılanamaz (aktarim.md "Hetzner: durum ve risk").
- Önemli bulgu: ödeme adımı `pdf` ve `pdf_fields` ön bilgisini şart koşuyor, on-yuz ayrıştırıcısı liste okuyamıyor;
  bu yüzden ödeme adımı hiçbir ortamda hukuki metin gösteremiyor. İstek: `docs/istekler/hukuk-uyum-p5-tutarlilik.md`.
- Doğrulanmayan: bu oturumda kabuk aracı yoktu; `pnpm test`, `pnpm check:text`, `pnpm build` çalıştırılmadı, dal
  itilmedi ve PR açılmadı. Ön bilgi alanları ve yer tutucu adları test beklentilerine göre elle denetlendi.
- Kesin sonraki adım: orkestra testleri çalıştırıp dalı iter ve PR açar; ardından on-yuz madde 1, Tarık'ın Hetzner'a
  Standart Sözleşme 2 sorusu.
## 12 Kasım 2026, on-yuz: P4 görsel varlıklar (on-yuz/p4-gorsel-varliklar)

review.md P4, ADR-0034 seçenek B. YZ görseli ürüne girmedi; Midjourney'e erişilmedi. Yeni bağımlılık yok
(sharp ve fontTools yalnız yerel üretim betiklerinde, depo bağımlılığı değil); contracts ve db değişmedi.
- `docs/tasarim/gorsel-istemleri.md`: her varlık için yol, ölçü, biçim, dosya sınırı, kabul ölçütü, son dosyayı kimin
  çizeceği, yalnız taslak için Midjourney istemi (sanatçı adı, tanınmış karakter, marka yok) ve kayıt tablosu.
  Avatar (8 meslek x a, b, n), Kalemcik (4 ifade ve ton eşlemesi) ve 20 HMGS konu piktogramı için çizer brifingi.
- Marka işareti `apps/web/src/app/icon.svg`: kâğıt üzerinde mürekkep K, ince ayraç ve aynı hizada lâl şerh (kenar
  şerhinin en küçük hâli), 32 birimlik ızgarada elle yazılmış koordinatlar. `docs/tasarim/simge-uret.mjs` bundan
  `favicon.ico` (16, 32, 48; RGBA, Turbopack paletli girdiyi çözemiyor), `apple-icon.png` (180, yüzde 88),
  `public/icon-192.png`, `icon-512.png` ve `icon-maskable-512.png` (yüzde 80 güvenli alan) üretir; çıktı
  belirleyicidir. Önizleme: `docs/tasarim/gorsel/simgeler-onizleme.png`.
- `apps/web/src/app/manifest.ts` (ad, amaç, `tr`, standalone, kâğıt rengi) ve `opengraph-image.tsx` (statik, 1200 x
  630, yalnız tipografi). Çizim ve sabitler `apps/web/src/app/(kabuk)/_marka/`; renkler `marka.ts`'te belirteçlere
  bağlı (test). next/og WOFF2 okumadığı için sitenin alt kümeli yazı tiplerinin sabit ağırlıklı TTF kopyaları
  `_marka/yazi/` altında (OFL, NOTICE.txt; yeniden üretim `docs/tasarim/og-yazi.py`). Önizleme:
  `docs/tasarim/gorsel/paylasim-karti.png`.
- i18n: `ortak.paylasim.kartAlt` ve `ortak.paylasim.alanAdi`.
- Doğrulama: `marka.test.ts` 21 test; web 619 geçti 1 atlandı, bütün paket testleri, typecheck, lint, check:text,
  build yeşil. Yerel üretimde simge, apple, manifest bağlantıları ve `og:image` 8 sayfada görüldü. 16 sayfa x 375,
  768, 1440 px ekran görüntüsü ve axe: ihlal 0, yatay taşma 0 (sayfa arayüzü değişmediği için görüntüler depoya
  alınmadı). e2e 97 geçti, 3 hesap akışı yerelde veritabanı olmadığı için düştü (`/api/health` 503 degraded).
- Sahiplik: `app/icon.svg`, `favicon.ico`, `apple-icon.png`, `manifest.ts`, `opengraph-image.tsx`, `public/icon-*`
  on-yuz satırında değil; orkestranın görevlendirmesiyle yazıldı. İstekler (seo `twitter.card`, hukuk-uyum IP kaydı ve
  işaret tescili, `public/avatar` sahibi, Kalemcik nötr yüzü): `docs/istekler/on-yuz-p4-gorsel-varliklar.md`.
## 12 Kasım 2026, on-yuz: kabukta oturum ve "yakında" düzeneğinin kaldırılması (codex/on-yuz-kabuk-oturum)

İstek `docs/istekler/kimlik-p7-kabuk-oturum.md` karşılandı; ADR-0033 ve review.md T2 gereği kapalı modül kalmadı.
Yeni bağımlılık yok; `packages/contracts`, `packages/db` ve kök `layout.tsx` değişmedi.
- Hedefim alanı (`apps/web/src/app/(kabuk)/_kabuk/`): `oturum.ts` (tip ve saf görünüm), `oturumYukle.ts` (sunucu:
  `pageSession`, `getMe`, `findProfession`; çerez yoksa veri tabanına gidilmez, silinmiş hesap misafir, profil
  okunamazsa ad ve hedefsiz oturum ve yalnız hata sınıfı loglanır), `HedefimBagi.tsx`, `Hedefim.tsx` (async).
  Misafir: "Hedefim / Giriş yapın", `/giris`. Oturum: ad (yoksa "Hesabım") ve hedef meslek, `/hesap`; hedef
  seçilmemişse "Meslek seçin", `/hesap/hedef`. Avatar halkası adın ilk harfini Türkçe büyük harfle gösterir;
  çizim avatarlar (ADR-0034) gelince `avatar` alanı kullanılır. Dar ekranda metin görsel olarak gizlenir ama
  bağlantının erişilebilir adında kalır (eskiden `display: none` idi).
- `Kabuk` isteğe bağlı `oturum` alır; verilmezse alan oturumu kendisi okur. Layout istek başına çalıştığı için
  ek önbellek yok.
- "Yakında" düzeneği: `ModulBagi.tsx`, `OrnekSoru.tsx`, `.modul-kapali` stilleri ve `gezinme.yakinda` silindi;
  sekmeler, alt bilgi, ana sayfa modül listesi, örnek sorular ve 404 doğrudan bağlantı verir. `acikModuller` ve
  `modulAcik` artık `moduller`'den türetilir ve `@deprecated`; seo, icerik ve orkestra çağıranları
  `docs/istekler/on-yuz-acik-modul-listesi.md` ile istendi, onlar birleşince silinecek.
- i18n `ortak.json`: `hedefim.girisYapin`, `hedefim.girisAciklama`, `hedefim.hesapAciklama` eklendi.
- Doğrulama: web 47 dosya 608 test (607 geçti, 1 atlandı; yeni `kabuk.test.tsx` 9 test), i18n 22, typecheck,
  lint, check:text, build. Yerel PostgreSQL 18 ve üretim derlemesiyle misafir, hedefli ve hedefsiz oturumda
  375/768/1440: 21 sayfa ve genişlikte axe ihlali 0, yatay taşma 0 (`docs/tasarim/ekran/kabuk-*.png`,
  `kabuk-oturum-axe.json`, betik `docs/tasarim/kabuk-oturum-ekran.mjs`). e2e 100/100 aynı sunucuya karşı.
- Güncellenmedi: `docs/tasarim/ekran/ana-sayfa-*.png` gibi eski ekranlar Hedefim'de hâlâ "Meslek seçin" gösterir
  (T11 kararı beklendiği için 48 PNG yeniden üretilmedi). Lighthouse çalıştırılmadı.

## 12 Kasım 2026, casuist: arama dizini, embed.chunks tüketicisi (codex/p9-arama-dizini)

review.md P9 madde 1 ve 8. Üretimde `chunks` tablosunu yazan bir tüketici yoktu; tam metin ve vektör araması boş
kalıyordu. Yeni bağımlılık yok (ONNX yolu mevcut `ner-runtime` ekstrasını kullanır); `packages/contracts` ve
`packages/db` değişmedi, şema değişikliği gerekmedi. İstekler: `docs/istekler/casuist-p9-arama-dizini.md`.
- `services/worker-py/nlp/`: `job.py` (`embed.chunks` işleyicisi, katı `{recordId}` yükü), `store.py` (ADR-0026
  tüketici kuralı: `masked_text` ve `md5` okunur, gömme işlem dışında yapılır, yazma işleminde kayıt `FOR SHARE`
  kilitlenir, özet aynıysa eski parçalar silinip yenileri yazılır, değiştiyse iş `StaleMaskedText` ile düşer ve
  yeniden deneme yeni metni okur; `masked_text` NULL ya da kayıt yoksa hiçbir şey yazılmaz). Ham `records.text`
  hiçbir sorguda yok. `jobs.result` yalnız sayılar ve model kimliği taşır; loglar yalnız sınıf adı ve neden kodu.
- `chunk.py`: `packages/casuist/src/chunk.ts` birebir aktarımı (UTF-16 kod birimi ofsetleri, ECMAScript boşluk
  kümesi, kısaltma kuralı). Ortak altın dosya `packages/casuist/fixtures/parcalar.json` (75 fikstür kaydı, 202
  parça ve 8 uç örnek) hem TS (`test/chunk-parity.test.ts`) hem Python testinde denetlenir. Ek olarak 6000 rastgele
  metinle TS ve Python çıktısı yerelde karşılaştırıldı: 0 fark.
- `embedder.py`: tek arayüz arkasında plan 5.3'teki üç aday (BGE-M3, multilingual-e5-large, Qwen3-Embedding-0.6B),
  ONNX Runtime ile CPU'da, model `KAZUIST_EMBED_DIR/<anahtar>` altından. eval/embed ölçümü yapılmadığı için
  varsayılan kapalıdır; anahtar yoksa, model, çalışma zamanı ya da 1024 boyut tutmazsa worker durmaz, vektörsüz
  yazar ve nedeni loglar. Model kimliği `<anahtar>@<revizyon7>`, web tarafındaki `KAZUIST_EMBED_MODEL` ile aynı
  olmalı. Dış sağlayıcıya hiçbir çağrı yok.
- `reconcile.py`: `python -m nlp.reconcile` ADR-0026 uzlaştırma işi; parçası olmayan ya da yapılandırılmış modelin
  vektörünü taşımayan servis edilebilir kayıtları, etkin işi yoksa kuyruğa atar. Zamanlayıcı altyapi isteğinde.
- Kayıt: `services/worker-py/core/main.py` `build_handlers` içine yalnız iki satır (orkestra izniyle; dosya
  veri-toplamanın). `tests/test_main.py` (mimar) kayıtlı iş kümesini sabitleyen tek satıra `EMBED_CHUNKS` eklendi,
  aksi halde CI kırılıyordu.
- `seedCorpus` paket kökünden çıktı; yeni giriş `@kazuist/casuist/testing` (yalnız test ve yerel). `./fixture`
  seçilmedi, çünkü üretim kodu (`ara/_sunucu/baglam.ts`) fikstür kipinde onu dinamik yüklüyor. Çağıranlar
  (`ara/_sunucu/sql.test.ts`, `kaydettiklerim/_sunucu/kutuphane.test.ts`) güncellendi; `test/entries.test.ts`
  kökün `seedCorpus` dışa aktarmadığını denetler.
- Doğrulama: worker-py 235 geçti 3 atlandı (CI ile aynı); `uv run pytest nlp/tests` 44 geçti 7 atlandı; numpy ve
  gerçek PostgreSQL 18 ile 51/51. PostgreSQL 18 ve pgvector üzerinde 7 göçle uçtan uca: 75 fikstür kaydı yalnız
  `masked_text` ile eklendi (tetikleyici 75 iş açtı), üretim kaydıyla (`build_handlers`) çalışan worker 75 işi
  bitirdi, 202 parça yazıldı (hepsinde `tsv`, vektör 0), ham metin parçalarda yok, `sqlBackend` araması sonuç ve
  pasaj döndürdü, `degraded: ['vektor']`; Python parçaları 75 kaydın hepsinde `chunkText` ile aynı. casuist 107
  test, tüm Node testleri, typecheck, lint, check:text ve build geçti.
- Ölçülmedi: arama kalitesi gerçek corpus ve gerçek gömme modeliyle (P9 madde 9); hiçbir aday modelle
  çalıştırılmadı, ONNX yolu yalnız küçük yapay bir grafikle yerelde denendi.
- Açık: `pyproject.toml` `testpaths` içine `nlp/tests` (orkestra); sorgu gömmesi HTTP servisi; eval/embed seti ve
  ölçümü; uzlaştırma zamanlayıcısı ve model birimi (altyapi); `.env.example` değişkenleri (mimar).
## 12 Kasım 2026, kimlik: hesap arayüzü ve bildirim düzeltmeleri (codex/p7-hesap-arayuzu)

review.md P7 madde 1, 2, 3 ve 5. Yönetim paneli (madde 4) bu PR'da yok. Yeni bağımlılık yok (passkey için mevcut
`better-auth/client` ve `@better-auth/passkey/client`); `packages/contracts` ve `packages/db` değişmedi.
- Oturum denetimi: `server/auth/page-session.ts` (`requirePageSession`, `safeNext`). `/hesap/**` oturumsuzsa
  `/giris?sonra=<yol>`'a yönlenir; `sonra` yalnız site içi yol kabul eder (açık yönlendirme testli).
- `/hesap`: profil özeti, ad formu (PATCH /v1/me), güncel kullanım koşulları ve aydınlatma metni onaylanmadıysa rıza
  kutusu (`account-view.ts` `pendingConsents`; e-posta kodu, Google, Apple ve iOS ile açılan hesaplar da buradan
  onaylar), alt sayfalara bağlantılar, çıkış düğmesi. Alt sayfalar: `hedef` (PUT target-profession, meslek ve görünüm),
  `ogrenci` (edu.tr kodu, iki adım), `kvkk` (m.11 talep türü, açıklama, cevap kanalı, makbuz), `guvenlik` (yeni:
  passkey ekle ve kaldır, TOTP kurulumu, editör ve yönetici için `/api/auth/step-up/confirm` onayı), `verilerim`.
- `/giris`: parola, tek kullanımlık e-posta kodu, passkey; TOTP açık hesapta parola girişinden sonra ikinci adım.
  `/parola-sifirla` (yeni): e-posta kodu ve yeni parola. `auth.ts` `revokeSessionsOnPasswordReset: true`;
  `/email-otp/request-password-reset` dar kod sınırına eklendi.
- `/kayit`: zorunlu rıza kutusu; kayıttan sonra `POST /api/v1/me/consents` ile `kullanim_kosullari` ve
  `aydinlatma` satırları `content/hukuki` sürümüyle yazılır.
- Bildirim: `render()` Kalemcik referansında `renderKalemcikNotice` kullanır (push yine genel metin); `/kampus` yolları
  `/hesap`; APNs yalnız 410 ya da `BadDeviceToken`/`Unregistered` gerekçesiyle aboneliği siler; web-push ve APNs 10 sn
  zaman aşımı, APNs bağlantısı her yolda kapanır; push hatası artık e-postayı yinelemez (yalnız hiçbir kanal
  teslim edilmediyse iş yeniden denenir). Tam çözüm için istek: `docs/istekler/kimlik-p7-bildirim-idempotency.md`.
- yazma ajanının dosyasına tek dokunuş: `apps/worker-node/src/kalemcik/__tests__/kalemcik.test.ts` içindeki render
  beklentisi Kalemcik metnine göre güncellendi.
- İstekler: `kimlik-p7-kabuk-oturum.md` (on-yuz, Kabuk prop önerisi; Kabuk.tsx'e dokunulmadı),
  `kimlik-p7-e2e-riza.md` (kalite-guvenlik: `/kayit` e2e testi kutuyu işaretlemeli, şu an bu tek test kırmızı).
- Doğrulama: typecheck, lint, test (web 575, worker-node 96), check:text, build temiz. Yerel üretim derlemesinde
  27 sayfa ve genişlik için axe: kritik ve ciddi 0, orta ve düşük 0, yatay taşma 0; kayıt, rıza, hedef, KVKK,
  edu.tr, TOTP kurulumu, çıkış, parola ve TOTP ile giriş Playwright ile uçtan uca geçti. Gerçek passkey töreni
  (donanım doğrulayıcı) ve gerçek SMTP ile kod teslimi denenmedi.
- Kesin sonraki adım: kalite-guvenlik `hesap.spec.ts`'e kutu satırını ekler; on-yuz Kabuk oturum prop'unu bağlar;
  mimar teslim tablosunu karara bağlar; ardından P7 madde 4 (yönetim paneli).
## 12 Kasım 2026, seo: görünürlüğün ortama bağlanması, robots, site haritası, llms.txt (codex/p6-seo)

Yeni bağımlılık yok; `packages/contracts` ve `packages/db` değişmedi. P6 madde 1 ve 2 kapandı; madde 3 ve 4 bu PR'da yok.
- Ortam kararı `apps/web/src/app/(seo)/_seo/ortam.ts`: yalnız `NODE_ENV=production`, `KAZUIST_ENV=production` ve `APP_URL` https `kazuist.com`
  birlikte olduğunda index; eksik, staging, geliştirme, www veya http her durumda `noindex, nofollow`. Varsayılan kapalı.
- `layout.tsx` (orkestra yolu) yalnız iki satır: `temelMetadata()` içe aktarımı ve eski `title` ile `robots` satırlarının yerine
  `...temelMetadata()`. Kaynak `(seo)/_seo/metadata.ts`: metadataBase (APP_URL), `title: { template: '%s | Kazuist', default: 'Kazuist' }`,
  robots, `alternates.canonical: './'` (her sayfa kendi adresine; sorgu dizgisiz), OpenGraph `website`, `tr_TR`, görsel yok. Plan
  dışı iki küçük ek (canonical ve OpenGraph) aynı nesnede olduğu için layout'a ayrı satır eklenmedi. hreflang yok (ADR-0032).
- `robots.ts`: üretim dışında `Disallow: /` ve site haritası satırı yok. Üretimde `*` ve arama botları (OAI-SearchBot, ChatGPT-User,
  PerplexityBot, Perplexity-User, Claude-SearchBot, Claude-User, Googlebot, Bingbot) serbest; eğitim botları (GPTBot, ClaudeBot,
  Google-Extended, CCBot) `/mevzuat/`, `/karar/`, `/kurum-karari/`, `/makale/` altında engelli; herkese `/api/`, `/yonetim`, `/odeme`
  kapalı (botun kendi grubu `*` grubunu geçersiz kıldığı için her grupta yinelenir). `force-dynamic`: ortam değişkeni çalışma zamanında okunur.
- `sitemap.ts`: `rotalar.ts` `acikModuller` ile tutarlı (yalnız `/kaydettiklerim` bilerek dışarıda, kişisel ve noindex), açık modüllerin genel
  alt sayfaları, `/`, `/fiyatlar`, `/tespit`, `/hukuki` ve üretimde yayımlanan hukuki metinler (taslak olan listelenmez; Casuist arşiv
  sürümü duran beş belge listelenir), `/tr` ve beş alt sayfa. İngilizce adres, `/eski` ve `/tr/hukuki/*` (301 kaynağı) yok. `lastModified`
  yalnız gerçek tarih biliniyorsa (yayınlanmış hukuki sürüm tarihi) yazılır; uydurma `new Date()` yok. Dinamik kayıt sayfaları ve dergi profilleri
  Dalga 2 parçalı site haritasına kaldı.
- `public/llms.txt`: Türkçe, plan 1 ve 13'ten ürün tanımı, kaynak politikası, bot politikası; rakam ve güncellik iddiası yok; yalnız var olan sayfalara bağlantı.
- Testler `apps/web/test/seo.test.ts` (23): noindex matrisi, robots grupları, sitemap'te kaldırılan 11 İngilizce adresin yokluğu, listedeki her yolun
  uygulamada sayfası olduğu, llms.txt bağlantılarının varlığı.
- Elle görülen (yerel üretim derlemesi, iki ortam): üretimde `index, follow`, canonical `https://kazuist.com/ara`, tam robots ve 28 adreslik site
  haritası; ortam değişkensiz `noindex, nofollow`, `Disallow: /`; `/en` ve `/problem` 404; `/llms.txt` 200.
- Bilinen kusur: sayfaların elle yazdığı "| Kazuist" ekiyle sekme başlığı "Başlık | Kazuist | Kazuist" oluyor (24 dosya, başka ajanların yolu);
  liste ve düzeltme biçimi `docs/istekler/seo-p6-baslik-sablonu.md`. OpenGraph görseli yok: `docs/istekler/seo-p6-og-gorseli.md`.
- Doğrulanmayan: gerçek alan adında robots ve bot `curl -A` denemeleri, WebSEORobot ve WebSCHEMArobot (DNS ve yayın sonrası), staging'de
  `X-Robots-Tag` başlığı (next.config orkestranın; yalnız meta ve robots.txt var).
- Kesin sonraki adım: sayfa sahipleri çift eki kaldırır; ardından P6 madde 3 (kayıt sayfası rotası, citation_*, Article/Legislation JSON-LD, Organization,
  WebSite ve SearchAction, BreadcrumbList) ve Search Console adım listesi.
## 12 Kasım 2026, mimar: P1 kararlarının yazımı ve sözleşme temizliği planı (codex/p1-mimar-kararlar)

review.md P1 madde 1, 2, 3 ve 10 yapıldı; madde 4-9 yalnız plan olarak yazıldı. `packages/contracts` ve `packages/db`
değişmedi; yeni bağımlılık yok.
- ADR-0033 (Önerildi): staging yok, Hetzner'da tek sunucu, Coolify, tek seferde yayın; sunucu boyutu seçilmedi
  (CAX21 Arm64 8 GB ile 16 GB x86 arası, Hetzner sayfasından 12 Kasım'da okundu), imajlar GitHub Actions'ta
  amd64 ve arm64 için derlenip çekilir. ADR-0030 madde 3-4'ü değiştirir; ADR-0030'un KVKK m.9 koşulu değişmez ve
  yayının ön koşulu olarak yazıldı. K-11 ile ilişki açık soru (T4), karar verilmedi.
- ADR-0034 (Önerildi, karar yok): görsellerde YZ serbest, YZ yalnız taslak ve son hali çizer, mevcut kural. Midjourney
  koşulları resmî sayfadan okunamadı (otomatik istemciye HTTP 403); sahiplik, görünürlük ve otomasyon maddeleri
  "doğrulanmadı" diye yazıldı. FSEK m.1/B tanımları mevzuat.gov.tr metninden okundu.
- ADR-0002, 0003, 0014, 0016 Durum satırları ve `docs/adr/README.md` özetleri "ADR-0030/0031/0032 ile değişti";
  README tablosu 0028-0034 satırlarıyla tek tabloya toplandı; ADR-0030 Durum satırına ADR-0033 notu.
- `docs/sahiplik.md`: kampus pasif; `{tr,en}` desenleri `tr`; yazma satırına `/tespit`, `docs/tespit`, `tespit.json`
  ve yazma API yolları; `hesap.json` kimlik, `/kaydettiklerim` ve `kaydettiklerim.json` casuist (git geçmişinden);
  sahipsiz kalan `api/v1` yolları (search, answers, norms, library, records, citation-network, decks) ilk ekleyene
  verildi; kök `review.md` orkestranın; not 3'teki eski "henüz atanmadı" cümlesi düzeltildi.
- Ajan tanımları: seo (hreflang), on-yuz (/en, altı sekme), hukuk-uyum (İngilizce sürüm), ios (Kampüs sekmesi),
  kampus (pasif, çağrılmaz). plan.md'de yalnız Ek A seo kopyasının iki satırı.
- `.env.example`: kodda okunan 14 eksik değişken eklendi; kodda okunmayan 17 yer tutucu `[gelecek faz]` işaretli
  (S3 anahtar çifti uygulamada okunmuyor, yalnız yerel compose ve CI kullanıyor); staging ve "endpoint in Turkey"
  anlatımı ADR-0033'e göre düzeltildi; `ACCOUNT_PURGE_GRACE_DAYS` kimlik bölümüne taşındı (boş değer kodda 14'e düşer).
- `docs/istekler/mimar-p1-sozlesme-temizligi.md`: P1 madde 4-9 için iki adımlı plan (A ekleyici, ADR-0035, migration
  0007; B kaldırıcı, ADR-0036, migration 0008, Tarık onayıyla ve ilk üretim dağıtımından önce).
- `docs/ip/arka-plan-kaydi.md` ADR listesine 0021-0034 durumları eklendi.
- Doğrulanmayan: ADR-0033 ve 0034 Tarık onayı bekliyor; Midjourney koşulları birincil kaynaktan okunmadı.
- Kesin sonraki adım: Tarık'ın T1 (ADR-0033), T3 (ADR-0034) ve T4 kararları; ardından adım A (ADR-0035).

## 12 Kasım 2026, orkestra: yayın öncesi tam denetim ve review.md (codex/yayin-oncesi-denetim)

Üç salt okunur ajan (ön yüz, işçiler ve paketler, altyapı ve belgeler) ve yerel typecheck, lint, test, build ile `main`
(bfefdb6) denetlendi. Sonuç ve ajanlara devredilecek 11 iş paketi kökteki `review.md` dosyasındadır; Tarık'ın vermesi
gereken 11 karar aynı dosyanın 1. bölümündedir. Yeni bağımlılık yok; `packages/contracts` ve `packages/db` değişmedi.
- Düzeltilen hatalar: Kalemcik günlük işi 00.00 yerine İstanbul saatiyle 08.00'e kuruluyor (hatırlatmalar hiç
  gönderilmiyordu); hata veren `tick` kuyruğu durdurmuyor; SSE akışı erken bitince sağlayıcı bağlantısı kapanıyor;
  `cited_by` yalnız yayın eşiğini geçen atıfları sayıyor; OpenAlex DOI küçük harfe çevriliyor; dergi profili sayfası
  sorguyu istek başına bir kez çalıştırıyor.
- Temizlik: `adr0031Kaldirilan`, `hreflang` eşlemesi, yanlış yorumlar; CI'da `uv sync --frozen`; gitleaks dizin çıktısı
  ekleniyor; `engines.node` 26; kök `pnpm e2e` betiği; rastgele kırılan Kalemcik sıralama testi.
- Doğrulanmayan: tarayıcıda görünüm ve axe, arm64 derlemesi, `pnpm e2e` betiğinin çalıştırılması. Denetimin okumadığı
  yerler `review.md` 8. bölümdedir.
- Kesin sonraki adım: T1, T2, T3 kararları ve Hetzner sunucusu; ardından P1 madde 1 (ADR-0033 ve ADR-0034).

## 7 Kasım 2026, atif-agi: atıf çıkarma, atıf ağı uçları ve /atif-agi (codex/dalga2-atif-agi)

Yeni bağımlılık yok (Batch istemcisi standart kütüphane); `packages/contracts` ve `packages/db` değişmedi (istekler
`docs/istekler/atif-agi-sema.md` ve `atif-agi-sozlesme.md`). Menüde `/atif-agi` açıldı (`acikModuller`, yalnız o satır).
- Çıkarma `services/worker-py/citations/`: `decisions.py` E/K/T (harf önce, numara önce, "E.K." birleşik), AYM bireysel
  başvuru ve norm denetimi, ABAD `C-131/12`, AİHM `no. 12345/09`; mahkeme, daire ve tarih yalnız yazılıysa doldurulur,
  alt mahkeme anmaları (dosya geçmişi) kenar sayılmaz. `doctrine.py` sayfa işaretine (`s. 373 vd.`) tutunup geriye doğru
  okuyan kural ayrıştırıcı: tam künye, `Soyad, A.:` biçimi, makale, `age.` ve kısa başlık. `names.py` unvan temizleme ve
  Türkçe karakter, `works.py` baskıların tek düğümde toplanması ve belge içi `age.` çözümü (birden çok aday ya da yazarsız
  uzak `age.` yayın çizgisinin altında kalır).
- Güven ve kuyruk (`scoring.py`, `pipeline.py`): yayın eşiği 0,90, kuyruk 0,50, altı atılır; karar kenarı hedef kayıt
  corpusta tek ve alanları uyumlu ise çizilir, aksi halde `hedef_yok` (saklanır, çizilmez) ya da kuyruk. Kuyruk
  `review_queue.queue='citations'`, bağlam yalnız maskeli metinden.
- Model katmanı (`llm.py`): yalnız `masked_text` ve yalnız doktrin işareti taşıyan paragraflar; doğrulanmış kimlik
  kalıntısı görülürse hiçbir şey gitmez (`UnmaskedText`); model cevabı veridir: katı JSON, birebir alıntı yoksa atılır;
  Batch iş akışı (`job.py`) gönder, 10 dk aralıkla yokla, topla. Gerçek model çağrısı yapılmadı, anahtar kullanılmadı.
- API: `GET /v1/citation-network` ve `GET /v1/records/:id/network` (zod, IP başına hız sınırı, yalnız servis edilebilir
  kayıt). Sözleşmeye ek alanlar (`works`, `workEdges`, `externalCitations`, `summary`, `meta`) geriye uyumlu eklendi.
- Arayüz `apps/web/src/app/atif-agi/`: solda kararlar, sağda eserler; düğümler gerçek düğme (Tab, Enter, Boşluk, Esc),
  çizgiler aria-hidden SVG; seçim kalın kenar ve gizli metinle bildirilir; ayrıntı paneli (`aria-live`), özet kartları,
  `?gorunum=tablo` eşdeğer tablo görünümü, GET süzgeç formu. Örnek veri `_veri/ornek-ag.json`, eval betiği üretir.
- Kaynak seçimi `ara` ile aynı: `KAZUIST_ARAMA_KAYNAGI=fikstur` yalnız yerel ve deneme; üretimde veritabanı yoksa 503.
- Ölçüm `eval/citations/olc.py`: 7 gerçek karar (8 karar atfı, 4 doktrin atfı) ve 4 sentetik metinde kenar kimliği
  kesinliği %100. Bu 15.3/4 değildir: 100 kararlık altın set ve gerçek corpus yok, "ölçülmedi" yazıldı.
- Erişilemeyen kaynak: Yargıtay karar arama (`karararama.yargitay.gov.tr/aramalist`) otomatik istemciye "Hata Oluştu"
  döndü (robot doğrulaması yolu var); dürüst kimlikle 3 deneme yapıldı, kimlik taklidi ve aşma yapılmadı. SRS'teki dört
  kararın resmî metni bu yüzden alınamadı; HGK E.2014/4-56 K.2015/1679 atfı gerçek iki kararda (4. HD 2023/12295 ve
  7. CD 2023/30) bulundu, kararın kendisi corpusta yok.
- Açık: doktrin tabloları (`work_citations`, `works.work_key`) ve `citation_edges.rejected`; editör kuyruğu ekranı
  (kimlik, admin); 100 kararlık set; `bozma/onama/ayni_yonde/aksi_yonde` türleri üretilmiyor (yalnız `atif`);
  yıl içermeyen eski numaralar (`7803-9629 sayılı`) desteklenmiyor; pyproject `testpaths` içine `citations/tests` eklenmeli.
- i18n: yalnız `packages/i18n/tr/atif-agi.json` (kullanıcı kararı: İngilizce yok); `en` eşlik testi bu dosya için
  düşer, test değiştirilmedi (on-yuz `en` dizinini kaldıracak).

## 7 Kasım 2026, icerik: Rehberler modülü açıldı (codex/dalga2-rehberler)

Yeni bağımlılık yok (MDX yerine JSON, gerekçe docs/istekler/icerik-rehberler.md); contracts ve db değişmedi. `acikModuller`
kümesine yalnız `'/rehberler'` eklendi. Yalnız Türkçe: `en` dizini yok (orkestra kararı), `packages/i18n/test/parity.test.ts`
bu yüzden `rehberler.json` için iki test kırar ve `en` kaldırılınca düzelir; test değiştirilmedi.
- İçerik `content/rehberler/*.json`: makale 12 adım, tez monografi modeli ve 12 adım (her adım bir dayanağa bağlı), Zotero 8 ve
  EndNote 6 adım, karşılaştırma tablosu, 14 maddelik kontrol listesi, YÖK yönergesi m. 4/1 altı ihlal (birebir tanım, kurgusal
  hukuk örneği). Şema `apps/web/src/app/rehberler/_alan/sema.ts`; geçersiz dosya derlemeyi durdurur.
- Sayfalar: `/rehberler`, `/rehberler/{makale,tez,zotero-endnote,kontrol-listesi,etik}`. Her sayfada üstte etik kutusu, altta sabit
  uyarılar ve /tespit bağlantısı. İlerleme `localStorage` `kazuist.rehber.v1`, makale, tez ve kontrol ayrı saklanır; sunucuda
  saklama (FR-34) için istek yazıldı. Kapalı modüle (/ara, /yazma) bağlantı çizilmez.
- Kaynak: "Hukuk Atlası: Makale ve Tez Yazım Rehberi" Word belgesi depoda yok, içerik ondan aktarılmadı; yalnız doğrulanmış
  kaynaklar kullanıldı. Zotero (zotero.org/support) ve EndNote 2025 (docs.endnote.com) düğme ve menü adları resmî sayfalardan
  alındı, her kayıt URL ve okuma tarihiyle sayfada listeli. YÖK PDF'i okundu. Kitap dayanaklarının (Volokh, Dunleavy,
  Silvia, Hutchinson ve Duncan) hiçbiri birincil okunmadı, sayfada "ikincil" yazılı; Edinburgh planlayıcısı birincil.
  Deakin sayfası CAPTCHA istedi (aşılmadı); EndNote sistem gereksinimi sayfası 404 verdi.
- Doğrulama: typecheck, lint, check:text, web testleri 354 geçti/1 skip, üretim derlemesi; 375/768/1440 px'te 6 sayfa, klavyeyle
  işaretleme, yenileme sonrası kalıcılık, etik kutusunun klavyeyle açılması: 93 kontrol, 24 axe taraması, 0 sorun
  (`apps/web/src/app/rehberler/_kanit/`; axe test tarayıcısında `bypassCSP` ile çalıştı, ekran okuyucuyla elle deneme yapılmadı).
- Açık: FR-34 sunucu saklama, /ara filtre parametresi, seo (Article, canonical), kitap dayanaklarının asıl metinle
  doğrulanması, Word rehber belgesinin gelmesi, EndNote'ta İSNAD stili doğrulaması.
## 7 Kasım 2026, on-yuz: ADR-0032 yalnız Türkçe (codex/yalniz-turkce)

Kullanıcı kararı (ADR-0032, PR #64) uygulandı; PR açık, birleştirilmedi. Yönlendirme eklenmedi.
- i18n: `packages/i18n/en/**` ve `parity.test.ts` silindi. `src/index.ts` tek dilli: `locales`, `Locale`,
  `sourceLocale` kalktı, `ortak()` parametresiz (tip `tr/ortak.json`'dan). Yeni `test/anahtarlar.test.ts` yalnız tr
  dizinini, boş değer, yinelenen anahtar ve tip güvenliğini denetler; `check` betiği ona bakar. `ortak.json`'dan
  `altBilgi.casuistEn`, `anaSayfa.enNotu`, `casuist.baglayiciSurum`, `casuist.turkceSurum` çıktı. Bütün
  `ortak('tr')` çağrıları `ortak()` oldu.
- Rotalar: `(casuist)` altındaki /en, /problem, /how-it-works, /evaluation, /partner, /about ve /legal/[belge]
  sayfaları ile 11 İngilizce arşiv JSON'u silindi. Türkçe arşiv sayfalarından "English" dil bağı (`langLink`)
  kaldırıldı; `CasuistSayfa` dil dallanmasız, marka bağı /tr. /eski arşivi `lang: tr`, başlığı Türkçe.
  next.config.ts'deki Türkçe hukuki 301 aynen duruyor (İngilizceye ait girdi yoktu).
- Kabuk: alt bilgideki "Casuist (English)" bağı ve ana sayfadaki İngilizce not kalktı; `html lang="tr"` zaten sabitti.
- Hukuki: `content/hukuki/en/**` silindi; altı Türkçe metindeki `alternate: /legal/...` satırı ve /hukuki
  sayfalarındaki hreflang `alternates` kalktı. `yukle.ts` yalnız `tr` okur, `lang: tr` dışını reddeder;
  `HukukiGovde` bağlayıcı sürüm notu ve en-GB tarih dalı olmadan.
- Testler: Ek H tablosu 23 satır kaldı; 2-11 numaralı satırlar `gone` ve 404 beklenir, /en de 404 ve Location yok.
  Güvenlik başlık testinde /problem yerine /tr. Lighthouse bütçesi /en yerine /tr (CI adımı adı dahil).
- SEO: main'de sitemap.ts, robots.ts ve public/llms.txt yok; temizlenecek adres yoktu.
- Doğrulama (origin/main #63 ve #64 birleştirildikten sonra): typecheck, lint, check:text, build; i18n 20,
  contracts 122, ui 31, casuist 104, db 43, ledger 168, web 487/1 skip, worker-node 77, ai-gateway 67/2 skip.
  #63'ün eklediği `packages/i18n/en/{yazma,kalemcik,tespit}.json` silindi, yeni `ortak('tr')` çağrıları
  `ortak()` oldu. Yerel üretim sunucusunda 11 İngilizce adres 404 (Location yok), /tr ve altı, /yazma, /kalemcik
  200, beş Türkçe hukuki 301. Ekran ve axe `docs/tasarim/ekran`: 16 sayfa, 375/1440 axe 0, üç genişlikte taşma 0.
- Açık: sözleşme ve sahiplik temizliği `docs/istekler/on-yuz-yalniz-turkce-sozlesme.md` (mimar). Arşiv HTML'leri
  `docs/tasarim/casuist-arsiv/*.html` kayıt olarak duruyor, dönüştürücü artık yalnız Türkçe sayfaları üretir.
  Search Console kaldırma talebi seo ajanında (ADR-0032).

## 7 Kasım 2026, yazma: Dalga 2 yazma modülü (codex/dalga2-yazma)

Yeni sözleşme veya şema değişikliği yok; ihtiyaçlar docs/istekler/yazma-*.md (sozlesme, bildirim-ve-hesap, yz-gecidi, orkestra).
- Çekirdek `apps/web/src/app/yazma/_cekirdek`: kural şeması (SRS 6.2), tez ve makale .docx üreticisi (docx 9.15; iki bölüm, i/ii ve 1/2 numara, Normal/Başlık 1-3/Dipnot Metni stilleri, içindekiler alanı, kapak, ASCII dosya adı), PDF/DOCX/TXT metin çıkarma (20 MB, tür içerikten, zip bombası sınırı, 200 karakter altı uyarı), kural çıkarma hattı (Haiku, şema düşerse Sonnet, alan başına sayfa ve alıntı, alıntı kılavuzda birebir aranır, değer alıntıda geçmezse "Örnek değer"), kısaltmalar cetveli.
- API (`api/v1/{writing-projects,journals,templates,jobs,abbreviations}`): çalışmalar ve ilerleme, dergi profilleri (yalnız editörün onayladığı sürüm görünür), kılavuz yükleme işi, .docx denetimi, kısaltma cetveli. Dosyalar saklanmaz, YZ'ye gitmez (denetim) ya da maskelenmiş gider (kılavuz; YZ bağlaması kapalı gelir, `YAZMA_YZ=acik`).
- Sayfalar: /yazma, /yazma/sablon (?dergi=<slug> onaylı profili ekrana doldurur), /yazma/dergiler/[slug], /kalemcik; /tespit ile karşılıklı bağlantı; `acikModuller`'e '/yazma'.
- Python `services/worker-py/docxcheck`: stdlib ile .docx denetimi (kenar boşluğu, yazı tipi, punto, satır aralığı, girinti, başlıklar, dipnot, sayfa numarası konumu ve Roma/Arap, bölüm sırası, kelime sınırı), iç HTTP ucu, LibreOffice headless PDF ve sayfa numarası doğrulaması, CLI. 43 test.
- Kalemcik: `apps/worker-node/src/kalemcik` günlük iş (teslim 14/7/3/1/0 gün, üç gün sessizlik kuralı ve iki günde bir tekrar, hitap sen/siz, 30 gün saklama temizliği); mesajlar `content/kalemcik.yaml`'dan (JSON kopyası, test sapmayı yakalar). Metin `notify.send` refId'sinde adlandırılır; kimliğin `render()` satırı bekleniyor.
- eval/rules: beş gerçek DergiPark kılavuzu, altın etiketler, ölçüm betiği. Plan 15.3/3: "3 kılavuzda hatasız .docx" geçti; "çekirdek %95" **geçmedi** (canlı model ölçümü yok, 5/10 kılavuz). Word ve Google Docs elle kontrol kaydı bekliyor (eval/rules/el-kontrol-kaydi.md).
- Doğrulama: web 307 test, worker-node 77, i18n 15, python docxcheck 43; typecheck, lint, prettier, check:text, üretim derlemesi; 375/768/1440 axe 0 ihlal ve taşma 0 (eval/rules/ekran, gerçek PostgreSQL 18, gerçek docxcheck servisi, Brave).
- Açık: orkestra kayıtları (kalemcik.daily, docxcheck bağlama, pyproject testpaths), YZ bütçe ve kredi girişi (yz-gecidi), 10 enstitü/dergi kılavuzu ve canlı ölçüm, DergiPark protokolü olmadan otomatik çekme yapılmadı, editör kuyruğuna düşen dergi taslakları için yönetim arayüzü kimlik/orkestra'da.
## 7 Kasım 2026, casuist: /ara, kaynaklı özet ve /kaydettiklerim (codex/dalga2-casuist)

Dalga 2 casuist ilk teslimi; PR açık, birleştirilmedi. `packages/contracts` ve `packages/db` değişmedi.
- Çekirdek `packages/casuist`: Ek D.2 normalizasyonu; norm çözücü (kanun numaraları mevzuat.gov.tr resmî metniyle
  doğrulandı, `src/laws.ts`); 6.5 kalıplarıyla karar çözücü; kimlik, tam metin ve vektör kollarını RRF (k=60) ile
  birleştiren arama; ilgililik (sıra kanıtla ölçeklenir) ve önem puanı; 7.3 etiketleri; Ek F otorite sınıfı;
  `MemoryBackend` (fikstür) ve `sqlBackend` (records, chunks, `turkish` tsvector, halfvec HNSW, citation_edges);
  pasaj seçimi (künye satırı pasajın ilk satırıdır, sayılar onunla doğrulanır); Ek D.2 satır doğrulayıcısı
  (`./validator` girişi tarayıcıda çalışır, test Node yerleşiği kullanmadığını zorlar); SSE olay akışı ve çekimserlik;
  RIS ve BibTeX. Canlı federasyon `LiveSource` arayüzü 1,2 sn bütçeyle hazır, bağdaştırıcı yok.
- Fikstür: 75 kayıt, resmî kaynaklardan 7 Kasım'da alındı (KVKK tamamı, TBK m.49-75, Anayasa 5 madde, 7 Yargıtay
  kararı, 1 KVKK Kurul özeti, GDPR m.1-2). Kaynak, özetler ve üretim komutu `packages/casuist/fixtures/KAYNAK.md`.
  Üretimde fikstür kapalıdır; veritabanı yoksa arama 503 döner.
- Uçlar: `GET /v1/search`, `/v1/records/:id`, `/v1/norms/resolve` (IP hız sınırlı, yalnız `masked_text`, gizli kayıt
  yok); `POST /v1/answers` (SSE; yz-gecidi üzerinden yalnız maskeli metin; günlük 2 ücretsiz, edu.tr ile 5; sonra 2
  kredi; doğrulanmış cümle yoksa hak ve kredi geri; BYOK aktarma `yz_aktarim` onayı ister); `prepare` ve `verify`
  (tek kullanımlık nonce, imzalı istem, sunucuda yeniden doğrulama); `/v1/library` GET/POST/DELETE ve export
  (ris, bibtex; İSNAD/OSCOLA/Bluebook CSL kararına kadar 400 ve açıklama).
- Arayüz: `/ara` (form, filtreler, türe göre sayılı sekmeler, sonuç kartı, kenar şerhli özet, dayanağı göster,
  sabit uyarılar, etiket sözlüğü, resmî siteler) ve `/kaydettiklerim` (liste, çıkarma, kaynakçayı kopyala, indir).
  `acikModuller` içine `/ara` ve `/kaydettiklerim` eklendi.
- Ölçüm: `node eval/rag/olc.ts --yaz`; 50 soru (36 cevaplı, 10 cevapsız, 4 tuzak). Fikstürde ilk 10'da beklenen kaynak
  36/36, doğrulayıcı 144 saldırgan satırın hiçbirini göstermedi, birebir alıntılı 36/36 satırı kabul etti. Gerçek
  corpus ve model gerektiren 7.6 eşikleri (çekimserlik, desteksiz cümle, p95'ler, ad sızıntısı) ölçülmedi, geçti
  sayılmadı. Rapor `eval/rag/raporlar/dalga-2-fikstur.md`.
- Doğrulama: casuist 104, web 227 geçti/1 skip (PGlite üstünde gerçek göçlerle SQL arka ucu, özet ve kütüphane
  uçları, taklit sağlayıcı), tüm çalışma alanı testleri, typecheck, lint, check:text, üretim derlemesi. Yerel
  PostgreSQL 18 + pgvector'de göçler ve fikstür yüklemesi, üretim sunucusunda arama ve 375/768/1440 px axe 0, yatay
  taşma 0 (özet ekranı taklit SSE ile; görüntüler yerel çalışma klasöründe).
- Açık: kilit dosyası güncellemesi (orkestra), sözleşme önerileri ve komşu ajan işleri
  `docs/istekler/casuist-dalga2.md` ve `casuist-kaydettiklerim.md`; embedding servisi ve eval/embed, embed.chunks
  tüketicisi ve uzlaştırma işi, BYOK istemci arayüzü, zaman çizelgesi (FR-13), CSL biçimleri, gerçek corpus ölçümü.
## 7 Kasım 2026, pratik: FSRS, dört oyun, HMGS destesi ve deneme, onay akışı (codex/dalga2-pratik)

Yeni bağımlılık yok; contracts ve db değişmedi (istekler `docs/istekler/pratik-*.md`). Menüde `/pratik` açıldı
(`acikModuller`).
- Motor `apps/web/src/app/pratik/_alan/`: `fsrs.ts` FSRS-6, bağımlılıksız, ts-fsrs 6.0.0 (MIT) referansıyla 8 senaryo x 14
  adım sekiz ondalığa eşleşir (`referans/`); fuzz kapalı, gün sınırı UTC+3, dakika adımı yok. `kart.ts` kart modeli
  (plan 10.6/1 alanları, durum hesaplanır), `onay.ts` iki editör kuralları, `depo.ts` ilerleme (günlük yeni kart sınırı
  10, tekrar sınırsız, seri), `oyun.ts` tur mantığı, `deneme.ts` 120 soru/155 dk dağılımı, baraj 70, konu raporu.
- Arayüz: `/pratik`, `/pratik/bugun`, `/pratik/deste/[slug]`, `/pratik/hmgs`, `/pratik/hmgs/deneme`, `/pratik/editor`.
  Doğru/yanlış işareti şekil ve metindir (FR-58), açıklama, kaynak, birebir kanun alıntısı, "kanunu aç". İlerleme
  tarayıcıda `localStorage`; sunucuda yalnız `GET /api/v1/decks` ve `/decks/{id}/cards`.
- İçerik `content/desteler/`: 7 deste, 59 özgün kart, 61 kaynak denetimi `dogrula.ts` ile birebir geçti (Anayasa
  anayasa.gov.tr, TMK mevzuat.gov.tr). Hiçbir kart editör onayı almadı, bu yüzden üretimde görünür kart 0 ve sayfalar
  bunu dürüstçe söyler. Staging'de `PRATIK_ONIZLEME=1` onay bekleyen kartları gösterir. 13 alanda deste yok.
- Kaynak erişimi: mevzuat.gov.tr tarayıcı olmayan istemcilere zaman aşımı veriyor. TMK sayfasını ve Anayasa'nın
  karşılaştırma kopyasını keşif sırasında tek seferlik tarayıcı kimliğiyle okudum (2 istek); sonra bunu bıraktım,
  kalan kaynaklar anayasa.gov.tr'den dürüst kimlikle alındı. Betik `--yerel` ile tarayıcıdan kaydedilmiş sayfa alır;
  TMK kartlarının editör tarafından kendi kaydettiği sayfayla yeniden doğrulanması önerilir.
- Doğrulama: typecheck, lint, check:text, tüm testler (web 321 geçti/1 skip, i18n 14), üretim derlemesi; 375/768/1440
  px klavyeyle dört oyun, çalışma, kısmi deneme: 522 kontrol ve 75 axe taraması, 0 sorun, taşma 0
  (`apps/web/src/app/pratik/_kanit/`, 9 ekran x 3 genişlik). Ekran okuyucuyla elle deneme yapılmadı.
- Açık: editör onayı (Tarık ve ikinci editör), diğer 13 alan için kaynak, veri tabanı eşlemesi ve sözleşme
  (pratik-sozlesme.md), akademisyen özel destesi (FR-61 1.1 derse atama; özel deste oluşturma yok, YZ taslağı
  geçidi ve kredi kaydı gerekir), konu piktogramları (FR-57) yok.
## 7 Kasım 2026, on-yuz: Turkuaz Kampüs arayüzden çıktı, /tespit bağlantısı

Dal codex/on-yuz-kampus-cikar (ADR-0031). Yeni bağımlılık yok; contracts ve db değişmedi; `acikModuller` kümesine dokunulmadı.
- Kabuk: `rotalar.ts` modül listesinden `kampus` çıktı (altı sekme), `ModulGezinmesi.tsx` ve `kabuk.css` Kampüs sınıfları silindi.
- Ana sayfa: Kampüs bandının yerinde /tespit tanıtımı (`.ana-tespit`, kâğıt zemin, şerh çizgisi; ikinci renk yok).
  Alt bilgi "Ürün" listesine "Yazım kuralları ve iz denetleyicisi" bağlantısı; metinler `ortak.json`
  (`gezinme.tespit`, `anasayfa.tespit*`). Üst menüde modül sekmesi olarak eklenmedi.
- packages/ui: `--kz-color-kampus*` belirteçleri, `Etiket` ve `HalkaGrafik` `kampus` türleri ve CSS sınıfları
  kaldırıldı; token testi tek vurgu rengini zorlar. i18n testi `ortak.json`da Kampüs anahtarı kalmadığını zorlar.
- /fiyatlar: "Kampüs YZ özeti" ve "Poster taslağı" satırları çıktı; plan.md 4.4 güncellenene kadar test bu iki
  satırı `adr0031Kaldirilan` kümesiyle dışarıda tutar. `docs/tasarim/yon.md` renk tablosu güncellendi.
- Doğrulama: ui 31, i18n 14, web 185 geçti/1 skip; typecheck, lint, check:text, üretim derlemesi yeşil;
  17 sayfa x 375/768/1440 ekran görüntüsü yenilendi, axe 0 ihlal ve yatay taşma 0 (docs/tasarim/ekran/axe-sonuc.json).
- Açık: docs/istekler/on-yuz-kampus-temizligi.md (kimlik: takedown.ts, admin testi, hesap.json; mimar: şema ve
  sözleşme; odeme: ledger fiyatları; orkestra: plan.md 4.4, 12.2, 13.1; hukuk-uyum: `topluluk` belgesi ve metinler).

## 6 Kasım 2026, orkestra: Hetzner barındırma, Kampüs kapsam dışı, /tespit

Kullanıcı kararlarıyla ADR-0030 (Hetzner Cloud, AB konumu; staging hemen, üretimde kişisel veri KVKK m.9 aktarım dayanağı ve bildirim tamamlanmadan işlenmez) ve ADR-0031 (Turkuaz Kampüs kapsam dışı, /tespit 1.0 kapsamında) yazıldı; plan.md K-03, K-14, 0/6, 1, 5.5, 10.7, URL tablosu ve Dalga 2 satırı güncellendi.
/tespit PR #57 dört yeşil CI işiyle squash birleşti (00a7da2). Hetzner'da yalnız kulular-uretim-01 (CX23, Helsinki) var; Kazuist'e uygun değil, dokunulmadı.
Açık: kullanıcı staging sunucusunu açıp ~/Desktop/kazuist-staging.txt yazacak; hukuk-uyum aktarım envanteri ve metinler; mimar kampus sözleşme/şema temizliği; docs/istekler/yazma-tespit.md dört istek.

## 6 Kasım 2026, tespit: /tespit sayfası (yazım kuralları ve iz denetleyici)

Dal codex/tespit. Yeni bağımlılık yok; sözleşme (contracts, db) değişmedi.
- Sayfa `apps/web/src/app/tespit/`: bütün istemi kopyalayan düğme (navigator.clipboard, aria-live durum satırı, pano yoksa
  seçili textarea yedeği), `/tespit/yazim-kurallari.md` indirme ucu (ASCII dosya adı), kural setinin 11 bölüm ve 159
  madde olarak okunur gösterimi (her madde `#kural-<bölüm>-<sıra>` bağlantısı) ve tarayıcıda çalışan iz denetleyici.
- Tek kaynak `docs/tespit/yazim-kurallari.md`. `_veri/kurallar.json` onun ayrıştırılmış hâlidir; yeniden üretim
  `node apps/web/src/app/tespit/_veri/uret.ts`. Denetleyici kataloğu (`_veri/izler.ts`) her girdiyi kural numarasına ve
  kuralın metnindeki birebir terime bağlar; test ikisini karşılaştırır.
- Kural id'si `<bölüm>.<sıra>`; Bölüm 9'un ikinci listesi kaynakta 1'den başladığı için 9.7 ile 9.12 olarak numaralanır.
- Sunum: "yapay zekâ yazdı" ya da "%X yapay zekâ" yok; şiddete göre iz sayısı, 1000 sözcükte iz, ritim ölçümü (10.6) ve
  yanlış pozitif uyarısı (9.3, 9.4, 9.5). Metin sunucuya gitmez; test kaynakta ağ, depolama, log yolu olmadığını zorlar.
- check-text.mjs değişmedi ve devre dışı bırakılmadı: kural verisi taranan yollarda (content, packages/i18n) durmaz.
- Doğrulama: typecheck, lint, check:text, tüm workspace testleri (web 185 geçti/1 skip, i18n 13), üretim derlemesi;
  375/768/1440 px axe 0 ihlal, yatay taşma 0 (docs/tespit/ekran). Pano, yedek yol, indirme ve ağ isteği ölçümü Playwright ile.
- Açık: gezinme bağlantısı (on-yuz), site haritası ve indeksleme (seo), e2e listesi (kalite-guvenlik): docs/istekler/yazma-tespit.md.
  Ekran okuyucuyla elle deneme ve Word/Google Docs gibi dış araçlarla ilgili bir kayıt bu işin kapsamında değildir.

## 2 Kasım 2026, orkestra: bekleyen PR'ların birleştirilmesi

Kullanıcı 2 Kasım'da "hallet" diyerek açık PR'ların birleştirilmesini istedi. Her PR yalnız son HEAD'inde
dört CI işi (node, python, docker, gitleaks) completed/success iken birleştirildi.
- Squash: #55 (pypdf/minimatch, f3614a3), #53 (hukuki işaretler, 9459def), #54 (VPS paketi, b967e97).
- Merge commit (yığın ortak geçmişi korunsun diye): #43 (30457f3), #50 (7605f44), #51 (ca4e4d6), #52 (fd18cc4).
- İçerikleri birleşenlerde main'e girdiği için kapatıldı: #38, #41, #42 (#43'te); #47, #49 (#50'de); #48 (#51'de).
  Her birinin HEAD'i main atasıdır; #42'nin HEAD'i olan merge commit'in iki ebeveyni de main'dedir.
- Yığın güncellemelerinde yalnız DEVIR.md ve docs/ilerleme.md üst bölümleri çatıştı; iki taraf korundu.
  Her ara adayda yerel build, typecheck, lint, check:text ve workspace testleri geçti; son main ağacı #52
  HEAD'iyle (26c6e87) aynıdır: ledger168, web114/1 skip, db43, contracts127, worker-node47.
Açık PR kalmadı. ADR-0027/0028/0029 kabulleri PR açıklamalarındaki 27 Ekim kullanıcı onayına dayanır; bu
birleştirme canlı migration, canlı ödeme, hukuki yayım veya depo görünürlüğü değişikliği değildir. Dalga 1
kapısı 5/9 açık kalır (staging, gerçek sandbox akışı, bağlayıcıların staging çalışması, künye ve iki hukuki işaret).

## 2 Kasım 2026, orkestra: yeni bağımlılık açıkları (pypdf, minimatch)

2 Kasım'da GitHub Actions yeniden çalıştı; PR53 gitleaks işinin tarama adımı yeni ilanlarla düştü (sızıntı yok).
- pypdf 6.21.2: CVE-2026-119203/119204/119205/119207/119209, düzeltme 6.21.4. Alt sınır `pypdf>=6.21.4`,
  uv.lock 6.21.4. Python 143 geçti/3 skip.
- minimatch <11.0.1 (GHSA-g3hv-75wg-m249, orta): ESLint zinciri `minimatch@10` override ile 11.0.3.
  openapi-typescript 7.13.0 hâlâ @redocly/openapi-core 1.34.21 (minimatch 5) kullanır; o yol da 11.0.3'e
  zorlandı ve tek `require("minimatch")` satırı adlandırılmış dışa aktarıma `patches/` ile uyarlandı.
  Yamalı `match` doğru/yanlış örnekleri, contracts lint ve check:generated geçti. Yalnız geliştirme aracıdır.
Doğrulama: tarama.sh status0 (pnpm audit0, pip-audit0, gitleaks temiz, lisans yasak yok); typecheck, lint,
check:text, contracts:lint, build ve workspace testleri geçti. Kök kilit ve workspace dosyası orkestra yetkisiyle değişti.
## 2 Kasım 2026, orkestra: hukuki doğrulama işaretleri, iyzico yanıtı ve CI engeli

Yedi `[DOĞRULANACAK]` işaretinden dördü birincil kaynakla kapatıldı; metinler taslak kalır, yayım onayı verilmedi.
- topluluk: Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi m.4/1 altı ihlal türünü aynen sayar
  (yok.gov.tr/documents/documents/68fb63b8b2511.pdf; son değişiklik 28/8/2025 YÖK Genel Kurulu).
- cerezler: kvkk.gov.tr/Icerik/7353 güncel rehber sürümü "Temmuz 2025, KVKK Yayınları No: 69".
- yapay-zeka: m.50, 2 Ağustos 2026'dan beri uygulanır (digital-strategy.ec.europa.eu SSS, 24/7/2026 güncel);
  Tüzük (AB) 2026/1744 (8/7/2026, ABRG L 24/7/2026, yürürlük 27/7/2026) m.50/2 için dört aylık geçiş (gerekçe 38).
- on-bilgilendirme: ticaret.gov.tr hakem heyeti bilgilendirme metni, e-Devlet üzerinden TÜBİS başvurusu.
Beşinci işaret (cerezler tercih kaydı) koda göre kapatıldı: tercih çerezi ve dil çerezi yok; analitik etkin
olmadığı için tercih sorulmuyor. better-auth 1.7.11 ve passkey kaynağından okunan giriş doğrulama çerezleri
tabloya eklendi: state 300 sn (veri tabanı durum stratejisi), better-auth-passkey 300 sn, two_factor 600 sn;
trust_device arayüzde tetiklenmediği için yazılmadı. EN cookies özeti aynı gerçeğe çekildi.
Sürümler 2026-11-02.1. Açık kalan iki işaret: gizlilik VUK/TTK saklama süreleri ve iade-ve-kredi Abonelik
Yönetmeliği değişiklik kontrolü (mevzuat.gov.tr ve resmigazete.gov.tr okuma aracında robots ve ağ vekilinde
403; ikincil kaynakla kapatılmadı). Doğrulama: check:text 795 dosya, Prettier, contracts 118, web 88/1 skip geçti.

iyzico 31 Ekim 2026'da yanıtladı: sandbox hesabında abonelik özelliği etkinleştirildi. ADR-0029 yeni abonelik
satışını kapattığı için bu yalnız eski abonelik akışlarının sandbox testi içindir.

En üst aday PR52 (e4f0eca) Node 26.13 ile bulutta yeniden ölçüldü: typecheck, lint, check:text,
contracts:lint, build geçti; test i18n12, contracts127, ui31, casuist1, db43, ledger168, worker-node47,
ai-gateway67/2 skip, web114/1 skip; Python143/3 skip; enjeksiyon60. GitHub Actions run 40456390075 dahil
27 Ekim'den 2 Kasım gecesine kadar bütün koşular dört işte sıfır adımla failure verdi (hesap ödeme/harcama
kısıtı); kısıt 2 Kasım'da kalktı, birleştirme aşağıdaki orkestra bölümündedir.
## 27 Ekim 2026, on-yuz, ücretsiz kullanım ve fiyatlar (codex/ucretsiz-fiyatlar)

ADR-0029 onayına göre fiyatlar sayfası Ücretsiz/BYOK/Platform kredisi seçeneklerine geçti.
Tüm özelliklerin ücretsiz olduğu ve BYOK sağlayıcı faturasının kullanıcıya ait olduğu tr/en
sözlüklerde açık. Eski aylık/yıllık öğrenci, akademisyen ve kurumsal satış satırları kaldırıldı.
39/109/299 TL paketler ve işlem kredi tutarları değişmedi. Ledger, API veya eski haklar değiştirilmedi.
Mobilde beş sütun yerine semantik başlık/tanım listesi; tablet/masaüstünde tablo korunur.

Kanıt: plan4.2-4.4 eşliği mevcut5 test, i18n12 test, web/i18n typecheck, kapsam lint/format,
metin ve üretim build geçti. Üretim sunucusunda375/768/1440: HTTP200, axe0, yatay taşma0.
Üç ekran görüntüsü gözle incelendi; kanıt /tmp/kazuist-ucretsiz-fiyatlar-2026-10-27/.
Yeni mirroring test eklenmedi. GitHub CI hesap engeli açık; birleşmedi. Public/lisans değişmedi.

## 27 Ekim 2026, ücretsiz ürün ve açık kaynak önerisi

ADR-0029 ücretsiz bütün özellikler/BYOK ve yalnız isteğe bağlı platform YZ kredisi gelirini önerir. Public/Apache-2.0 ayrı açık onay bekler. Plan, UI, LICENSE ve görünürlük değişmedi. Mahremiyet kapsamı ve henüz incelenmemiş geçmiş Actions içerikleri docs/istekler/orkestra-acik-kaynak-oneri.md içinde; CI faturalandırma engeli nedeniyle birleştirme yapılmaz.

## 27 Ekim 2026, ödeme, D9 rezervasyon yükleme maliyeti

loadWallet rezervasyon tahsisleri için geçmişi her rezervasyonda yeniden taramak yerine tek indeks
kurar: O(E*R) hesap O(E+R) olur. 1800 kayıt ve 101 rezervasyonda tarihsel filtreyle aynı tahsis,
sıra, çoğul kayıt ve boş tahsis sonucu doğrulandı; PGlite geri yükleme testleriyle birlikte7test geçti.
Tam geçmiş hâlâ yüklenir. D9 kapanmadı: checkpoint/veri modeli ile wallet/ledger sayfalaması ayrı iştir.
İlk satış kapısı commitinin üretim web/worker derlemesi, lint, tip ve metin denetimleri geçti.
Yerel üretim sayfasında 375/768/1440 px görüntüleri incelendi; üç axe ölçümünde ihlal0, taşma0.
Kanıt: /tmp/kazuist-subscription-sales-ui/axe.json ve odeme-<genişlik>.png.

## 27 Ekim 2026, ödeme, ADR-0029 yeni abonelik satış kapısı

Yeni abonelik başlatma servis sınırında 409 subscription_sales_closed döner; sağlayıcıya,
replay veya veri tabanına erişmez. Fiyat API yalnız üç kredi paketini sunar. Eski abonelik
bağlantıları alıcı/sözleşme yüklemeden satışın kapalı olduğunu gösterir. Tarihsel fiyat
kataloğu, callback, yenileme, fesih, iade ve rol hakları korunur. Eski abonelik kurulumları
üretim bayrağı olmadan yalnız test fixture sınıfındadır; legacy senaryolar atlanmadı.
Defter167, web odeme sayfası ve gerçek admin handler9 test, ledger/web tip ve lint geçti.
Üretim derlemesi ve üç genişlik görsel/axe doğrulaması ayrıca sonuçlandırılacak.
D9 tüm geçmiş yükleme ve hareket listesinin sayfalamasız olması açık kalır.

## Orkestra iade entegrasyonu, 27 Ekim 2026

43 adayı5a532dc ile49adayıe857d6c, izole278dd78 üzerinde birleştirildi; bu yerel entegrasyon main değildir. İki store çatışması ödeme sahibi tarafından snapshot/deletionfalse ve iade akışları birlikte korunarak çözüldü. Root tip kontrolü, ledger165, web113/1skip, DB43, contracts127 ve worker47 testlerini geçirdi. Web/worker üretim derlemesi, kaynak çatışma dosyalarının lint/biçimi ve metin kontrolü geçti. Bağımsız denetçi son birleşik adayda25testi ve kendi PGlite finansal repro'sunu geçirdi; yeni kritik/yüksek/orta bulgu yok. Ödeme önceki kapsamında ayrıca154ledger/12HTTPtesti ve üretim build geçti. Dalga1kapısı5/9 kalır, ADR28 öneridir ve CI hesap engeli sürer. Canlı işlem veya üretim migration yok.

İade tutarı gerçek tahsilat ve kalan krediyle tavanlı/tüketici lehine yuvarlanır. Unknown sonuç otomatik yeniden gönderilmez. Manuel sonuç ödeme/kalem/defterle atomiktir. Açık hold varken chargeback409 ile güvenli durur. Fatura gerekliliği kalıcı audit'e yazılır; e-Arşiv entegratörü idempotency/requery olmadan otomatik fatura kurtarma tamamlanmış sayılmaz. PGlite/fake testleri gerçek sandbox veya O9 süreç çökmesi kanıtı değildir. Ücretsiz BYOK/özellik ve kredi tekgelir önerisi ayrıPR48/ADR29'da; public yapılmadı.

## 27 Ekim 2026, ödeme, silme iadesi yönetimi (codex/silme-iade-yonetimi)

ADR-0028 önerisinin beş admin ucu gerçek BillingService/PgBillingStore akışına bağlandı.
Karar, özgün tahsilat/kalan kredi kalemleri ve kısmi tutmalar tek transaction'da; sağlayıcı çağrısı
transaction dışında ve CAS ile tekil. Belirsiz sonuç otomatik yeniden gönderilmez; ayrı admin
kalem çözümü aktör/gerekçe/sağlayıcı referansıyla kaydedilir. Eski belirsizlik kuyruğu bu kalemleri dışlar.
İşlem anahtarı aktör/operasyon/hedef/gövdeye kalıcı bağlanır. Passkey/TOTP, strict body, rate,
private no-store ve audit aktörü gerçek guard/PGlite testinde sınandı.

Tutar BigInt ile tüketici lehine kuruşa yuvarlanır ve geçmiş iade maruziyetiyle sınırlanır.
Açık rezervasyon varken chargeback409 döner; iade tutmasının yanlış borç sayılması önlenir.
Önce sağlayıcı belirsizliği çözülür; başarılı kısmi iade sonrası chargeback yalnız harcanan payı borçlandırır.
Fatura gerekliliği ledger tamamlanırken kalıcı audit uyarısına yazılır. Mevcut e-Arşiv adaptöründe
idempotency/requery API'si olmadığı için crash sonrası otomatik fatura resend eklenmedi;
entegratör seçimi ve fatura outbox/kurtarma ayrı açık iştir. Finansal iade tamamlandı ifadesi
faturanın dış sağlayıcıda kesildiği iddiası değildir.

Yerel ledger154, billing route12, typecheck/lint/metin ve üretim build doğrulandı.
GitHub CI billing limiti açık; yeşil sayılmadı, birleşmedi. Canlı iade/migration/ağ işlemi yok.

## 27 Ekim 2026, mimar, silme iade sözleşmesi 1.4 (codex/mimar-silme-iade)

ADR-0028 ÖNERİ, Tarık onayı bekliyor. ADR-0027 dosyası değiştirilmedi; onay kaydı root43 dalındadır.
Migration0006 mevcut FK'leri korur; karar reason/key/hash ve orijinal paket başına immutable allocation
kalemi ekler. Tam tüketici lehine kuruş üst sınırı, gerçek tahsilat/kalan kredi/sahiplik ve diğer iade
riski DB'de doğrulanır. Karar ve kalem değişimleri aktör/gerekçeyle append-only audit'e girer.
Belirsiz kalem tamamlanmaz; başarılı payment kanıtı olmadan basarili olamaz. Tamamlanan talebin tutarı
başarılı kalem toplamıyla aynı olmalıdır. Audit TRUNCATE da engellenir.

Sözleşme iki GET/üç POST tanımlar; admin/passkey/TOTP, strict body, Idempotency-Key ve aktörün
sunucudan gelmesi şarttır. Route/partial ledger/sağlayıcı entegrasyonu ödeme ajanının ayrı işidir;
bu PR o uygulamayı tamamlandı saymaz. Ayrıntı docs/istekler/mimar-silme-iade-v1-4.md.

Kanıt: tetikleyicisiz karar geçişi kabulü kırmızıydı; yeni guard'larla dolu1.3 yükseltme8/8,
DB43/43, contracts127/127; tam Node636 geçti/3 ortam testi atlandı. Build/typecheck/lint,
OpenAPI lint ve check:text geçti. Audit TRUNCATE eklemesinden sonra DB43 yeniden geçti.
GitHub CI hesap/billing limiti orkestrada açık kapıdır; dört iş başarılı diye yazılmadı ve kör
workflow yeniden başlatılmadı. Canlı migration, sandbox veya canlı para iadesi yapılmadı.


## Orkestra son aday ölçümü, 27 Ekim 2026

Birleşik aday1a97d36 için izole kalite: JS569/Python143/enjeksiyon60 geçti, toplam6skip; tip/lint/biçim/metin/OpenAPI/build ve güvenlik taramaları temiz. Bağımsız76test ve gerçekPG18 SIGKILL kurtarma geçti. Ayrıntı docs/kalite/dalga-1.md üst bölümündedir. Kapı5/9 açık; staging/sandbox/bağlayıcı/hukuki hazırlık ve gerçekSMTP kabulü eksik. O9 yönetici iade işi ayrı dalda sürer, ADR28 öneridir. CI hesap engeli kalkmadı; hiçbir PR bu nedenle kapı atlanarak birleştirilmedi. Kullanıcının public sorusu görünürlük onayı sayılmadı; depo PRIVATE kalır. Ücretsiz özellik/BYOK ve isteğe bağlı platform kredisi modeli ayrı karar önerisinde hazırlanıyor.

## Orkestra CI hesap engeli, 27 Ekim 2026

GitHubActions run40405096283 sonHEAD50d0c15 için dört işi de2-3saniyede ve sıfır adımla failure yaptı. Jobannotation: recentaccountpaymentsfailed veya spendinglimit artırımı gerekiyor. Kullanıcıya https://github.com/settings/billing > Billing and licensing / Budgets and alerts > Actions hesabıadımı verildi; ödeme/kart/token değeri istenmedi. Kör tekrar veya kapıgevşetme yok. ADR27 onaylıdır, ancak43 sonHEAD dörtgreenolmadanbirleşmez. Yerel geliştirme/test ve O6/O9 işleri devameder.
## 27 Ekim 2026, kimlik: gerçek ödeme öncesi metin ve silinmiş hesapta sözleşme teslimi

`codex/checkout-metin`, birleşik aday 50d0c15 üstünde ayrı inceleme değişikliğidir; PR42 değiştirilmedi.
Ödeme ekranı yer tutucu yerine aynı yayımlanmış Türkçe kaynağın gövdesini ve kabul edilecek sürümünü
birlikte gösterir. Paket/abonelik başlığı kaynak metinden gelir. Gerçek oturum adı/e-postası ve seçili
ürünün alanları `orderFields`/`fillLegalDoc` üzerinden hazırlanır; geçmiş PDF yeniden üretilmez. Eksik
ad/soyadda tahminî alıcı yazılmaz. Taslak, boş künye, eksik alan, yanlış sürüm veya sözleşme türünde
metin ve ödeme kapalıdır. İçerik/tutar değişirse kutu onayları yeniden alınır. Tablo ve kod dahil gövdede
en az 12pt korunur. Teyit/cayma kutuları ve ürün adları i18n üzerinden gerçek metindir. Hukuki yayım
onayı verilmedi; mevcut canlı kaynaklar bu kapıyı aşmaz.

Sözleşme işi, genel `deleted_at` kontrolünden önce yalnız sipariş sahibi ve değişmez belge takımından
çözülür. Alıcı yalnız her iki snapshot'ın aynı ve geçerli `ALICI_EPOSTA` alanıdır; güncel kullanıcı
e-postasına veya başka bir varsayılana dönülmez. Böylece ödeme sonrası silinen hesapta sözleşme işi
atlanmaz. Diğer ödeme, takip ve kampanya bildirimleri silinmiş kullanıcıda hâlâ `no_user` ile atlanır;
dış push'a özel sözleşme içeriği gitmez. Eksik/bozuk/çelişen alıcıda gönderim ve teslim kaydı yoktur.

Kanıt: yer tutucu+yanlış başlık ve silinmiş hesapta atlanan sözleşme için önce kırmızı testler, sonra
yeşil regresyonlar. Web 111 geçti/1 mevcut skip; worker 47 geçti. İki uygulamanın typecheck ve üretim
derlemesi geçti; değişen kod ESLint, tam Prettier ve metin kontrolü temiz. Tarayıcıda yayımlanmış
sentetik fikstürle 375/768/1440px görüntü, WCAG2A/AA+2.1AA axe 0 ve gövde/tablo/kod alt sınırı 16px
(12pt) doğrulandı. Görünen üç sürüm fake checkout POST'uyla aynı; gerçek /odeme kapalı kaldı. Yerel
fikstür rotası kaldırıldı. Kanıt dizini: Codex visualizations/2026/10/25/
01a1736a-3c34-7d40-ae4e-8f8808e87e0c/checkout-metin. SMTP testleri taklittir; canlı gönderim yapılmadı.
CI hesap faturalama sınırı nedeniyle root tarafından bloklu bildirildi; yeniden çalıştırma tetiklenmedi.

## Orkestra, 27 Ekim 2026

Kullanıcı ADR-0027'yi açıkça onayladı. Kabul kaydı bu dalda işlendi; hukuki metin yayını ve canlı migration izni çıkarılmaz. PR44/45 dörder tamamlanmış yeşil CI işiyle main fef96e3'e alındı. Birleşik43 adayı main ile güncellendi; sonHEAD dört CI işi tamamlanmadan birleşmez. Eski38/41/42PR'ları aynı kapsamın kaynaklarıdır, birleşik43 sonrasında yinelenen değişiklik olarak kapatılacak.

O6gerçek ödemeöncesi metin gösterimi ve silinmiş kullanıcıya kalıcı sözleşme teslim yarışı kimlikte; O9iade taleplerinin yönetici kararı/ödeme akışı ödeme+mimarın ayrıworktree'lerinde sürüyor. YeniADR0028 öneri kalır. Güncel Dalga1kapısı5/9; sonraki dalga başlamadı. İyzico aktivasyon yanıtı, gerçekuygulama sandbox/staging, bağlayıcılar ve hukuki hazırlık açık.

## 26 Ekim 2026, kimlik: kalıcı PDF teslimi ve hesap silme tercihi (codex/belge-teslim)

O6 teknik hat tamamlandı: satın alma anındaki onaylı Türkçe sürüm ve alanlar snapshot olarak doğrulanır;
PDF yalnız hash ve tam belge takımı kontrolünden geçen kayıttan üretilir. Gömülü DejaVu Sans, 12 punto,
sayfa bölme ve sayfa numarası vardır. SMTP PDF eklerini taşır; sağlayıcının alıcıyı kabul etmesi ve
messageId dönmesi sonrasında teslim kaydı yazılır. Gönderim yoksa, kayıt eksikse veya bozuksa iş hata
verir; genel ödeme metniyle tamamlanmaz. Order kilidi paralel gönderimleri sıralar, kayıtlı teslim
tekrarı göndermez. SMTP kabulü ile DB commit atomik değildir; bu aralıktaki hata aynı Message-ID ile
tekrar denemeye yol açabilir, sağlayıcı seviyesinde tam bir kez teslim garantisi verilmez.

Kendi siparişinin kalıcı metinlerine erişim ucu private/no-store ve IDOR kontrollüdür. O9 silme ekranı
wallet API'den gerçek bakiye ve kullanılmamış paket toplamını gösterir. İade tercihi strict DELETE gövdesiyle
users.deletion_request_refund alanına silme durumu ile aynı güncellemede yazılır ve kancaya iletilir.
Gövdesiz eski istemcilerde varsayılan true. Ödeme ajanının atomik checkout ve günlük tercih kurtarma
entegrasyonu bu dalın bağımlılığıdır; ödeme dosyaları o ajanın commitlerinden alındı.

Doğrulama: web 92 geçti/1 mevcut skip, worker 43 geçti (SMTP alıcı kabulü/ID sınırları dahil), ledger 134 geçti; sonra eklenen onaylı alıntıyı
koruma testiyle belge hedefli 7 test geçti. Web ve worker üretim derlemesi, tipler ve değişen kod lint
kontrolü geçti. PDF iki sayfa Poppler ile render edilip gözle incelendi; metin çıkarımı Türkçe glifleri,
12.00pt alt sınırını ve gömülü fontu doğruladı. Silme ekranı 375/768/1440px, mock wallet ve iade opt-out
isteğiyle doğrulandı; yeni bölümün WCAG2A/AA ve 2.1AA axe sonucu 0. Yerel kanıtlar Codex
visualizations/2026/10/25/01a1736a-3c34-7d40-ae4e-8f8808e87e0c/belge-teslim dizinindedir.

Canlı gönderim yapılmadı. Hukuki taslak/yayım kapısı korunur; ADR-0027 ve hukuki yayım onayları hâlâ
beklenir. Root katkısı: worker direct PDF bağımlılıkları, font build kopyası ve Docker font yolu.
## Dalga 1, ödeme, checkout snapshot ve silme tercihi entegrasyonu, 2026-10-26

Durum: `codex/odeme-snapshot-deletion`; şema 0005/mimar `1b49422` ve snapshot helper/kimlik
`db10a07` bağımlılıkları dala birleştirildi. Ödeme uygulaması `47ce6c4` kimliğe iletildi.
Checkout önce kabul edilen metin sürümünü, gerçek tutarı ve alıcı alanlarını dondurur; draft,
eksik alan veya değişen sürüm sağlayıcı formu açılmadan reddedilir. Sunucu production context'i
snapshot factory olmadan checkout açmaz. Paket ön bilgi+mesafeli satış, abonelik ön bilgi+abonelik
takımı, kaynak ve dolu metin SHA-256 özetiyle saklanır. PDF/worker belge dosyalarına dokunulmadı.

`PgBillingStore.saveCheckout`: order, tüm consent satırları ve freezeOrderLegalDocuments aynı
transaction client'ıyla yazılır; hatada tamamı rollback olur. Özel snapshot satırı içerebilen SQL hata
detayları API/log hatasına taşınmaz. İdempotent checkout replay mevcut order sonucunu kullanır;
geçmiş belge güncel dosyadan üretilmez. Depo helper'ı runtime kullanıldığı için ledger `@kazuist/db`
bağımlılığı dev'den runtime'a alındı; yalnız ledger lock importer taşıması orkestra yetkisiyle yapıldı.

`onAccountDeletion(userId,{requestRefund?:boolean})`: false seçimi canlı abonelik iptalini korur,
iade talebi açmaz. Seçim verilmezse users.deletion_request_refund okunur (varsayılan true).
Günlük kurtarma false tercihli yalnız paket hesabını seçmez; canlı aboneliği varsa iptal eder.
Tercihin kullanıcı silme kaydıyla atomik yazılması kimlik ajanındadır.

Kanıt: önce snapshot takım kaydı ve rollback testleri 2 kırmızıydı. Son PGlite 6/6, web factory 2/2;
ana senaryolarla hedefli 20/20. Tam Node workspace 626 geçti, 3 ortam testi atlandı; typecheck,
lint ve check:text yeşil. Build ilk turda DB barrel'in migration URL çözümü nedeniyle kırıldı;
mimar c2f7b95 alt yol export'u ve ödeme 37ac0f6 import düzeltmesiyle yeniden build geçti.
Gerçek ödeme/ağ/sır çağrısı yok. O8 rapor/mutabakat işi orkestradadır.

## 25 Ekim 2026, güvenlik bağımlılık düzeltmesi (codex/guvenlik-bagimlilik)

O-09 tarama hataları artık kapıyı kapatır; CLI ikizleriyle kırmızı/yeşil regresyon kanıtı var. pypdf6.21.2,
setuptools84.2.1 ve optimum bağımlılığı kaldırılarak transformers5.16.1: gerçek all-extras pip-audit 0.
Python145 geçti/1 optional skip; küçük offline ONNX dinamik şekil testi yeşil. Akdeniz50belge eski/yeni
runtime PERSON440/440 eş; Hushmark402paragraf span1.0. GLiNER yeni-yığın tam export disk28 nedeniyle
geçmedi; yeni Torch vs mevcut ONNX20belge span1.0 (150span), skor fark2e-5. CI/final tam tarama ve bağımsız denetim bekleniyor, birleşmedi.
Kanıt ve açık işler: docs/istekler/kalite-bagimlilik.md. Eski model cache ve runtime kodu değişmedi.

## Orkestra güncel durum, 26 Ekim 2026

Main f41457d temiz; PR35/36/37/39/40 dört completed/success CI işi sonrası birleşti. Beş ADR onayı kaydedildi, plan düzeltildi, iyzico aktivasyon e-postası kayıtlı hesaptan26Ekim00:32 gönderildi ve Gönderilenler doğrulandı. Gerçek readonly sandbox raporuyla kimlik/kısmi iade eşlemesi düzeltildi; bağımsız O-N4 sayfalama açığı da kapandı.

PR38(schema/ADR27),41(checkout/deletion),42(PDF/delivery/UI) birleşik43adayında9c37234 tabanında toplandı. Root bütün workspace test/tip/lint/metin/build kontrollerini geçirdi; ledger144, DB35, contracts121, web94, worker43. Yeni esbuildyaması44 ayrıca adayda birleştirildi; son CI/bağımsız kalite beklenir. ADR27 onayı henüz yok; üretim migration ve hukuki yayım yapılmaz.

Bağımsız denetimin O6yer tutucu gösterim ve O9silme iadesi yönetimi kalanları için kimlik/ödeme/mimar ayrı worktree'lerde sürüyor. İade yönetimi yeni ADR28 önerisi gerektirir; kabul varsayılmaz. Güncel gate5/9; staging, gerçek uygulama sandbox, stagingbağlayıcıları ve hukuki hazırlık açık. Künye üç alanı henüz boş, değerler yazdırılmadı. Tek kullanıcı listesi docs/istekler/orkestra-onaylar-2026-10-25.md. Dalga2 başlamadı.

# Devir kaydı

En üstteki bölüm günceldir. Her ajan işini bitirince kendi bölümünü en üste ekler.

## Dalga 1, mimar, kalıcı belgeler ve ürün sürümleri (codex/mimar-kalici-belge), 2026-10-26

PR #38 açık, birleştirilmedi. Sözleşme/db 1.3.0; ADR-0027 öneri, Tarık onayı bekliyor.
Migration0005: ürün kodu tekilliği kalkar, birleşik sürüm tekilliği ve eski ürün UUID ilişkileri kalır;
ürün finansal sürüm alanları değişmez. Kalıcı sipariş belgeleri, SHA-256/sürüm/sahiplik denetimi,
değişmez sağlayıcı kabul kanıtı ve silmede kalıcı iade tercihi eklendi.

`@kazuist/db` freezeOrderLegalDocuments ve recordOrderLegalDocumentDelivery mevcut transaction client alır.
Entegrasyon ayrıntısı `docs/istekler/mimar-kalici-belge-entegrasyonu.md`.
Main PR35 D4 uyumu ve PR37 güvenlik/onay önkoşulları dala alındı; önceki ON CONFLICT(code)
uyumsuzluğu kapandı. Orkestra yetkisiyle ledger D4 testindeki elle DROP satırı IF EXISTS yapıldı;
aynı test 0004 ve 0005 üstünde çalışır.
Doğrulama: DB35/35, contracts121/121; tam Node616 geçti,3 ortam testi atlandı.
Build, tüm typecheck, lint, OpenAPI lint ve check:text geçti. Gerçek Docker/PostgreSQL ölçümü
PR CI'da; dört iş yeşil olmadan birleşmez. Canlı migration ve hukuki yayın yapılmadı.
ADR0027 onayı önceki beş ADR onayından ayrıdır.
## Orkestra, ADR onayları ve teknik açıklar, 26 Ekim 2026

Kullanıcı ADR-0021/0022/0023/0024/0026 kararlarını ve runbook'taki iyzico aktivasyon taslağının gönderimini açıkça onayladı. ADR durumları ve plan 4.5 eşit bölüşüm/gönüllü bildirim atıfları güncellendi. Hukuki yayım onayı verilmedi; künye kullanıcı tarafından doldurulacak. İyzico taslağı kayıtlı hesaptan 26 Ekim 00:32 gönderildi ve Gönderilenler doğrulandı; yanıt bekleniyor. GLiNER yeni export20belge span eşliği1.0; CI37 tam tarama0. Kanıt kalite-bagimlilik isteğinde.

PR #35 (8ee22e9) ve #37 (ef4479a), dörder tamamlanmış yeşil CI işiyle main'e alındı. PR #37 beş ADR kabulünü ve plan düzeltmesini de içerir. Teknik işler ayrı worktree'lerde sürüyor: mimarda kalıcı belge/fiyat sürümleme migration 0005 ve ADR-0027 önerisi, güvenlikte hata yutan tarama ve Python bağımlılık düzeltmeleri, kimlikte PDF/hesap silme entegrasyonu. Yeni ADR-0027 onaylanmış sayılmaz; üretim migration'ı uygulanmaz. Dalga 1 kapısı son ölçümde 5/9, sonraki dalga başlamadı. Biten PR'lar yalnız dört CI işi yeşil tamamlanınca birleştirilecek.
## Dalga 1, ödeme, süresi dolmuş rezervasyon property regresyonu, 2026-10-26

Seed `944090688`: 2 promosyon kredisi, iki ayrı 1 kredilik rezervasyon, 5 dakika ilerleme,
aynı ilk işlem anahtarını tekrar ayırma. `reserve` önce her iki süresi dolmuş tutmayı çözer,
sonra eski anahtarı `already_settled` ile reddeder. Yeni rezervasyon veya tüketim oluşmaz.
Eski property testinin reddedilen komutun en fazla bir transaction yazabileceği varsayımı yanlıştı.
Üretim defter kodu değişmedi. Test artık hata sonrasında yalnız süresi dolmuş eski rezervasyonların
çözümünü ve süresi dolmuş promosyonların temizliğini kabul eder; rezervasyon anahtarları daima tekildir.
Minimal dizi önce kırmızıydı (2 > 1); düzeltme sonrası tam ledger 128/128, typecheck ve test eslint temiz.
PR #35 mevcut yeşil head ile birleştirildi; bu test değişikliği ayrı PR'dadır.

## Dalga 1, ödeme, D3 ve D8 teknik kapanış, 2026-10-25

Durum: `codex/odeme-aciklar`, PR #35 açık; main `1ffbe56` tabanı. Plan 4 ve 9.
D3: fesih/iade istemci anahtarı kullanıcı+işlem bazında kalıcı `idempotency_keys` kaydına ve
hedef dahil gövde SHA-256 özetine bağlandı. Başarılı aynı istek özgün sonucu döndürür; farklı
hedef/mod/gerekçe 409. Çalışan aynı istek 409 verir, tamamlanınca tekrar özgün sonucu alır.
PostgreSQL'de özel havuz oturumunda advisory lock işlem süresince tutulur; süreç ölünce PG
kilidi bırakır, aynı gövdeli sahipsiz pending kayıt iş akışının mevcut iade/fesih korumalarıyla
sürdürülür. Hata sonrası gövde bağı kaybolmaz. Havuzda defter/iş sorguları için bağlantı ayrılır.
Kaynak: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS

D8: `/v1/coupons/redeem`, `/v1/admin/chargebacks`, `/v1/admin/price-changes` gerçek servise bağlı.
Admin işlemlerinde yönetici rolü+passkey+TOTP, actor denetim kaydı, hız sınırı, strict zod ve
kalıcı istek anahtarı vardır. Kupon mevcut defter idempotency ve tüketim limitiyle işler.
D4 ikinci migration isteği `docs/istekler/odeme-d4-urun-fiyat-surumu.md`; DB/contracts değişmedi.
Mimar 0005 öncesinde ödeme uyumu bu PR'da: katalog `(code,price_table_id)` çatışma anahtarını kullanır,
aynı sürümün fiyat/kredi/işlem içerik değişimini reddeder; eski order/sub product UUID'si korunur,
yeni sipariş işlem tarihindeki sürümü seçer. İlk abonelik ürünü siparişten taşınır; planRef sürüm bazlıdır.
D4 önce iki yeni test kırmızıydı; son odaklı test 23/23 ve ledger typecheck geçti.
0005 ve hesap silme tercihi/PDF snapshot bağlantıları sonraki ayrı entegrasyondadır.

Kanıt: önce D3 hedefli regresyon 2 başarısız/14; D8 route henüz yokken import hatası.
Düzeltme sonrası odaklı memory 14/14, PGlite 7/7, gerçek guard+servis route 2/2 geçti.
Sahipsiz pending, ayrı depo örnekleri, replay, gövde çatışması, havuz kapasitesi ve kilit bırakma sınandı.
Tam test turu (son iki lock recovery testi öncesi) 601 geçti, 3 ortam testi atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti. Son lock değişikliğinde
ledger typecheck ve küçük hedefli testler yeniden geçti. Disk sınırı nedeniyle yeni büyük build koşulmadı.
Gerçek PostgreSQL session termination testi yerelde yapılmadı; pool yolu protokol taklidi/PGlite ile sınandı.
O8 gerçek sağlayıcı rapor çağrısı orkestradadır; sır veya ağ ödeme çağrısı yapılmadı.
PDF/sözleşme ve worker notice dosyalarına dokunulmadı. Tarık'tan yeni adım gerekmiyor.

## Orkestra devralma ve Dalga 1 yeniden ölçümü, 25 Ekim 2026

Devir alındı. Önceki iki ajanın günlükleri kullanım sınırında durduklarını gösterdi; mimarın kaydedilmemiş
çalışması korunarak tamamlandı. PR #30, #31, #33 ve #32 dörder tamamlanmış yeşil CI işiyle squash
birleştirildi. Son ürün main `219b903`; denetlenen birleşik aday `4457292` ile ürün kodu farkı yok.
CI kanıtı: https://github.com/tialkan/kazuistcom/actions/runs/40202875693.
Son main 219b903 push CI: https://github.com/tialkan/kazuistcom/actions/runs/40203467801, dört iş başarı.

- İki ana iş tamam: ödeme üçüncü denetim ve cevap şekli fikstürleri (#30), sözleşme 1.2/migration 0004 (#31).
- Ek düzeltmeler: teknik iyzico hatasında incelemenin korunması, paket kredili silinmiş hesap kurtarma,
  abonelik onaylarının gerçek form/servis kaydı (#33); ayrıntılı ödeme e-postası, yönetim iade uçları ve
  yalnız genel metin kullanan dış push kanalları (#32).
- Bağımsız son denetim: defter 120, form 3, bildirim 16, yönetici iade yetkisi 8; toplam 147 test geçti.
  Kalite, aynı kontroller ve enjeksiyon 60 ile 207 test doğruladı. D6 migration korumaları 27 testle teyitli.
- Güncel kapı `docs/kalite/dalga-1.md`: 5/9 geçti. Staging, gerçek uygulama sandbox kabulü, staging
  bağlayıcıları ve hukuki hazırlık açık; Dalga 2 başlamadı.
- Ödeme denetimindeki kritik/yüksek bulgular kapalı; orta O6/O8/O9, düşük D3/D4/D8/D9/D-N2/D-N7 sürüyor.
  Bu sayım bağımlılık güvenliğini kapsamaz: Python bulguları ve tarama hata kodu O-07/O-09 olarak açık.
- Sandbox fikstürü gerçek uygulama uçtan uca kabulü değildir. Abonelik 100001 cevabının sebebi kesin değil;
  resmî aktivasyon/durum teyidi e-postası için gönderilmemiş taslak runbook'ta hazır.
- Güncel tek kullanıcı listesi `docs/istekler/orkestra-onaylar-2026-10-25.md`: beş ADR, sandbox hesap adımı,
  eksik künye. `~/Desktop/kazuist-kunye.txt` boş alanlı şablon olarak izin 600 ile hazırlandı.
- ADR onayı alınmış sayılmadı; plan, sürüm etiketi, DNS, canlı ödeme, canlı veri ve App Store değiştirilmedi.
  Eski worktree'ler korundu. Aşağıdaki ajan kayıtlarındaki eski PR durumları tarihsel kayıttır.

## Dalga 1, kalite-guvenlik, yeniden ölçüm, 2026-10-25

Dalga 1 kapısı kapanmadı: 5/9 geçti. Güncel kanıt ve dokuz hüküm `docs/kalite/dalga-1.md` en üstünde; 22 Ekim ölçümü tarihsel korundu. Son ürün main219b903; aynı ürün ağacındaki birleşik4457292 CI40202875693 dört işte yeşil, HTTP72/E2E108 geçti, yükleme20 atlandı. Birleşik 4457292 yerel kalite kontrolü ledger120, notify16, web gate3/admin8 ve enjeksiyon60 geçti. Gerçek staging, uygulama uçtan uca sandbox, beş bağlayıcının staging çalışması ve hukuki hazırlık açık. O-07 Python runtime/extra bağımlılık bulguları ile O-09 tarama exit-kodu açığı raporlandı; yeşil CI bu açıklıkları kapatmaz. Yeni ürün kodu değiştirilmedi.

## Dalga 1, ödeme, dördüncü denetim düzeltmeleri, 2026-10-25

Durum: `codex/odeme-denetim4`, PR açılacak; birleştirme orkestrada ve yeşil CI sonrasında.
Plan 4.5/12 ve 9: Y-N7 için yalnız belgelenmiş 10051/10005 kart retleri siparişi kapatır;
teknik/bilinmeyen `status: failure` sipariş ve kupon durumunu korur, günlük yeniden sorgu hata alarmı üretir.
5122/5124 ödenmemiş token davranışı korundu. Resmî kaynak: https://docs.iyzico.com/ek-bilgiler/hata-kodlari
(2026-10-25 doğrulandı; hata kodu aralığına genelleme yok).
O9: canlı aboneliği olmayan, kullanılmamış paket kredili silinmiş kullanıcı da kurtarma işine alınır;
eski talepler korunur, eşzamanlı yeniden denemeler deterministik UUID ve PK ile tek iade talebi açar.
O5: abonelikte ayrı cayma kutusu API gövdesine taşınır ve sunucuda zorunlu doğrulanır; yıllık taahhüt,
`content/hukuki/tr/abonelik.md` içindeki ayrılmaz bölüm olduğu için aynı metnin sürümüyle gönderilir,
sunucuda doğrulanır ve `yillik_taahhutname` onayına yazılır. Yeni hukuki metin veya sözleşme alanı eklenmedi.
Kırmızı kanıt: önce Y-N7/O9 regresyonları 2 başarısız / 118 test; düzeltme sonrası 119/119 ledger testi geçti.
Son ek 10005 testi dahil ledger 120/120 geçti; PGlite yeniden kontrolü 4/4 geçti.
`pnpm test`: 588 geçti, 3 ortam gerektiren test atlandı (son ek 10005 testi öncesi).
`pnpm typecheck`, `pnpm lint`, `pnpm check:text`, `pnpm build` geçti; web ödeme gate 3/3.
Gerçek sandbox çağrısı, sır erişimi veya canlı işlem yapılmadı. O6 hukuki metin/PDF/e-posta işi ve önceki
diğer bulgular bu kapsamda kapandı sayılmadı. ADR/hukuki yayın onayı orkestranın birleşik listesinde kalır.

## Dalga 1, mimar, ikinci istek turu (dalga-1/mimar/istekler-2), 2026-10-25

Durum: PR açık, birleştirilmedi. Sözleşme v1.2; ADR-0026 ve güncellenen ADR-0024 "Önerildi, Tarık onayı bekliyor".
Karar tablosu: docs/istekler/README.md (ikinci tur).

Doğrulama (güncel main ve PR #30 ile): `pnpm test` 585 geçti, 3 ortam gerektiren test atlandı;
`pnpm typecheck`, `pnpm lint`, `pnpm contracts:lint`, `pnpm check:text`, `pnpm build` geçti.
Python `uv run --project services/worker-py pytest services/worker-py/tests -q`: 86 geçti.
Migration testleri 27/27; v1.1 verisinden yükseltme ve defter/parça tetikleyicileri dahil.
Dal commitleri `gitleaks git --redact --log-opts='origin/main..HEAD'` ile temiz.
IFN gövdesi PR #30 ile eşlendi (`paymentId`, `fraudStatus`); `orders.status` CHECK eklenmedi.
Gerçek servisli Docker ölçümü CI'da yapılacak; yerel ortamda Docker yok.


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

Y-N8: ödeme ayrıntısı yalnız e-postada; Web Push ve APNs genel metni kullanır. Önce kırmızı
regression tutar/tarih sızıntısını üretti, düzeltmeden sonra iki push ve e-posta aynı testte doğrulandı.
Worker 34 test, typecheck, build, ESLint ve check:text geçti.

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
