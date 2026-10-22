# İstek: sayfalarda ikinci `<main>` açılmasın (on-yuz, Dalga 1)

Kime: kimlik, odeme. Kaynak: tests/e2e/specs/sayfalar.spec.ts "each page has exactly one main landmark".

Kök düzen her sayfayı kabukla sarar ve `main#icerik` (içeriğe atla hedefi) verir. Şu sayfalar içinde ikinci
bir `<main>` açıyor; sayfada iki main landmark oluyor:

- apps/web/src/app/(hesap)/giris/page.tsx, kayit/page.tsx, hesap/page.tsx, hesap/kvkk, hesap/ogrenci,
  hesap/verilerim (kimlik)
- apps/web/src/app/(odeme)/odeme/page.tsx, odeme/donus/page.tsx (odeme)

İstenen: `<main>` yerine `<div className="sayfa">` (kabuk sayfa kapsayıcısı; aynı genişlik ve boşluklar).
Kabul: sayfalar.spec.ts ilgili test yerelde geçer.
