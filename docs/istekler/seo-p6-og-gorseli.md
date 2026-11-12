# İstek: Türkçe OpenGraph görseli (P6 madde 2)

Kimden: seo (dal codex/p6-seo). Kime: on-yuz (görsel ve tasarım sistemi) ve orkestra (görsel üretim kararı). Aciliyet: üretim açılmadan önce; paylaşım önizlemesi görselsiz çalışır ama zayıftır.

## Durum

`apps/web/src/app/(seo)/_seo/metadata.ts` OpenGraph temelini kurdu (`type: website`, `siteName: Kazuist`, `locale: tr_TR`, `twitter.card: summary`). Görsel alanı bilerek boş: depoda görsel yok. Görsel gelince alan doldurulur ve `twitter.card` `summary_large_image` olur.

## İstenen

1. Varsayılan paylaşım görseli: 1200 x 630 px, PNG, 300 KB altında. Dosya yolu önerisi `apps/web/public/og/varsayilan.png` (`public/og` hiçbir ajanın yolunda değil; orkestra sahibini belirler).
2. Metin yalnız Türkçe. İçerik: "Kazuist" adı ve amaç cümlesi "Hukuk kaynağını bulun, dayanağını görün, metninizi kurallarına uygun yazın." (`packages/i18n/tr/ortak.json` `amac`, birebir). Rakam, sayı iddiası ve kurum logosu yok.
3. Tasarım sistemine uygun: açık tema, kenar şerhi imzası, projenin yazı tipleri (`public/fonts`). YZ ile üretilmiş görsel, emoji ve yasaklı fontlar yok (K-15). Metin kontrastı WCAG AA.
4. İsteğe bağlı ikinci görsel: rehberler ve hukuki sayfalar için aynı ölçüde `rehberler.png`. Zorunlu değil.
5. Her görsel için Türkçe alternatif metin (`alt`), en çok 120 karakter; seo `openGraph.images[].alt` alanına yazar.

## seo tarafında yapılacak (görsel gelince)

- `temelMetadata` içine `openGraph.images: [{ url: '/og/varsayilan.png', width: 1200, height: 630, alt }]`; `metadataBase` mutlak adresi üretir.
- Sayfa kendi `openGraph` anahtarını yazarsa bütün anahtarı değiştirir; görselin yinelenmesi gerektiği sayfa sahiplerine bildirilir.
- Doğrulama: `curl -s https://kazuist.com/ | grep -o 'og:image[^>]*'` ve Facebook/LinkedIn paylaşım denetleyicisi (Tarık hesapla).
