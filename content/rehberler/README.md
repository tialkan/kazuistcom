# content/rehberler

Rehberler modülünün içeriği (plan 10.4, SRS FR-32..37). Her dosya bir görünümdür; şema
`apps/web/src/app/rehberler/_alan/sema.ts`. Dosyalar derleme zamanında `apps/web/src/app/rehberler/_veri/rehberler.ts`
içinden içe aktarılır ve zod ile doğrulanır; geçersiz dosya derlemeyi durdurur. Yeni dosya oraya da eklenir (test
eksiği yakalar).

| Dosya | İçerik |
|---|---|
| `makale.json` | 12 adım: açıklama, ipucu, isteğe bağlı bağlantı ve kaynak arama türü |
| `tez.json` | Monografi modeli, 12 adım (her biri bir dayanağa bağlı) ve doğrulama düzeyli kaynak listesi |
| `zotero-endnote.json` | Karşılaştırma tablosu, Zotero 8 adım, EndNote 6 adım, öneriler, okunan resmî belgeler |
| `kontrol-listesi.json` | 14 madde, "Makale ve tez" ya da "Yalnızca tez" etiketi, isteğe bağlı /tespit kural numarası |
| `etik.json` | YÖK yönergesi m. 4/1 altı ihlal: birebir tanım, kurgusal hukuk örneği, korunma yolu |

## Kurallar

- Şablon kaynak rehberi: "Hukuk Atlası: Makale ve Tez Yazım Rehberi" Word belgesi depoda yoktur
  (`docs/kaynak/Kazuist.docx` SRS'tir). Bu içerik o belgeden aktarılmadı; yalnız aşağıdaki doğrulanmış kaynaklardan
  yazıldı. Belge gelirse metinler karşılaştırılıp birleştirilir.
- Menü, düğme, sürüm, tarih ve rakam resmî belgeden alınır ve kaynak URL'si dosyada yazılıdır. Kitap dayanaklarında
  `dogrulama: "ikincil"` kitabın okunmadığını söyler; okunmayan kitap `birincil` yazılamaz (test zorlar).
- Uzun çizgi, orta çizgi, emoji ve `content/yasak-ifadeler.txt` ifadeleri yoktur (`scripts/check-text.mjs` ve test).
- Metinler `docs/tespit/yazim-kurallari.md` ile çelişmez; kontrol listesi maddeleri o kuralların numaralarına bağlanır
  (test numaraların var olduğunu doğrular).
- Zamana bağlı bilgi (sürüm adı, "son güncelleme", okuma tarihi) kaynak satırlarında durur ve yenilenir: Zotero ve
  EndNote sayfaları yeniden okunduğunda `okuma` ve `guncelleme` alanları birlikte güncellenir.
- Hukuktan örnekler kurgusaldır ve gerçek bir eseri, kararı ya da kişiyi göstermez.
