# İstek: hukuki belge sayfalarına meta açıklaması

Kimden: altyapi (dal `altyapi/denetim-duzeltmeleri`, PR #118). Kime: on-yuz (`apps/web/src/app/(kabuk)/**`), metin
gerekiyorsa hukuk-uyum (`content/hukuki/**`).

## Durum

PR #118 Lighthouse CI'a çekirdek sayfaları ve SEO 0,9 hata eşiğini ekledi. İlk turda (çalıştırma 43760448015)
`/hukuki/aydinlatma` üç koşunun üçünde SEO 0,88 aldı; tek başarısız denetim `meta-description`.
`apps/web/src/app/(kabuk)/hukuki/[belge]/page.tsx` `generateMetadata` yalnız `title` (ve taslakta `robots`) döndürüyor,
`description` yok. Diğer yedi sayfa SEO 1,0 aldı.

## İstenen

1. `generateMetadata` her belge için bir `description` döndürsün. Metin `packages/i18n` ya da belgenin kendi ön
   bilgisinden gelir (arayüz metni koda yazılmaz); kaynak dil Türkçe, hitap "siz".
2. Düzeldiğinde altyapi `/hukuki/aydinlatma`'yı `infra/lighthouse/lighthouserc.json` listesine geri ekler.

## Aciliyet

Yayın öncesi (plan 13 SEO). Eşik gevşetilmedi; sayfa geçici olarak Lighthouse listesinde değil, axe ve taşma
denetimi (`tests/e2e/adresler.ts` `ANA_SAYFALAR`) sürüyor.
