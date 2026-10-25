# Orkestra devri

Belge tarihi: 25 Ekim 2026. Bu dosya Kazuist orkestrasını devralan oturum içindir. En altta başlangıç metni var.
Bu dosya devir anının fotoğrafıdır; güncel durum için her zaman `git log`, `gh pr list`, `docs/ilerleme.md`, `DEVIR.md`'nin en üst bölümü ve `docs/kararlar.md` okunur.

## 1. Okuma sırası

1. `plan.md` baştan sona. Tek doğruluk kaynağıdır; yalnız ADR ile değişir. SRS: `docs/kaynak/Kazuist.docx` (`textutil -convert txt -stdout docs/kaynak/Kazuist.docx`); çelişkide plan geçerlidir.
2. `CLAUDE.md` (Ek K): proje kuralları, bitti tanımı, alt ajan rapor biçimi.
3. `docs/kararlar.md`: Tarık kararları ve orkestra varsayılanları. Plan ile kararlar çelişirse kararlar dosyası ve ilgili ADR geçerlidir.
4. `docs/adr/README.md` ve ADR-0001..0025.
5. `docs/sahiplik.md`: hangi ajan hangi yolun sahibi.
6. `docs/kalite/dalga-1.md` (kapı raporu), `docs/denetim/defter-odeme.md` (üç tur ödeme denetimi).
7. `docs/istekler/README.md` ve "Sonuç" bölümü olmayan istek dosyaları.
8. Bağlayıcı rehberler: `~/Desktop/promptlar/siteyarat.md`, `webtasarim.md`, `appstore.md`.

## 2. Değişmez kurallar (plan bölüm 0, CLAUDE.md)

- Sır yok: token, parola, anahtar sohbete, depoya, loga, rapora girmez. Değerler `~/Desktop/kazuist-<servis>.txt` dosyalarında; yalnız yol kullanılır, değer hiçbir çıktıya basılmaz. Dosyalar düz metin ve izin 600 olmalı (Tarık TextEdit ile RTF kaydedebiliyor; `textutil -convert txt` ile düzeltilir, değer basılmaz).
- Geri dönüşü zor işlemler yalnız Tarık'ın açık onayıyla: DNS değişikliği, canlı ödeme anahtarı, veri silme, üretimde yıkıcı migration, App Store gönderimi, kurumlara yazı. ADR onayı ve hukuki metinlerin yayım onayı da Tarık'ındır.
- Başlatılmış iş tamamlanmış sayılmaz; dışarıdan doğrulanır. Veri alınamayan ölçüm "geçmedi" yazılır.
- Metin: uzun çizgi (U+2014) yok, emoji yok, yasak ifade yok (`pnpm check:text`). Unvan, rakam, madde numarası tahmin edilmez.
- Kişisel veri Türkiye dışına çıkmaz; dış YZ sağlayıcısına yalnız maskeli metin gider.

## 3. Tarık ile çalışma biçimi

- Teknik bilgi beklemeyin. Ürün ve işletme varsayılanlarını kendiniz karara bağlayın, `docs/kararlar.md`'ye "Orkestra varsayılanı" diye yazın, ilerleyin. Tarık "bana sorma sen hallet" dedi.
- Yalnız şunları sorun ve tek listede toplayın: bölüm 2'deki geri dönüşü zor işlemler, yalnız onun yapabileceği hesap/token/panel adımları (tam URL, menü, alan adıyla), ADR onayı, hukuki metin yayım onayı.
- Raporlar Türkçe, kısa: ne bitti, kanıt, açık işler, sizden gerekenler.
- Aynı anda en fazla 3-4 alt ajan çalıştırın (plan 17.3'teki 8 yerine; kullanım sınırı sık doluyor). Sınıra takılan ajan kaldığı yerden sürdürülür (yeni ajan açmak yerine aynı ajana mesaj).

## 4. Depo ve araçlar

- Yerel: `/Users/baris/Documents/GitHub/Kazuist`, dal `main`. Uzak: https://github.com/tialkan/kazuistcom (özel). `gh` oturumu açık (tialkan).
- Etiket: `contracts-v1`. `contracts-v1.1` ADR-0021..0023 onayından sonra konacak.
- CI (`.github/workflows/ci.yml`): node (typecheck, lint, test, contracts lint, check:text, build, istem enjeksiyonu seti), python (pytest), gitleaks (CLI, sabit sürüm; `.gitleaksignore` ve `.gitleaks.toml` yanlış pozitifler için), docker (compose ile gerçek PostgreSQL 18 + pgvector, Valkey, SeaweedFS, Mailpit; migration iki kez, db-smoke, imaj derleme, health 200/503, işçi duman testi, tests/e2e ve tests/security, Lighthouse CI bütçesi).
- Yerel ortam: node 26, pnpm 11, uv 0.13, Python 3.12 (uv), Homebrew PostgreSQL 18 ve pgvector, gitleaks. Docker YOK (yalnız CI'da).
- Alt ajan tanımları `.claude/agents/` altında (19 ajan); ajan türü adıyla çağrılabilir (mimar, odeme, kimlik ...). Worktree'ler `.claude/worktrees/` altında (gitignore'da).

### Birleştirme kuralları (orkestra)

- PR'ı yalnız CI'ın dört işi tamamlanıp yeşil olunca birleştirin: `gh pr checks <n> --watch` bitmeden `gh pr merge` çalıştırmayın (bir kez kırmızı gitleaks'le birleştirildi; tekrarlanmasın).
- Squash merge. PR main'in gerisindeyse `gh pr update-branch <n>` ve CI'ı yeniden bekleyin.
- Kök `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `apps/web/src/app/layout.tsx`, `apps/web/next.config.ts`, `apps/worker-node/src/main.ts` ve `handlers.ts`, `services/worker-py/uv.lock` orkestranın ortak dosyalarıdır; çakışmayı siz çözersiniz.
- Ajanlar `DEVIR.md` ve `docs/ilerleme.md`'ye kendi bölümlerini ekleyebilir; çakışırsa orkestra birleştirir.
- Sözleşme (`packages/contracts`) ve şema (`packages/db`) yalnız mimar ve ADR ile değişir; contracts-v1 sonrası her şema değişikliği yeni migration'dır.

## 5. Ne bitti (main 03cdc66, PR #1-#29 birleşik)

| Alan | Durum |
|---|---|
| Dalga 0 | Monorepo, OpenAPI 3.1 (sözleşme v1.1), 70+ tablo, migration 0000-0003, ADR-0001..0020 kabul, contracts-v1 |
| YZ geçidi | 4 sağlayıcı, platform OpenRouter (ADR-0025, data_collection deny, zdr true), Anthropic doğrudan yedek, BYOK prepare/verify, PII temizleyici (biçim varyantları dahil), bütçe koruyucu; OpenRouter canlı duman testi 25 Ekim'de geçti |
| Altyapı | Dockerfile'lar (root olmayan), ayrı migrate adımı, bakım sayfası, runbook'lar, CSP nonce ve güvenlik başlıkları, CI'da e2e/güvenlik/Lighthouse |
| Kimlik | Better Auth (e-posta, kod, passkey, Google, Apple, bearer), roller, TOTP yönetici adımı, KVKK başvuruları (hesapsız dahil), kaldırma talepleri, admin iskeleti, hesap silme ve 14 gün sonra purge, hesap formları |
| Ödeme | Saf TS çift taraflı defter, Postgres deposu, iyzico Ödeme Formu ve abonelik, webhook, mutabakat, iade ve fesih kuralları, ödeme adımı arayüzü; üç tur bağımsız denetim |
| Veri toplama | 7 bağlayıcı (mevzuat, RG, KVKK, Rekabet, OpenAlex, Crossref, CELLAR), fikstürle testli, hepsi varsayılan kapalı ve Tarık onayı bekliyor |
| Anonimleştirme | Yapısal tanıyıcılar, rol etiketleri, Ek E policy.yaml (taslak), NER akdeniz27 seçildi (ağırlıklar depo dışında `~/.cache/kazuist-ner`), masked_text |
| Ön yüz | Tasarım sistemi, kabuk, ana sayfa, /fiyatlar (onaylı), hukuki sayfalar ve yayın kapısı, korunan 22 Casuist adresi ve /en, /tr/hukuki/* tek 301; Ek H 23/23 |
| Hukuk | Bölüm 11 metinleri TASLAK, KVKK envanteri, aktarım, denge testi, 6 protokol yazısı taslağı (gönderilmedi), ADR-0024 taslağı |
| Kalite | `docs/kalite/dalga-1.md` kapı raporu, tests/e2e ve tests/security CI'da |

## 6. Devir anında süren işler

Bu oturumda iki alt ajan çalışıyordu. Devralan oturum önce şu dalları kontrol eder: uzakta varsa PR'ı, yoksa yerel worktree'yi inceler, eksik işi kendi ajanına verir.

| İş | Dal | Yerel worktree (varsa) |
|---|---|---|
| Mimar, sözleşme 1.2: D6 ledger_transactions değişmezlik tetikleyicisi, abonelikte withdrawalWaiver ve annualCommitmentVersion, IFN ve checkout callback uçları OpenAPI'de, fesih/iade Idempotency-Key ve 202, products sürümleme, bildirim alt türleri, legal.ts'e pdf alanları, tekil main, embed payload ve torch'suz ner-runtime extra'sı, ADR-0024'ün eşit bölüşüm formülüne güncellenmesi | `dalga-1/mimar/istekler-2` | `.claude/worktrees/agent-a3f200b79609d00b3` |
| Ödeme, üçüncü denetim düzeltmeleri (Y-N5, Y-N6, O-N3, Y5, D-N6, D-N8, D-N9, D-N1, O-N2, O9), CI'da hariç tutulan tek IDOR testi (başkasının abonelik iptali 404 yerine 400), ardından gerçek iyzico sandbox uçtan uca denemesi ve FakeIyzico'nun gerçek cevaplara göre düzeltilmesi | `dalga-1/odeme/denetim-3` | `.claude/worktrees/agent-ab47769ff6b5d1817` |

## 7. Dalga 1 kapısı (plan 17.2) ve kalanlar

| Madde | Durum |
|---|---|
| Staging canlı | Geçmedi: VPS yok |
| Giriş çalışır | K-01 düzeltildi (#24); kapı raporunda yeniden ölçülecek |
| Defter özellik testleri | Geçti |
| iyzico sandbox mutlu yollar | Ödeme ajanı yapacak; anahtarlar ve Merchant ID dosyada |
| YZ geçidi taklit ve gerçek sağlayıcı | Geçti (OpenRouter canlı, 25 Ekim) |
| Bağlayıcılar staging'de | Staging'e bağlı; kaynak onayları Tarık'ta |
| Anonimleştirme 50 belge raporu | Geçti (sentetik; 15.3/2 kapısının kanıtı değil, 200 gerçek karar gerekiyor) |
| Kabuk ve korunan Casuist sayfaları | Geçti |
| Hukuki taslaklar onaya hazır | 7 [DOĞRULANACAK] kaldı; VKN, vergi dairesi, KEP yer tutucu |

Sonraki adım: iki süren iş birleşince kalite-guvenlik ajanıyla kapıyı yeniden ölç (`docs/kalite/dalga-1.md` güncellenir), ödeme için bağımsız denetçiyle dördüncü tur. Kapı geçmeden Dalga 2'ye geçilmez; staging tek başına bekliyorsa Tarık'ın onayıyla Dalga 2'nin staging gerektirmeyen işleri başlatılabilir (karar orkestranın, kararlar.md'ye yazılır).

Açık ödeme bulguları (üçüncü tur): kritik 0, yüksek 4 (Y5, Y-N3, Y-N5, Y-N6), orta 7, düşük 11. Canlı iyzico anahtarı bunlar kapanıp sandbox uçtan uca geçmeden istenmez.

## 8. Token dosyaları

| Dosya | Durum |
|---|---|
| `~/Desktop/kazuist-iyzico-sandbox.txt` | Var: IYZICO_API_KEY, IYZICO_SECRET_KEY, IYZICO_MERCHANT_ID, IYZICO_BASE_URL (sandbox; BIN sorgusuyla doğrulandı) |
| `~/Desktop/kazuist-openrouter.txt` | Var: OPENROUTER_API_KEY (anahtar kontrolü 200, duman testi geçti) |
| `kazuist-cloudflare-api.txt` | Yok; zorunlu değil. DNS yedeği ve staging kaydı panelden elle yapılabilir (`docs/runbook/dns-yedek.md`) |
| `kazuist-coolify-api.txt` | Coolify kurulunca |
| `kazuist-openalex.txt`, `kazuist-google-oauth.txt`, `kazuist-apple-signin.txt`, `kazuist-eposta.txt`, `kazuist-pii.txt` | Yok; adımlar ilgili PR'larda ve runbook'larda |
| `kazuist-anthropic.txt` | Gerekmiyor (ADR-0025); yalnız yedek sağlayıcı istenirse |

## 9. Tarık'tan bekleyenler (tek liste)

1. Türkiye VPS seçimi ve satın alma (`docs/runbook/vps-secimi.md`; kritik yol, erken geçiş 16 Kasım haftası).
2. ADR-0021, 0022, 0023, 0024 onayı (0025 kabul edildi). Onaydan sonra `contracts-v1.1` etiketi ve plan 4.5'in ADR-0024'e göre düzeltilmesi.
3. Künye: VKN, vergi dairesi, KEP.
4. Hukuki metinlerin okunup yayım onayı (erken geçişten önce).
5. `docs/kaynaklar/*.md` için kaynak başına üretim onayı; anonimleştirme `policy.yaml` onayı.
6. iyzico: webhook imzası (X-IYZ-SIGNATURE-V3) ve IFN geri çağırma adresi için entegrasyon@iyzico.com'a talep.
7. Etiketleme ekibi ve 200 gerçek kararın kaynağı (anonimleştirme kapısı).
8. İleride: Google OAuth, Sign in with Apple, e-posta sağlayıcısı (Türkiye'de), Apple Developer kuruluş üyeliği ve D-U-N-S, iyzico üye işyeri canlı başvurusu, ETBİS.

## 10. Bilinen tuzaklar

- `gh pr merge` öncesi CI'ın bitmesini bekleyin; `gh pr checks` çıktısında `pending` varsa birleştirmeyin.
- Uzun süren `gh pr checks --watch` 10 dakikayı aşabilir; arka planda çalıştırın.
- Scratchpad'de bir ajan `types.py` bırakmış; scratchpad'de Python çalıştırırken `python3 -I` ve ayrı alt dizin kullanın.
- Next.js 16: statik rotada `params` undefined gelir; `withAuth` buna göre yazıldı. CSP nonce yüzünden tüm sayfalar istek başına işleniyor; TTFB etkisi ölçüldü, önemsiz.
- `.next/types` bayat kalınca typecheck yanlış hata verir; önce build.
- ESLint `.claude/**` ve `docs/denetim/repro/**` yollarını yok sayar; worktree'ler lint'i bozmasın.
- Kullanım sınırı: ajanlar sık kesiliyor; kesilen ajan kaldığı yerden sürdürülür, aynı iş için ikinci ajan açılmaz.

## 11. Başlangıç metni (yeni oturuma yapıştırılır)

```text
Sen Kazuist'in orkestra ajanısın. Çalışma dizini /Users/baris/Documents/GitHub/Kazuist.
Önceki orkestra oturumundan devralıyorsun. Önce docs/ORKESTRA-DEVIR.md'yi baştan sona oku ve 1. bölümdeki
okuma sırasını uygula (plan.md, CLAUDE.md, docs/kararlar.md, ADR'ler, sahiplik, kalite ve denetim raporları).

Sonra durumu dışarıdan doğrula: git log, gh pr list --state all, uzak dallar, 6. bölümdeki iki süren işin
dalları ve worktree'leri, main'de CI durumu. Belgede yazanla gerçek durum farklıysa gerçek durumu esas al
ve farkı bana tek paragrafta söyle.

Çalışma biçimi: plan 17.2 dalgalarını sürdür; aynı anda en fazla 3-4 alt ajan, worktree izolasyonuyla,
.claude/agents/ tanımlarıyla. Her ajana görev, sahip olduğu yollar, plan bölümleri ve bitti tanımını ver.
PR'ları yalnız CI tamamlanıp yeşilse birleştir; ortak dosya çakışmalarını sen çöz; DEVIR.md ve
docs/ilerleme.md'yi güncel tut. Dalga sonunda kalite-guvenlik ve gerekli konularda bagimsiz-denetci çalıştır;
kapı geçmeden sonraki dalgaya geçme.

Bana teknik soru sorma; ürün ve işletme varsayılanlarını kendin karara bağla ve docs/kararlar.md'ye yaz.
Yalnız şunları iste ve tek listede topla: geri dönüşü zor işlemler (DNS, canlı ödeme anahtarı, veri silme,
yıkıcı migration, App Store gönderimi, kurumlara yazı), yalnız benim yapabileceğim hesap ve token adımları
(tam URL, menü, alan; değer ~/Desktop/kazuist-<servis>.txt dosyasına, sen yalnız yolu kullanırsın),
ADR ve hukuki metin onayları. Benden parola veya token değeri isteme.

İlk işin: 6. bölümdeki iki işi tamamlat ve birleştir, ardından Dalga 1 kapısını yeniden ölçtür ve bana
kısa rapor ver: ne bitti, kanıt, açık işler, benden gerekenler.
```
