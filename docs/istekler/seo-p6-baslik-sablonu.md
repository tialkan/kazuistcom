# İstek: sayfa başlıklarında çift "| Kazuist" eki (P6 madde 2)

Durum: kapandı (12 Kasım 2026). Orkestra aynı PR'da 24 sayfadaki elle yazılmış eki kaldırdı ve `casuistMetadata` başlığını `absolute` yaptı; yerel üretim derlemesinde `/ara`, `/rehberler/tez`, `/hukuki/uyari` başlıkları tek "| Kazuist" içeriyor, `/tr` arşiv başlığı değişmedi.

Kimden: seo (dal codex/p6-seo). Kime: orkestra (kök düzen) ve sayfa sahipleri (on-yuz, casuist, atif-agi, yazma, pratik, icerik, kimlik, odeme). Aciliyet: üretim açılmadan önce; staging noindex olduğu için arama sonucuna yansımaz, sekme başlığında görünür.

## Ne değişti

`apps/web/src/app/layout.tsx` artık `title: { template: '%s | Kazuist', default: 'Kazuist' }` kullanıyor (kaynak `app/(seo)/_seo/metadata.ts`). Next.js bu şablonu alt rotalardaki düz metin başlığa uygular. Aşağıdaki sayfalar başlığa "| Kazuist" ekini kendileri yazdığı için sekme başlığı "Başlık | Kazuist | Kazuist" olur. Başka ajanların yollarına dokunulmadı.

## Düzeltme biçimi (sayfa sahibi yapar)

Sayfadaki şablon dizgesinden (başlık, boşluk, dikey çizgi, `ortak().marka`) ek çıkarılır; geriye yalnız başlık kalır, örneğin `title: tr.meta.baslik`. Alternatif: ek bilerek kalacaksa `title: { absolute: '...' }` kullanılır; şablon bu durumda uygulanmaz.

## Elle "| marka" eki yazan sayfalar (çift ek oluşur)

| Dosya | Sahip |
|---|---|
| `apps/web/src/app/ara/page.tsx` | casuist |
| `apps/web/src/app/atif-agi/page.tsx` | atif-agi |
| `apps/web/src/app/kalemcik/page.tsx` | yazma |
| `apps/web/src/app/kaydettiklerim/page.tsx` | casuist |
| `apps/web/src/app/tespit/page.tsx` | yazma |
| `apps/web/src/app/yazma/page.tsx` | yazma |
| `apps/web/src/app/yazma/sablon/page.tsx` | yazma |
| `apps/web/src/app/yazma/dergiler/[slug]/page.tsx` | yazma |
| `apps/web/src/app/pratik/page.tsx` | pratik |
| `apps/web/src/app/pratik/bugun/page.tsx` | pratik |
| `apps/web/src/app/pratik/editor/page.tsx` | pratik |
| `apps/web/src/app/pratik/hmgs/page.tsx` | pratik |
| `apps/web/src/app/pratik/hmgs/deneme/page.tsx` | pratik |
| `apps/web/src/app/pratik/deste/[slug]/page.tsx` | pratik |
| `apps/web/src/app/rehberler/page.tsx` | icerik |
| `apps/web/src/app/rehberler/makale/page.tsx` | icerik |
| `apps/web/src/app/rehberler/tez/page.tsx` | icerik |
| `apps/web/src/app/rehberler/zotero-endnote/page.tsx` | icerik |
| `apps/web/src/app/rehberler/kontrol-listesi/page.tsx` | icerik |
| `apps/web/src/app/rehberler/etik/page.tsx` | icerik |
| `apps/web/src/app/(kabuk)/fiyatlar/page.tsx` | on-yuz |
| `apps/web/src/app/(kabuk)/bakim/page.tsx` | on-yuz |
| `apps/web/src/app/(kabuk)/hukuki/page.tsx` | on-yuz |
| `apps/web/src/app/(kabuk)/hukuki/[belge]/page.tsx` | on-yuz |

## Başka biçimde çift veya tutarsız başlık

- Korunan Casuist sayfaları: başlıklar arşiv metninden gelir ve "... | Casuist" ile biter (`(casuist)/_icerik/*.json`, `casuistMetadata`). Şablonla "... | Casuist | Kazuist" olur. Öneri: arşiv başlığı değişmeden kalacaksa `casuistMetadata` içinde `title: { absolute: s.title }` (on-yuz). Karar on-yuz ve orkestranın.
- Ana sayfa `apps/web/src/app/page.tsx` etkilenmez: kök layout ile aynı segmentte olduğu için Next.js şablonu uygulamaz; yerel üretim derlemesinde başlık "Kazuist: hukuk kaynağını bulun, dayanağını görün" olarak kaldı.

## Ek eklenmesi doğru olanlar (değişiklik gerekmez)

Başlığa ek yazmayan hesap, giriş, kayıt ve ödeme sayfaları (`(hesap)/**`, `(odeme)/**`) şablonla "Başlık | Kazuist" olur; bunlar noindex'tir ve yalnız sekme başlığını etkiler.

## Doğrulama

Çift ek yerel üretim derlemesinde doğrulandı (`/ara`, `/rehberler/tez`, `/hukuki/uyari` başlıkları "... | Kazuist | Kazuist"). Düzeltmeden sonra `pnpm build` ve bir sayfanın `<title>` değeri `curl -s http://localhost:3000/ara | grep -o '<title>[^<]*'` ile bir kez "| Kazuist" içermelidir.
