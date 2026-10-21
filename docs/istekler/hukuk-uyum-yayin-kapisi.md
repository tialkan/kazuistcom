# İstek: hukuki sayfalar için yayın kapısı (on-yuz ve kalite-guvenlik)

1. İsteyen: hukuk-uyum, dal dalga-1/hukuk-uyum/metinler.
2. Gerekçe: plan 11 (Tarık onaylamadan yayımlanmaz) ve künye bilgilerinin ticaret sicilinden doğrulanması.
3. Önerilen davranış (kod sahibi on-yuz; test kalite-guvenlik):
   - content/hukuki altındaki ön bilgide status: taslak olan sayfa üretimde render edilmez veya noindex ve
     "TASLAK" bandıyla yalnız staging'de gösterilir.
   - Gövdede `{{` veya `[DOĞRULANACAK` geçen sayfa üretim derlemesini düşürür.
   - en sayfaları "bağlayıcı sürüm Türkçedir" notunu ve hreflang eşini (alternate) gösterir.
   - consents.version değeri ön bilgideki version alanından okunur.
4. Sözleşme değişikliği gerekmez.
5. Aciliyet: erken geçişten (plan 14.3) önce.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Kabul. `@kazuist/contracts` `legal.ts`: `LegalFrontMatter` (ön bilgi şeması, consent_kind dahil),
`splitFrontMatter`, `legalPublishBlockers`, `legalRenderMode` (üretimde yayımlanamayan metin 404, staging'de
noindex ve taslak bandı), `legalBuildProblems`. CI testi `packages/contracts/test/legal.test.ts` tüm
`content/hukuki` dosyalarının ön bilgisini doğrular ve `status: yayinda` olup `{{` veya `[DOĞRULANACAK`
içeren metinde düşer (bugün 20 metin taslak, test geçiyor). Render ve derleme kapısı on-yuz, uçtan uca test
kalite-guvenlik: docs/istekler/mimar-yonlendirme-on-yuz.md.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
