# Yönlendirme: casuist, kampus ve seo ajanlarına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: casuist, kampus, seo. Dayanak: ADR-0023, istekler
`hukuk-uyum-kaldirma-talebi.md`, `anonimlestirme-etiketleme-adr.md` (ek not), `hukuk-uyum-urun-tutarliligi.md`
(madde 7).

## casuist

1. Arama, kayıt sayfası, ağ ve dışa aktarım yalnız `records.masked_text` okur; `masked_text IS NULL` veya
   `hidden_at IS NOT NULL` olan kayıt sonuçlara ve sayfalara girmez. Ham `records.text` hiçbir uçtan dönmez.
2. Arama sorgularının hesapla ilişkilendirilerek saklanıp saklanmadığı (madde 7) yazılı karar olarak
   belgelensin; App Privacy "Search History" cevabı (ios) buna bağlıdır.

## kampus

`kampus.posts.hidden_at` ve `kampus.files.hidden_at` dolu satırlar akışta, profilde ve dosya indirmede
gösterilmez; paylaşan kullanıcıya bildirim ve itiraz yolu (kaldirma.md madde 3/5).

## seo

Site haritası `hidden_at` dolu veya `masked_text` boş kayıtları içermez; gizlenen sayfa 404 veya 410 döner
(on-yuz ile birlikte karar).

## Aciliyet

Dalga 2 modül işleriyle birlikte.
