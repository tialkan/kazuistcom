# Yönlendirme: on-yuz ajanına işler (hukuki metin yayın kapısı)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: on-yuz (kod), kalite-guvenlik (test). Dayanak: ADR-0023,
istekler `hukuk-uyum-yayin-kapisi.md`, `hukuk-uyum-urun-tutarliligi.md` (madde 8).

## İşler

1. Hukuki sayfa render: `content/hukuki/<lang>/<slug>.md` dosyalarını okuyun; ön bilgiyi `splitFrontMatter`
   ile ayırıp YAML olarak ayrıştırın ve `LegalFrontMatter` ile doğrulayın (`@kazuist/contracts`).
   `legalRenderMode(fm, body, env)` sonucuna göre:
   - `yayin`: normal sayfa.
   - `gizli` (üretim): 404; site haritası ve iç bağlantılar da göstermez.
   - `taslak_bandi` (staging, geliştirme): `noindex` ve "TASLAK" bandı (metin i18n'den).
2. Derleme kapısı: `generateStaticParams` veya ön derleme adımında `legalBuildProblems` boş değilse derleme
   hata versin (`status: yayinda` olup `{{...}}` veya `[DOĞRULANACAK` içeren metin). CI'daki eşdeğer kontrol
   `packages/contracts/test/legal.test.ts` içinde zaten çalışıyor.
3. İngilizce sayfalar: "bağlayıcı sürüm Türkçedir" notu ve `alternate` alanından hreflang eşi.
4. Rıza sürümü: onay ekranları `consents.version` değerini ön bilgideki `version` alanından alır; odeme ve kimlik
   için bunu dönen küçük bir yardımcı (ör. `hukukiMetinSurumu(slug)`) önerilir.
5. Konumlandırma (hukuk-uyum madde 8): `/hukuki/yapay-zeka` bugün Casuist arşiv metnini ("nitelikli hukukçular
   için karar destek aracı") gösteriyor; plan 1 ve ADR-0001 kitleyi öğrenci, akademisyen ve meslek adayı olarak
   tanımlar. Tarık onayıyla `content/hukuki/tr/yapay-zeka.md` metnine geçilir; o zamana kadar mevcut sayfa
   korunur (ADR-0002).
6. `on-yuz-yonlendirme.md` isteği orkestra tarafından `next.config.ts` içinde uygulandı; ek iş yok.

## Kalite-güvenlik için

Uçtan uca test: üretim derlemesinde taslak sayfanın 404 döndüğü, staging'de noindex ve bant gösterdiği,
`yayinda` işaretli bir sınama metnine yer tutucu eklenince derlemenin düştüğü.

## Aciliyet

Erken geçişten (plan 14.3) önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ı: #13 (content/hukuki render ve yayın kapısı); tekil main ikinci turda kapandı. Madde bazında doğrulama kalite-guvenlik kapısındadır.
