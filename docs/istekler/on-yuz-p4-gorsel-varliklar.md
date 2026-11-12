# İstek: P4 görsel varlıklarının bağlanması sonrası işler

Kimden: on-yuz (dal `on-yuz/p4-gorsel-varliklar`, review.md P4). Kime: seo, hukuk-uyum, orkestra, yazma, pratik,
kimlik. Sözleşme (`packages/contracts`, `packages/db`) değişikliği yok.

Ayrıntı: `docs/tasarim/gorsel-istemleri.md`.

## seo

1. `apps/web/src/app/opengraph-image.tsx` artık her sayfaya `og:image` (1200 x 630, alt metinli) ve
   `twitter:image` ekliyor. `apps/web/src/app/(seo)/_seo/metadata.ts` içindeki `twitter.card: 'summary'` değeri
   büyük önizleme için `summary_large_image` olmalı. Aynı dosyadaki "OpenGraph images are not set yet" yorumu
   ve `docs/istekler/seo-p6-og-gorseli.md` kapanabilir. Görsel dosya yolu istekteki `public/og/varsayilan.png`
   yerine Next.js dosya kuralıdır; `metadataBase` mutlak adresi üretir.
2. Yerel üretimde denetlendi: `/`, `/fiyatlar`, `/hukuki/gizlilik`, `/pratik`, `/tr`, `/rehberler/tez`,
   `/tespit`, `/bakim` sayfalarının hepsinde `og:image` var.

## hukuk-uyum

1. `docs/ip/arka-plan-kaydi.md` dosyasına `docs/tasarim/gorsel-istemleri.md` 5. bölümdeki kayıt satırları
   işlenir (ADR-0019, ADR-0034 madde 5).
2. Marka işareti (`apps/web/src/app/icon.svg`) bir yapay zekâ kod asistanının elle yazdığı vektördür; görüntü
   üreten model kullanılmadı. TÜRKPATENT başvurusu (plan 18.1 madde 6) işareti de kapsayacaksa telif ve tescil
   değerlendirmesi istenir.
3. Çizerle yapılacak sözleşme: mali hakların ayrı ayrı gösterilerek yazılı devri ve "YZ çıktısı kullanılmadı"
   beyanı.
4. Midjourney koşullarının birincil kaynaktan okunması (ADR-0034 madde 1) taslak üretiminden önce.

## orkestra

1. `apps/web/public/avatar/**` hiçbir ajanın yolunda değil; avatar dosyaları gelince sahibi atanır (öneri:
   on-yuz dosyaları koyar, kimlik hesap ekranına bağlar).
2. Bu dalda on-yuz satırı dışındaki şu yollar orkestranın verdiği görevle yazıldı: `apps/web/src/app/icon.svg`,
   `favicon.ico`, `apple-icon.png`, `manifest.ts`, `opengraph-image.tsx` ve `apps/web/public/icon-*.png`.
   Sahiplik tablosuna on-yuz satırı olarak eklenmesi önerilir.

## yazma

`content/kalemcik.yaml` dört ton tanımlıyor; plan 12 madde 8 beşinci olarak "nötr" sayıyor. Nötr ton için ayrı
Kalemcik yüzü gerekiyor mu? Gerekiyorsa çizer brifingine beşinci ifade eklenir.

## pratik

HMGS konu piktogramları (plan 10.6/5) için 20 alanlık motif listesi `docs/tasarim/gorsel-istemleri.md` 4.8'de.
Çizer teslim edince SVG'leri pratik bileşenine aktarmak pratik ajanınındır.
