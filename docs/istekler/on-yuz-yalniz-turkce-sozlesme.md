# on-yuz: ADR-0032 sonrası sözleşme ve sahiplik temizliği

Tarih: 7 Kasım 2026. İsteyen: on-yuz (codex/yalniz-turkce). Muhatap: mimar.

ADR-0032 ile Kazuist yalnız Türkçe oldu; `packages/i18n/en/**`, `content/hukuki/en/**` ve /legal/* rotaları
kaldırıldı. Sözleşme ve sahiplik dosyaları mimarın olduğundan aşağıdakiler değiştirilmedi.

## İstenenler

1. `packages/contracts/src/legal.ts`, `LegalFrontMatter`:
   - `lang: z.enum(['tr', 'en'])` alanı `z.literal('tr')` olsun (ya da alan kaldırılsın).
   - `routePath` yalnız `/hukuki/<slug>` kabul etsin; `/legal/` dalı artık rota değil.
   - `alternate` (hreflang eşi) alanı kaldırılsın; hiçbir Türkçe metinde kalmadı.
   - `binding` alanının açıklamasındaki "English texts" notu kalksın; alan her metinde `true`.
2. `packages/contracts/test/legal.test.ts`: bu dalda yalnız okunan dizin listesi `['tr']` yapıldı (en dizini
   silinince test çökmesin diye, ADR-0032 yetkisiyle). Şema değişince `fm.lang` ve `binding` beklentileri
   sadeleştirilebilir.
3. `docs/sahiplik.md`: `packages/i18n/{tr,en}/...` desenleri `packages/i18n/tr/...` olsun; madde 6(a)'daki
   `{tr,en}` ifadesi de.

## Şimdiki durum

`apps/web/src/app/(kabuk)/_hukuki/yukle.ts` `lang: tr` dışındaki metni ADR-0032 hatasıyla reddeder; şema
daralana kadar koruma bu yükleyicidedir.
