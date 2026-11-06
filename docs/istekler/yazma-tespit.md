# İstek: /tespit sayfası için bağlantı, site haritası ve e2e

Kimden: tespit işi (dal codex/tespit). Kime: on-yuz, seo, kalite-guvenlik ve orkestra. Sözleşme değişikliği yoktur;
`packages/contracts` ve `packages/db` değişmedi. Aciliyet: bu istekler olmadan sayfa çalışır, yalnız keşfedilebilirlik
ve otomatik test eksik kalır.

## 1. on-yuz: gezinme bağlantısı

`/tespit` için kabukta (üst çubuk ya da altbilgi "Ürün" listesi) bir bağlantı gerekir. Önerilen metin: "Yapay zekâ
izleri". `apps/web/src/app/(kabuk)/_kabuk/Kabuk.tsx` on-yuz'undur; dokunulmadı. Metin `packages/i18n/{tr,en}/ortak.json`
altında olmalıdır.

## 2. seo: site haritası ve indeksleme

- `apps/web/src/app/sitemap.ts` içine `/tespit` eklenmeli.
- Kök `layout.tsx` tüm siteyi `noindex` yapıyor (yayın öncesi karar). `/tespit` yayında indekslensin isteniyorsa
  bu karar yayın kapısında sayfa düzeyinde değiştirilmeli; sayfa `robots` alanını kendisi belirlemedi.
- İndirme ucu `/tespit/yazim-kurallari.md` metin dosyasıdır; `robots.ts` kuralları belirlenirken dikkate alınmalı.

## 3. kalite-guvenlik: e2e ve axe

`tests/e2e/adresler.ts` içindeki `ANA_SAYFALAR` listesine `/tespit` eklenmeli. 375, 768 ve 1440 px'te axe sonucu 0
ihlal ve yatay taşma 0 olarak elle çalıştırmada doğrulandı (docs/tespit/ekran/dogrulama.json).

## 4. orkestra: üretim bağlantıları

- `apps/web/package.json` içine isteğe bağlı betik: `"tespit:uret": "node src/app/tespit/_veri/uret.ts"`. Bağımlılık
  eklenmedi; `prettier` kök devDependency'sidir.
- i18n paketinin kod tarafında kayıt gerekmedi: `@kazuist/i18n/tr/tespit.json` doğrudan içe aktarılır
  (`packages/i18n/package.json` `exports` desenleri yeterli). `packages/i18n/test/parity.test.ts` yeni dosyayı da kapsar.
