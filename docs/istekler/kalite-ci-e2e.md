# İstek: kalite testlerinin CI'a bağlanması (plan 15.1)

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: altyapi (`.github/workflows/**`), orkestra
(workspace ve kilit kararı). Kaynak: docs/kalite/dalga-1.md "Bu dalgada eklenen testler ve CI durumu".
Aciliyet: orta; bugün kalite testleri yalnız yerelde koşuyor.

## Durum

`tests/e2e` ve `tests/security` workspace dışı küçük paketlerdir (`pnpm --dir <yol> install
--ignore-workspace`, kendi pnpm-lock.yaml'ları); kök kilit dosyasını değiştirmemek için böyle bırakıldı.
`pnpm test` bunları çalıştırmaz.

## İstenen

1. `node` işine bir adım (sunucu gerekmez): `pnpm exec vitest run --config tests/security/enjeksiyon/vitest.config.ts`.
   Not: bugün 6 durum kırmızı (yz-gecidi, `kalite-yz-gecidi-maskeleme.md`); adım düzeltme birleşince
   zorunlu yapılmalı ya da o zamana kadar `continue-on-error` ile görünür tutulmalı.
2. `docker` işine, web konteyneri ayaktayken (zaten 127.0.0.1:3000'de) Playwright adımları:
   `pnpm --dir tests/e2e install --ignore-workspace --frozen-lockfile`,
   `pnpm --dir tests/e2e exec playwright install --with-deps chromium`,
   `KAZUIST_E2E_BASE_URL=http://localhost:3000 pnpm --dir tests/e2e exec playwright test`; güvenlik için aynısı
   `tests/security` ile, `KAZUIST_SEC_DATABASE_URL` CI'ın geçici veri tabanıyla. `BETTER_AUTH_URL`
   `http://localhost:3000` olmalı (Origin denetimi). Raporlar artifact olarak saklanmalı.
3. Lisans betiği ve pip-audit: `sh tests/security/tarama/tarama.sh $RUNNER_TEMP/tarama` (gitleaks CLI işte
   zaten kurulu; uv gerekir).
4. Lighthouse CI bütçeleri (plan 15.1): ana sayfalar için mobil performans 90 eşiği; kalite tarafı
   bütçe dosyasını `tests/load/` altında hazırlayabilir, iş tanımı altyapinin.
5. Orkestra kararı: bu paketler workspace'e alınacaksa `pnpm-workspace.yaml` ve kök kilit dosyası
   güncellenir; alınmayacaksa yukarıdaki `--ignore-workspace` adımları yeterli.

Bağımlılıklar ve lisanslar: `@playwright/test` 1.64.1 (Apache-2.0), `@axe-core/playwright` ve `axe-core`
4.14.0 (MPL-2.0, yalnız test, dağıtılmaz), `pg` 8.23.1 (MIT; packages/db ile aynı sürüm).

## Sonuç

(altyapi dolduracak)
