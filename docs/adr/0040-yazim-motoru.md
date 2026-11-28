# ADR-0040: Yazım motoru (`/kazu`)

- Tarih: 2026-11-28
- Karar kodu: yok
- Kaynak: Tarık'ın 28 Kasım 2026 onayı; iki modelin karşılaştırmalı önerisi (sohbet kaydı)
- Durum: Kabul edildi (28 Kasım 2026, Tarık). Uygulama ayrı PR'larla gelir.
- İlgili kararlar: ADR-0032 (yalnız Türkçe), mevcut yazma modülü (`apps/web/src/app/yazma`), worker-py `docxcheck`

## Bağlam

1. Her yazım işi `kazuist.com/kazu` adresinde başlar. Ekran alışılmış, sade bir metin aracıdır (Word ya da Google
   Docs benzeri); sahne, doku ve gösteriş yoktur. Kullanıcı LaTeX ya da kod görmez.
2. Kazu (danışman) metni bölüm, paragraf ve atıf düzeyinde anlamalıdır; düz metin yetmez.
3. Çıktı dergi ve üniversite şablonlarına uyan .docx ve PDF'tir. Depoda `docx` ile şablon üreten bir modül
   (`yazma/_cekirdek/docx-uret.ts`), yazma projesi şeması (`packages/db/src/schema/writing.ts`) ve LibreOffice
   ile belge denetleyen bir işçi modülü (`services/worker-py/docxcheck/libreoffice.py`) vardır.
4. Değerlendirilen seçenekler: editör için Tiptap, ProseMirror, Lexical, Slate; çıktı için `docx`, Pandoc,
   LibreOffice, Typst, LaTeX; önizleme için editör içi sayfalama, Paged.js ve aynı PDF'nin gösterilmesi.

## Karar

1. **Editör:** Tiptap çekirdeği (MIT), Next.js içinde istemci bileşeni. Ücretli Tiptap Pages ve Conversion
   kullanılmaz. Uzun tezlerde yalnız açık bölüm düzenlenir; bölüm gezgini vardır.
2. **Belge modeli:** Kazuist şemasına uyan ProseMirror JSON'u doğruluk kaynağıdır. PostgreSQL'de proje altında
   sıralı bölümler ve `jsonb` gövdeler tutulur; her bölüm ve paragrafın kalıcı kimliği, her kaydın sürümü vardır.
   Başlık, paragraf, dipnot, tablo, şekil, şekil açıklaması, atıf ve çapraz referans ayrı düğüm türleridir.
3. **Kaynakça:** Zotero'dan CSL JSON, BibTeX ve RIS içe alınır ve CSL JSON'a normalleştirilir. Biçimlendirmeyi
   sunucuda Pandoc Citeproc yapar (APA, Chicago, İSNAD dipnotlu ve metin içi). Pandoc ayrı süreç olarak çalışır.
4. **Word çıktısı:** Mevcut `docx` üreticisi (MIT) genişletilir. Dergi ve üniversite profilleri sürümlü, testli
   kural paketleridir.
5. **PDF ve önizleme:** Üretilen .docx, işçide LibreOffice ile (sabit fontlarla) PDF'ye çevrilir. Ekrandaki
   "Baskı görünümü" indirilecek PDF'nin aynısıdır; PDF.js (Apache-2.0) yalnız görünür sayfaları çizer. İş,
   kullanıcı yazmayı bırakınca arka planda başlar, eski bekleyen işler elenir; yazım dönüşümü beklemez.
6. **Kazu:** İstekte ilgili bölüm, seçili paragraf, komşu bağlam ve bağlı kaynaklar gider. Öneri hedef paragraf
   kimliğini ve belge sürümünü taşır; kullanıcı kabul eder, geri alabilir. Dış YZ sağlayıcısına giden metin
   CLAUDE.md "Güvenlik" kuralına uyar.
7. **LaTeX:** Yalnız zorunlu `.cls` isteyen bir profil gelirse o profil için arka uçta `.tex` üretimi eklenir.
8. **Typst** bu sürümde kullanılmaz (ikinci sayfa düzeni bakımını önlemek için).

## Lisanslar

Tiptap çekirdeği MIT, ProseMirror MIT, `docx` MIT, PDF.js Apache-2.0, LibreOffice MPL-2.0, Pandoc
GPL-2.0-or-later (ayrı süreç; uygulamaya bağlanmaz). AGPL ya da SSPL bileşen yoktur.

## Sonuçlar

- İlk dilim: bir makale ve bir tez şablonu uçtan uca. Kabul: bölüm taşınınca çapraz referans ve numaralar
  güncellenir; aynı Zotero kaynakları APA ve İSNAD'a doğru biçimlenir; tezde Roma rakamlarından Arap rakamlarına
  geçilir; önizlemedeki PDF indirilenle aynıdır.
- İşçi imajına LibreOffice ve sabit fontlar, Pandoc eklenir (altyapı).
- Uzun tezlerde PDF önizlemesi birkaç saniye gecikebilir; son başarılı PDF ekranda kalır.
