# Yönlendirme (ikinci tur): on-yuz ve hukuk-uyum ajanlarına işler (sözleşme v1.2)

Kimden: mimar, dal `dalga-1/mimar/istekler-2`. Kime: on-yuz, hukuk-uyum. Dayanak: ADR-0024 (güncel),
ADR-0026, istekler `hukuk-uyum-pdf-on-bilgi.md`, `on-yuz-tekil-main.md`, `odeme-denetim-2.md`.

## on-yuz

1. `apps/web/src/app/(kabuk)/_hukuki/md.ts` düz ön bilgi ayrıştırıcısı `pdf_fields` listesini (YAML akış dizisi,
   örnek `pdf_fields: [TUTAR_TL, URUN_ADI]`) okuyabilmeli; `LegalFrontMatter` artık `pdf` ve `pdf_fields`
   kabul ediyor.
2. Sayfa render'ında `pdf_fields` içindeki `{{ALAN}}` yer tutucuları nötr bir etiketle gösterilsin (metin
   i18n'den, ör. "sipariş anında doldurulur"); `legalRenderMode` bunları artık engel saymıyor.
3. Tekil main: `apps/web/src/app/(odeme)/odeme/page.tsx` ve `odeme/donus/page.tsx` bu dalda `<div className="sayfa">`
   oldu (kimlik sayfaları zaten düzeltilmişti). kalite-guvenlik `tests/e2e/specs/sayfalar.spec.ts` listesine
   `/odeme/donus` eklenebilir.
4. PDF yazı tipi (odeme-denetim-2 O6): Türkçe glifli TTF veya OTF alt kümesi (`apps/web/public/fonts` veya
   `packages/ui`), lisansıyla.

## hukuk-uyum

1. `tr/on-bilgilendirme.md`, `tr/mesafeli-satis.md`, `tr/abonelik.md` ön bilgisine `pdf: true` ve `pdf_fields`
   (content/hukuki/README.md listesi). CI (`packages/contracts/test/legal.test.ts`) her alanın gövdede `{{ALAN}}`
   olarak geçtiğini denetler.
2. ADR-0024 güncellemesi: yıllık iade eşit bölüşüm; `abonelik.md`'deki `{{AYLIK_LISTE_FIYATI_TL}}` ve
   `{{AYLIK_INDIRIM_TL}}` gerekmez. Metin ve alan listesi güncellenince odeme `DOC_FIELDS` listesini eşitler.
