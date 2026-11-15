# ADR-0039: Sunucu loglarında hata temizleme kuralı (`@kazuist/log`)

- Tarih: 2026-11-15
- Karar kodu: yok (plan 14.7; CLAUDE.md "Güvenlik": içerik loglanmaz)
- Kaynak: PR #115 (kimlik, `apps/web/src/server/auth/log.ts`) ve orkestranın 15 Kasım 2026 görevi
- Durum: Önerildi (15 Kasım 2026). Uygulama bu ADR'yi getiren PR'dadır. Kural veri, şema ya da API sözleşmesi
  değiştirmez; tek commit'le geri alınabilir.
- İlgili kararlar: ADR-0005 (Better Auth), ADR-0007 ve plan 8.8 (YZ geçidinde yalnız üst veri), ADR-0023 ve ADR-0035
  (iş kuyruğu, işçi logları), ADR-0038 (edu_claims ve 23505 eşlemesi)

## Bağlam

1. Drizzle, başarısız bir sorgunun hatasına SQL metnini ve bütün bağlı parametreleri yazar
   (`Failed query: ... params: ...`). Parametreler e-posta adresi, edu.tr posta kutusu ve belirteç taşır. Postgres
   `detail` alanına satır değerini yazar (`Key (email)=(...) already exists.`).
2. Better Auth 1.7.11 yönlendiricisi yakalanmayan hatayı nesnesiyle, "column", "relation" ve "table" içeren hatanın
   mesajını düz metin loglar. PR #115'teki kontrol denemesinde kayıt testi adresi logda buldu.
3. PR #115 kimlik modülüne merkezi bir temizleyici ekledi (`safeErrorFields`, `logError`, `betterAuthLog`). Diğer
   modüller (casuist, yazma, kabuk, altyapı bağlantıları) ve `apps/worker-node` log satırlarını elle yazıyordu. Çoğu
   yalnız `err.name` yazdığı için bugün sızıntı yoktu, ama kural kodda değil alışkanlıktaydı: yeni bir
   `console.error(err)` satırını durduran bir denetim yoktu.

## Karar

### 1. Paket

`packages/log` (`@kazuist/log`) çalışma alanı paketi eklenir. Dış bağımlılığı yoktur; `apps/web` ve
`apps/worker-node` kullanır. Dışa açtığı yüzey:

- `safeErrorFields(err)`: hatanın sınıf adı (`error`) ve `cause` zincirinde (en çok 5 adım) SQLSTATE kodu taşıyan ilk
  nesneden `code`, `constraint`, `table`, `column`. Bir değer tanımlayıcı biçiminde değilse alınmaz. Hatanın
  `message`, `detail`, `hint`, `where`, `query`, `params` ve `stack` alanları hiç okunmaz.
- `writeLog(level, fields)`: tek yazıcı. Bir JSON satırı; `error` ve `warn` stderr'e, `info` stdout'a.
- `logEvent(level, at, fields)`: web satırı `{ at, level, ...fields }`; `at` ve `level` alanlarla ezilemez.
- `logError(at, err, fields)` ve `logWarn(at, err, fields)`: bağlam alanları ve `safeErrorFields(err)`; hata alanları
  bağlam alanlarını ezer, tersi olmaz.
- `logRequestError(at, req, err, fields)`: yöntem, sorgu dizesiz yol, yeni `requestId` ve temizlenmiş hata; `requestId`
  yanıtta istemciye gider.
- `serviceLog(svc)`: işçi satırı `{ at: ISO zaman, svc, msg, ...fields }` (services/worker-py ile aynı biçim).

### 2. Alan değerleri

Alanlar tipte ilkeldir (`string`, `number`, `boolean`, `null`, kısa dizi); bir `Error` ya da istek gövdesi alan olarak
verilemez. Çalışma anında tipin atlandığı durumlar için ikinci kat: nesne, işlev ve sonsuz sayı düşer, metin 256
karakterle, dizi 32 ögeyle sınırlanır, e-posta biçimli parça `redacted` olur, anahtar sade tanımlayıcı değilse alan
düşer.

### 3. Kural ve denetim

`apps/web/src`, `apps/worker-node/src` ve `packages/*/src` altındaki sunucu kodu log satırını yalnız `@kazuist/log`
ile yazar. `eslint.config.mjs`:

- `no-console`: bu yollarda bütün `console` yöntemleri hatadır.
- `no-restricted-syntax`: `log`, `logError`, `logWarn`, `logEvent`, `logRequestError` ve `writeLog` çağrısının
  argümanlarında `.message`, `.stack`, `.detail`, `.hint`, `.query`, `.params`, `.cause`, `.toString`, `String(...)` ve
  `JSON.*(...)` hatadır.
- Muaf: `packages/log/src` (yazıcının kendisi), testler (`__tests__`, `test/`, `*.test.ts(x)`), elle çalıştırılan
  üreticiler (`apps/web/src/app/*/_veri/uret.ts`), paketlerin `scripts/` klasörleri ve `.mjs` kanıt betikleri.

`packages/log/test/lint-rule.test.ts` depo yapılandırmasıyla gerçek sunucu yollarında örnek kod denetler; bir glob
hatası ya da silinen blok CI'ı kırmızıya döndürür (kontrol denemesi: worker-node globu kaldırılınca 3 test düştü).
`pnpm lint` ve `pnpm test` CI `node` işinde çalışır.

### 4. Better Auth bağdaştırıcısı

`betterAuthLog` kimlik modülünde kalır (`apps/web/src/server/auth/log.ts`), çünkü Better Auth'a özgüdür; serbest
metin mesajı yalnız sabit cümle görünümündeyse bırakır ve satırı `logEvent` ile yazar.

### 5. Sahiplik

`packages/log/**` mimarındır ve `packages/contracts` ile `packages/db` gibi ADR ile değişir; kural bütün modülleri
bağlar. Modül ajanları paketi yalnız kullanır; ek alan ya da yazıcı ihtiyacını `docs/istekler/` altına yazar.

## Değerlendirilen seçenekler

- `apps/web/src/server/log.ts`: worker-node bir uygulamanın kaynağını içe aktaramaz; kural iki yerde yaşardı.
  Seçilmedi.
- `@kazuist/db/log` alt yolu: kilit dosyasını değiştirmezdi, ama `packages/db` şema ve iş kuyruğu sözleşmesidir; log
  yazıcısı orada yanlış yerde olur ve `ai-gateway` gibi veri tabanından bağımsız paketler onu kullanamazdı. Seçilmedi.
- Hazır bir log kütüphanesi (pino gibi): yeni bağımlılık ve lisans incelemesi gerekir, ihtiyaç tek satır JSON'dur.
  Seçilmedi; ölçek gerekirse yalnız `writeLog` değişir.
- Yeni paket: kilit dosyasına 8 satır, `node_modules` içine yalnız bağlantı. Seçildi.

## Sonuçlar

- Satır biçimi değişiklikleri: worker-node hata satırları artık SQLSTATE alanlarını taşıyabilir; Error olmayan değer
  için `error` alanı `Unknown`'dır (önce bazı yerlerde `Error`). YZ geçidi metrik satırına `at: "ai-gateway"` ve
  `level: "info"` eklendi. `pg.pool` ve `valkey` satırlarına `level: "error"` eklendi. Diğer satırların alanları aynı.
- `apps/web/src` altındaki istemci bileşenlerinde de `console` yasaktır. Tarayıcı hatası raporlama ihtiyacı doğarsa
  ayrı karar konusudur.
- `packages/*/src` kapsamdadır: `ledger`, `casuist` ya da `ai-gateway` log yazmak isterse `@kazuist/log`
  bağımlılığını ekler.
- CLAUDE.md "Güvenlik" bölümüne "Sunucu logu yalnız `@kazuist/log` ile yazılır (ADR-0039)" satırı önerilir. CLAUDE.md
  bu PR'da değişmedi; satır Tarık'ın onayıyla eklenir.
- Aynı PR, ADR-0038'in edu_claims testini CI `docker` işinde gerçek PostgreSQL'e karşı çalıştıran adımı ekler
  (`KAZUIST_IT_DATABASE_URL`).
