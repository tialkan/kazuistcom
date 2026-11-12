# Yayın öncesi denetim ve iş devri (12 Kasım 2026)

Bu belge, `main` (bfefdb6) üzerinde yapılan tam denetimin sonucudur ve alt ajanlara devredilecek işleri
sıralar. Denetim üç salt okunur ajanla (ön yüz, işçiler ve paketler, altyapı ve belgeler) ve yerel
`typecheck`, `lint`, `test`, `build` çalıştırmasıyla yapıldı. Her ajanın tam okuduğu ve yalnız örneklediği
yerler raporlarında yazılıdır; okunmayan başlıca yerler 8. bölümdedir.

Okuma sırası: önce 1. bölümdeki kararlar (Tarık), sonra 3. bölümdeki iş paketleri (ajanlar).

## 0. Özet

- Kod derleniyor ve testler geçiyor. Yayını engelleyen şey kod kalitesi değil; eksik altyapı, taslak hukuki
  metinler, arama için eksik iki parça ve henüz verilmemiş birkaç karardır.
- Site dili değişmez: Next.js (TypeScript) ve Python kalır. PHP ya da Rust'a geçmek çalışan ve test edilmiş
  kodu baştan yazmak demektir; darboğaz dil değil, veri tabanı ve YZ çağrılarıdır.
- Önerilen yol iki fazdır. Faz 1 kişisel veri tutmaz (tanıtım, /tespit, /rehberler, /fiyatlar, hukuki
  metinler). Faz 2 hesap, ödeme, arama, Pratik, Yazma ve Atıf Ağı'nı açar ve KVKK m.9 dayanağına bağlıdır.

## 1. Tarık'ın vermesi gereken kararlar

Ajanlar bu kararlar olmadan ilgili paketi bitiremez. Her biri bir ADR'ye bağlanır.

| # | Karar | Neden gerekli | Bağlı paket |
|---|---|---|---|
| T1 | Staging'siz, tek sunuculu, fazlı yayın (ADR-0033) | ADR-0030, plan 5.4, 5.5, 14 ve beş runbook iki sunucu ve staging varsayıyor | P1, P2 |
| T2 | Faz 1'de neler açık | `/giris`, `/kayit`, `/api/auth`, KVKK başvuru formu ve IP tutan hız sınırı kişisel veri işler; ADR-0030 bunu m.9 dayanağı olmadan yasaklıyor | P3, P5 |
| T3 | Görsellerde YZ kullanımı (ADR-0034) | plan 12 madde 7 avatar ve Kalemcik için "tek çizerden, YZ görseli yasak" diyor; Midjourney isteğiyle çelişir | P4 |
| T4 | Karar metinleri yurt dışı sunucuda işlenebilir mi | ADR-0011 ve K-11 "anonimleştirme Türkiye'deki sunucuda" diyor; ADR-0030 bunu ele almıyor | P9 |
| T5 | NER modeli olmadan anonimleştirme yayına açılır mı | Üretim imajı NER kurmuyor; kararlar yalnız kural katmanıyla maskelenip servis edilir | P9 |
| T6 | Kaynak onayları | `docs/kaynaklar/*.md` yedi dosyada `tarik_onayi: bekliyor`; üretimde hepsi kapalı. KVKK ve Rekabet'te robots.txt yokluğu yorumu ve EUR-Lex için CELLAR ucu açık kabul ister | P9 |
| T7 | iyzico alıcı bilgisi | Sabit yer tutucu kimlik numarası ve adres gidiyor (`apps/web/src/server/billing/handlers.ts:81-91`) | P8 |
| T8 | Abonelik uçları kapatılsın mı | ADR-0029 tek geliri kredi sayıyor; abonelik uçları açık | P8 |
| T9 | E-posta sağlayıcısı, e-Arşiv entegratörü, yedek deposu | `docs/kvkk/aktarim.md:22` boş; yedek aynı sunucuda kalamaz | P2, P7, P8 |
| T10 | `/eski` arşivindeki gmail adresi ve GitHub bağlantıları | Künyeyle çelişiyor; depo özelse bağlantı kırık | P3 |
| T11 | Kanıt ekran görüntüleri depoda kalsın mı | Uygulama kaynağında 29 MB, `docs/tasarim` altında birkaç MB'lık dosyalar | P2 |

Tarık'tan ayrıca gereken eylemler (karar değil): Hetzner sunucusu ve erişim bilgisi
(`~/Desktop/kazuist-uretim.txt`), Cloudflare DNS onayı, hukuki metinlerdeki boş alanlar (VKN, vergi dairesi,
KEP, marka durumu), hukuki yayım onayı, Pratik kartları için editör onayı, KVKK m.9 aktarım dayanağı ve
Hetzner veri işleme sözleşmesi, YZ anahtarları (yalnız dosya yolu).

## 2. Bu denetimde düzeltilenler

Hepsi doğrulandı: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:text`, `pnpm build` ve
`uv run pytest` (235 geçti, 3 atlandı) temiz.

| Dosya | Düzeltme |
|---|---|
| `apps/worker-node/src/kalemcik/gunluk.ts` | Günlük iş gece 00.00'da çalışıyordu, hatırlatmalar 08.00'de vadeli olduğu için hiç gönderilmiyordu. İş artık İstanbul saatiyle 08.00'e kuruluyor. |
| `apps/worker-node/src/runner.ts` | Hata veren bir `tick` kuyruğun tamamını durduruyordu; artık yalnız kayda geçiyor. |
| `apps/worker-node/src/kalemcik/__tests__/kalemcik.test.ts` | Rastgele kırılan sıralama karşılaştırması sıradan bağımsız yapıldı. |
| `packages/ai-gateway/src/adapters/sse.ts` | Akış erken bitince sağlayıcı bağlantısı açık kalıyordu; artık kapatılıyor. |
| `packages/casuist/src/sql.ts` | Atıf sayısı reddedilmiş ve düşük güvenli atıfları da sayıyordu; yayın eşiği uygulandı. |
| `services/worker-py/connectors/openalex.py` | DOI küçük harfe çevrilmiyordu; aynı eser iki kayıt olabiliyordu. |
| `apps/web/src/app/yazma/dergiler/[slug]/page.tsx` | Aynı sorgu istek başına iki kez çalışıyordu; `cache` ile teke indi. |
| `apps/web/src/app/(kabuk)/fiyatlar/fiyatlar.test.ts` | Ölü `adr0031Kaldirilan` kümesi silindi. |
| `apps/web/src/app/(casuist)/_bilesen/Dugum.tsx` | Kullanılmayan `hreflang` eşlemesi silindi. |
| `packages/i18n/tr/ortak.json` | Kesme işareti dosyanın geri kalanıyla aynı yapıldı. |
| `.github/workflows/ci.yml` | Python işi kilit dosyasına uymuyordu; `uv sync --frozen`. |
| `tests/security/tarama/tarama.sh` | gitleaks çıktısı her dizinde üzerine yazılıyordu. |
| `package.json` | `engines.node` 26 yapıldı; CLAUDE.md'de geçen `pnpm e2e` betiği eklendi. |
| Yorumlar | `tests/e2e/playwright.config.ts`, `apps/web/src/app/yazma/_veri/uret.ts`, `services/worker-py/pyproject.toml` içindeki yanlış yorumlar düzeltildi. |

Yerel ortamda ayrıca eski `.next` önbelleği ve bozuk `apps/web/node_modules` temizlendi (depoya etkisi yok).

Bilerek dokunulmayan: "yakında" düzeneği (`acikModuller`, `ModulBagi`). Şu an altı modül de açık olduğu için
ölü görünüyor ama Faz 1'de modülleri kapatmak için gerekecek (P3).

## 3. İş paketleri

Aynı anda en fazla üç ya da dört ajan çalışır. Her paket kendi dalında yapılır, CLAUDE.md'deki bitti tanımına
ve rapor biçimine uyar. `packages/contracts` ve `packages/db` yalnız mimar ve ADR ile değişir.

### Sıra

1. P1 (mimar) ve P4'ün hazırlık kısmı, T1 ile T3 kararlarından hemen sonra.
2. P2 (altyapi), P3 (on-yuz), P5 (hukuk-uyum), P6 (seo) birlikte. Faz 1 bunlarla çıkar.
3. P10 (kalite-guvenlik) Faz 1 kapısı.
4. P7, P8, P9, P11 Faz 2 için.

### P1. mimar: kararların yazımı ve sözleşme temizliği

1. ADR-0033 (tek sunucu, staging'siz, fazlı yayın) ve ADR-0034 (görsel üretimi); ADR-0002, 0003, 0014, 0016
   ve `docs/adr/README.md:8,9,20,22` durum satırlarına "ADR-0030/0031/0032 ile değişti" notu.
2. `docs/sahiplik.md`: `:33` kampus satırı pasif, `:47` örnek, `{tr,en}` desenleri `tr`, yazma satırına
   `apps/web/src/app/tespit/**`, `docs/tespit/**` ve yazma API yolları, eksik `hesap.json`,
   `kaydettiklerim.json`, `tespit.json`, `kaydettiklerim/**`.
3. Ajan tanımları: `.claude/agents/seo.md:3,13` (hreflang), `on-yuz.md:3,12` (/en), `hukuk-uyum.md:12`
   (İngilizce sürüm), `ios.md:12` (Kampüs sekmesi), `kampus.md` (pasif notu). plan.md Ek A kopyaları
   `plan.md:1440,1450`.
4. İş kuyruğu (`packages/db/src/jobs.ts`): `completeJobSql` ve `failJobSql` `locked_by` denetlemiyor;
   `releaseStaleJobsSql` deneme sınırına bakmıyor; kalp atışı yok (15 dakikayı aşan iş çift çalışır); biten
   işleri silen kod yok; günlük işler her dağıtımda yeniden kuyruğa giriyor.
5. İşleyicisi olmayan iş türleri: `ingest.parse`, `embed.chunks`, `docx.validate`, `kampus.summarize`,
   `kampus.poster`, `live.fetch`. `jobPayloadSchemas` hiç kullanılmıyor.
6. OpenAPI sapması: rotası olmayan 11 yol ve 11 `/v1/kampus/*` yolu (`openapi.yaml:1078-1326`); OpenAPI'de
   olmayan dört rota (`/v1/templates/check`, `/v1/templates/rules/{id}`, `/v1/writing-projects/ayarlar`,
   `/auth/step-up/confirm`); sözleşmede olup uygulanmayan 13 zod şeması.
7. ADR-0031 ve ADR-0032 artıkları: `packages/db/src/schema/kampus.ts` (8 tablo), `contracts` içindeki
   Kampüs alanları ve bildirim türleri, `contracts/src/legal.ts:19,28,30,37` (`en`, `alternate`, `/legal/`).
8. Atıf ağı şeması (`works.work_key`, `work_citations`; istek `docs/istekler/atif-agi-sema.md`) ve eksik
   dizinler: `replace(esas_no,' ','')` ifade dizini, `sources_raw.record_id`.
9. Hiç başvurulmayan tablolar: `card_versions`, `eval_runs`, `exam_attempts`, `guide_progress`,
   `iap_transactions`, `institution_profiles`, `live_cache`, `norm_mappings`, `provider_costs`.
10. `.env.example`: kodda okunup listede olmayan 14 değişken (`KAZUIST_EMBED_*`, `KAZUIST_ARAMA_*`,
    `KAZUIST_FIKSTUR_URETIMDE`, `YAZMA_YZ`, `PRATIK_ONIZLEME`, `LEGAL_PDF_FONT_PATH`, `KAZUIST_SOURCES_DIR`,
    `KAZUIST_CITATIONS_SCOPE`, `KAZUIST_ANTHROPIC_KEY_FILE`, `ANTHROPIC_BASE_URL`); kodda okunmayan yer
    tutucuların işaretlenmesi; `:55` "endpoint in Turkey" ve `:13,79` staging anlatımı.
11. `docs/istekler/` (71 dosya): yerine gelmiş ve geçersiz isteklerin kapatılması; `README.md` karar
    tablolarının güncellenmesi.

### P2. altyapi: tek sunucuda üretim kurulumu

Ön koşul: T1, sunucu ve erişim dosyası. DNS değişikliği Tarık'ın açık onayıyla.

1. arm64 ya da çok mimarili imaj derlemesi ve GHCR'ye itme iş akışı (`ci.yml:8-9` yalnız `contents: read`).
   Sunucuda derleme yapılmaz, imaj çekilir.
2. Üretim compose ya da Coolify tanımı (şu an yalnız `infra/docker-compose.dev.yml` var): postgres, valkey,
   web, işçiler, bakım sayfası, bellek sınırları, birimler.
3. Dağıtım iş akışı: migration, sonra web ve işçiler, sonra `/api/version` denetimi; elle tetikleme ve onay.
4. Sağlık denetimi Faz 1'de 503 döner: `apps/web/src/server/env.ts:5-13` `S3_ENDPOINT` ve `S3_BUCKET`
   istiyor ama bunları okuyan kod yok. Faz bazlı kritik liste gerekir.
5. Yedek: `docs/runbook/yedek.md` ikinci sunucu varsayıyor. Sunucu dışı depo, betikler ve geri yükleme testi.
6. İzleme: GlitchTip, Uptime Kuma, Umami kurulu değil ve kodda SDK yok. Dış erişilebilirlik denetimi aynı
   sunucuda olmamalı; 8 GB bütçesi hesaplanmalı.
7. Runbook'lar (`coolify.md`, `dagitim.md`, `vps-secimi.md`, `dns-yedek.md`, `geri-alma.md`) Hetzner ve tek
   sunucuya göre yeniden yazılır. `docs/runbook/` altında DNS yedeği yok.
8. Dockerfile'lar: `infra/docker/worker-py/Dockerfile:16` NER ekini kurmuyor (T5); `:25-30` ham arşiv dizini
   için yazma izni ve birim yok; `worker-node` ve `infra/maintenance` imajlarında sağlık denetimi yok;
   `infra/docker/web/Dockerfile:15-18` kaynakları kurulumdan önce kopyalıyor (önbellek her seferinde bozulur);
   taban imajlar yama sürümüne sabitli değil; Dependabot ya da Renovate yok.
9. CI: `ci.yml:152-158` imajlara `GIT_COMMIT` ve `APP_VERSION` verilmiyor; gitleaks geçmişi iki kez tarıyor;
   `docker build` katman önbelleği kullanmıyor; Python için lint ve tip denetimi yok.
10. `infra/lighthouse/lighthouserc.json:9,16-20`: erişilebilirlik, en iyi uygulamalar ve SEO için eşik yok;
    `:4` adres listesinde `/tespit` ve `/rehberler` yok.
11. `.dockerignore`: `apps/web/src/app/{atif-agi,pratik,rehberler}/_kanit/` (29 MB) her derlemeye giriyor.
12. `.claude/launch.json` izlenmiyor; gizli değer içermiyor, depoya eklenmesi önerilir.
13. İstek başına işleme: `apps/web/src/app/layout.tsx:20` `connection()` bütün sayfaları dinamik yapıyor.
    Statik sayfalar için önbellek seçeneği değerlendirilir.

### P3. on-yuz: Faz 1 görünümü ve tasarım tutarlılığı

1. Faz 1 için `apps/web/src/app/(kabuk)/_kabuk/rotalar.ts:21` `acikModuller` daraltılır (T2); kapalı
   modüller "yakında" görünür.
2. Ana sayfadaki yer tutucu künyeler (`apps/web/src/app/page.tsx:63,77,83`, `ortak.json:94`) doğrulanmış
   gerçek bir örnekle değişir.
3. Topluluk kuralları bağlantısı (`rotalar.ts:41`, `ortak.json:71`) kalkar; P5 ile aynı PR'da.
4. Kabuk "Hedefim" alanı (`Kabuk.tsx:28-34`) herkese sabit metin gösteriyor; giriş ve çıkış bağlantısı yok.
5. Hata ve yükleme durumları: hiçbir `loading.tsx`, `error.tsx`, `global-error.tsx` yok.
6. Başlık şablonu: sayfalar `| Kazuist` ekini elle yazıyor, hesap ve ödeme sayfaları yazmıyor.
7. İstemci paketi: `ModulGezinmesi.tsx` sözlüğün tamamını her sayfaya taşıyor; `checkout-step.tsx:9` sunucu
   bileşenini istemciye çekiyor.
8. Yinelenen yardımcılar: `doldur`, `tarihTr`, `sayiTr` altı modülde ayrı yazılmış; `packages/i18n`'e taşınır.
9. i18n dışındaki metinler: `fiyatlar.ts:9-48` (ayrıca `@kazuist/ledger` ile ikinci fiyat kaynağı),
   `kaydettiklerim/page.tsx:31-33`, `pratik/_alan/hmgs-alanlari.ts`.
10. Kullanılmayan 20 i18n anahtarı, iki CSS sınıfı (`casuist.css:308`, `yazma.module.css:266`),
    `IletisimKutusu` ve iki belirteç (`--kz-radius-lg`, `--kz-shadow-1`); satır içi stiller
    (`(odeme)/odeme/page.tsx:26,91`, `checkout-step.tsx`, `Kalemcik.tsx`); belirteç dışı tek renk
    (`packages/ui/src/components.css:231`).
11. `/eski` arşivi (T10) ve `(odeme)/odeme/page.tsx` içindeki ölü dallar (`:48,69,75,82`).
12. Faz 2 açılınca "yakında" düzeneği tümüyle silinir (`ModulBagi`, `OrnekSoru`, `Bulunamadi`, `kabuk.css`).

### P4. on-yuz: görsel varlıklar (Midjourney)

Ön koşul: T3. Depoda favicon, simge, OpenGraph görseli ve avatar yok.

Çalışma biçimi: alt ajanların tarayıcı aracı yoktur ve hiçbir ajan parola giremez. Tarık tarayıcı panelinde
Midjourney'e kendisi giriş yapar. on-yuz ajanı her varlık için istem, boyut ve kabul ölçütünü
`docs/tasarim/gorsel-istemleri.md` dosyasına yazar; üretim ana oturumda o tarayıcı oturumuyla ya da Tarık
tarafından yapılır. Midjourney'in kullanım koşullarının otomatik araçla üretime izin verip vermediği
üretimden önce doğrulanmalıdır; izin yoksa istemleri Tarık yapıştırır. Simge ve favicon gibi küçük, keskin
kenarlı varlıklar için elde vektör çizim daha uygundur; Midjourney çıktısı vektör değildir.

| Varlık | Yol | Boyut |
|---|---|---|
| Favicon | `apps/web/src/app/favicon.ico` | 16, 32, 48 px |
| SVG simge | `apps/web/src/app/icon.svg` | vektör, kare |
| Apple simgesi | `apps/web/src/app/apple-icon.png` | 180 x 180 |
| Manifest simgeleri | `apps/web/public/icon-192.png`, `icon-512.png`, `app/manifest.ts` | 192 ve 512 px |
| OpenGraph kartı | `apps/web/src/app/opengraph-image.png` | 1200 x 630 |
| Meslek avatarları | `apps/web/public/avatar/<id>-{a,b,n}` | 8 meslek, 3 görünüm, 24 dosya; en az 108 px |
| Kalemcik yüzleri | şimdilik kodla çizili (`KalemcikYuzu.tsx`) | 4 ifade |
| Kart piktogramları | şimdilik kodla çizili (`Isaretler.tsx`) | 20 x 20 |

Kabul: tek bir görsel dil, açık ve koyu zeminde okunurluk, belirteçlerdeki renklerle uyum, dosya boyutu
sınırı, her görsel için kaynak ve istem kaydı.

### P5. hukuk-uyum: metinler ve KVKK

1. 15 hukuki metnin tamamı `status: taslak`; üretimde beşi eski Casuist metnine düşüyor, beşi "hazırlanıyor"
   gösteriyor. Boş alanlar: `uyari.md`, `aydinlatma.md`, `basvuru.md`, `erisilebilirlik.md`, `gizlilik.md`.
   Faz 1 için en az uyarı, gizlilik, çerez ve künye.
2. Kampüs artıkları: `content/hukuki/tr/topluluk.md`, `kosullar.md:26` ve topluluk bağlantısı (P3 ile birlikte).
3. `docs/kvkk/aktarim.md:16` barındırmayı "Türkiye, aktarım yok" yazıyor; `izleme.md:3` ve `yedek.md:9` aynı.
4. KVKK m.9 aktarım dayanağı, Hetzner veri işleme sözleşmesi, VERBİS (ADR-0030 koşulları). Faz 2 ön koşulu.
5. /tespit için localStorage açıklaması ve aktarım envanteri (önceki açık istekler).
6. YÖK, Yargıtay, Danıştay protokol yazısı taslakları.

### P6. seo: görünürlük

1. `apps/web/src/app/layout.tsx:12` bütün siteyi koşulsuz `noindex, nofollow` yapıyor. Üretimde açılmalı.
2. `robots.ts`, `sitemap.ts`, `llms.txt`, canonical, `metadataBase`, OpenGraph hiç yok.
3. Kayıt sayfası rotası yok: sonuçlar yalnız dış kaynağa gidiyor; plan 13 mevzuat ve karar sayfalarının
   dizinlenmesini istiyor (casuist ile).
4. Kaldırılan İngilizce adresler için Search Console talebi (Tarık onayıyla).

### P7. kimlik: hesap (Faz 2)

1. Hesap sayfaları iskelet: `(hesap)/hesap/page.tsx`, `kvkk`, `ogrenci`, `hedef`. Oturum denetimi yok; bu
   sayfalara hiçbir yerden bağlantı yok.
2. Çıkış, parola sıfırlama, e-posta kodu, passkey ve TOTP arayüzü yok; yönetici uçları passkey ve TOTP
   istediği için (`server/auth/guard.ts:49-55`) yönetici web'den yetkilenemez.
3. Kayıt formunda rıza kutusu yok (`_bilesen/HesapFormu.tsx`).
4. Yönetim paneli yok; yedi yönetici ucu 503 döner (`server/auth/handlers.ts:241-253`).
5. Bildirim: `renderKalemcikNotice` hiç çağrılmıyor (`notify/dispatch.ts:59-66`); APNs 400 yanıtı bütün cihaz
   kayıtlarını silebilir (`transports.ts:124`); web-push ve APNs'te zaman aşımı yok (`:56-60,104-133`) ve
   asılı kalan bağlantı ödeme işleri dahil bütün işçiyi durdurur; e-posta gittikten sonra push hatası
   e-postayı yineler (`dispatch.ts:141-179`); `/kampus` yolu (`:50-52`).
6. Push ve bildirim tercihi uçları yok; ilgili tablolara yazan yok.
7. `account/purge.ts:55-73` silmeler tek işlemde değil; `runner.ts:112-124` LISTEN bağlantısında hata
   dinleyicisi yok.
8. `server/auth/takedown.ts:54,62-64` Kampüs tablolarını kullanıyor (P1 madde 7 ile).

### P8. odeme ve yz-gecidi (Faz 2)

1. iyzico canlı anahtarı kod tarafından reddediliyor (`server/billing/context.ts:4`); e-Arşiv sahte;
   `IYZICO_BASE_URL` boşsa sessizce sandbox (`billing/deps.ts:70,73`).
2. iyzico çerçevesi CSP yüzünden çalışmaz görünüyor (`checkout-step.tsx:61-69`,
   `server/security-headers.ts:13-22`). Koddan çıkarım; tarayıcıda denenmedi.
3. `/fiyatlar` sayfasında satın alma düğmesi yok; bakiye, fatura, kupon ve iade arayüzü yok.
4. BYOK arayüzü yok; `/fiyatlar` bunu seçenek olarak ilan ediyor.
5. YZ geçidi: akış sonunda `consume` ya da `release` hata verirse ücret alınmıyor (`gateway.ts:233-240`);
   `USD_TL = 50` sabit (`:19`); sağlayıcı çağrısında zaman aşımı yok; `VALKEY_URL` yoksa üretimde sessizce
   bellek sayacı (`gecit.ts:144`); soru metni ayırıcı karakter içerirse pasajlar kayar (`gateway.ts:94-98`).
6. Ölü kod: `routing.ts:35,41,45,54,59,65`, `types.ts:10`, `gemini.ts:10`; `ledger/src/prices.ts:97-98`.
7. Defter her işlemde bütün geçmişi yüklüyor (`ledger/src/pg.ts:65-71,182-220`). Çift harcama açığı görülmedi.

### P9. casuist, veri-toplama, anonimlestirme, atif-agi (Faz 2)

1. Arama üretimde çalışmaz: `embed.chunks` işinin tüketicisi yok, gömme servisi (`services/worker-py/nlp`)
   boş. `chunks` tablosu boş kalır, arama yalnız başlık eşleşmesine düşer.
2. Veri toplama hiçbir yerden tetiklenmiyor: `mevzuat.rg_daily` ve `ingest.fetch` için zamanlayıcı yok;
   KVKK ve Rekabet tarayıcıları hiçbir işten çağrılmıyor.
3. Anonimleştirme NER'siz açık kalıyor (`anonymizer/ner.py:505-523`, `pipeline.py:91,583`). T5.
4. Bot kuralı: `core/fetcher.py:168` bağlayıcının User-Agent'ı ezmesine izin veriyor; `core/robots.py:86-91`
   engel sayfasını "kısıt yok" sayabilir; yönlendirmelerde robots yeniden denetlenmiyor. Depoda tarayıcı
   taklidi yok, tek kimlik `KazuistBot/1.0`.
5. `core/runtime.py:84-88` Resmî Gazete işi kanun başlığını ve tertibi varsayıyor; "rakam tahmin edilmez"
   kuralına aykırı.
6. `core/pipeline.py:106-117` üretimde çapraz kaynak tekilleştirmesi yok; `core/runtime.py:36` ham arşiv
   her zaman yerel diske; `core/main.py:133-143` uzun turda sağlık denetimi 503 döner.
7. Atıf ağı: `citations.extract` kaydı şema ve anahtar bekliyor; `store.py:125` kendine atıf dışlaması etkisiz.
8. `packages/casuist/src/index.ts:22` `seedCorpus` paket kökünden dışa aktarılıyor.
9. Arama kalitesi gerçek corpus ve gerçek modelle ölçülmedi.

### P10. kalite-guvenlik: kapı

1. `tests/e2e/adresler.ts` `/tespit`, `/rehberler`, `/ara`, `/pratik`, `/yazma`, `/atif-agi`, `/kalemcik`
   içermiyor; Faz 1 sayfalarının axe ve taşma denetimi yok.
2. Sessizce atlanan testler: `tests/security/http/yetki-idor.spec.ts:123,131`, `yukleme.spec.ts:51-101`,
   `docxcheck/tests/test_docxcheck.py:298`, NER testleri. Atlanan test için eşik yok.
3. `eval/` ölçümleri hiçbir CI işinde koşmuyor; `tests/load` yok.
4. `yazma/_test/zip.ts` ile `tests/security/http/zip.ts` kopyası.
5. Üretime karşı güvenlik başlıkları testi ve 375, 768, 1440 px ekran görüntüleri.

### P11. pratik, yazma, icerik (Faz 2)

1. Pratik: 7 destede 59 kart, onaylı kart 0; plan ölçütü 300 onaylı soru; 22 HMGS alanından 7'sinde deste var.
2. Yazma: onaylı dergi profili yok; `rules.extract` işi web sürecinde `running` yaratılıp kuyrukta kalıyor;
   `yazma/page.tsx:20-28` veri tabanı hatasını yutuyor.
3. Rehber Word belgesi `docs/kaynak/` altına konmadı.

## 4. Faz 1 için en kısa yol

1. T1, T2, T3 kararları ve sunucu.
2. P1 madde 1 (ADR'ler).
3. P2 madde 1 ile 5, P3 madde 1 ile 3, P5 madde 1 ile 3, P6 madde 1 ve 2, P4'ten favicon ve OpenGraph.
4. P10 madde 1 ve 5.
5. DNS onayı ve yayın.

## 5. Belgelerdeki bayatlıklar

`docs/ilerleme.md:6,24-34` 2 Kasım durumunu anlatıyor; DEVIR.md'de #57 ile #68 arası birleştirmelerin kaydı
eksik. Bu denetimin bölümü eklendi; tam güncelleme P1 madde 11 ile birlikte yapılır.

## 6. Depo düzeni

Yaklaşık 40 birleşmiş yerel dal (`codex/*`, `dalga-1/*`) duruyor; silinmesi onay bekliyor.
`apps/web/next-env.d.ts` üretilmiş dosya olarak izleniyor. `docs/denetim/repro/*.mts` lint dışında.

## 7. Bilerek bırakılanlar

- `eurlex.py` AB metinlerini İngilizce çekiyor; ADR-0032 arayüz dilini kapsar, kaynak içeriğini değil.
- `casuist/src/query.ts` sorgu dili tespiti işlevseldir, artık sayılmaz.
- `.claude/agents/kampus.md` ADR-0031 gereği silinmez, pasif işaretlenir.

## 8. Denetimin sınırları

Okunmayan ya da yalnız taranan başlıca yerler: büyük istemci bileşenleri (`Kalemcik.tsx`, `DenemeEkrani.tsx`,
`Denetleyici.tsx`, `SablonAtolyesi.tsx` ve benzerleri), `yazma/_sunucu/*`, `ara/_sunucu/{ozet,gecit,baglam}`,
`kaydettiklerim/_sunucu/kutuphane.ts`, `server/auth` içindeki 17 dosya, `packages/ledger` (örneklendi),
`packages/contracts` ve `packages/db` şemalarının kalanı, anonymizer ve citations iç modülleri, hukuki metin
gövdeleri, `apps/ios`. Tarayıcıda görünüm ve axe denetimi yapılmadı. arm64 derlemesi denenmedi.
Bu yerlerdeki uçların zod ve yetki denetimi doğrulanmış sayılmaz.
