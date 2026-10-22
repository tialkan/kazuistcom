# İstek: oturumlu uçların üretimde 500 dönmesi, giriş formları, iç hata logu

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: kimlik. Kaynak: docs/kalite/dalga-1.md
K-01 (kritik), O-01, O-08, D-05. Aciliyet: K-01 Dalga 1 kapısını ve ödeme uçlarını bloke ediyor.

## K-01 (kritik): `flatParams` statik rotalarda TypeError atıyor

- Yer: `apps/web/src/server/auth/guard.ts:40-43`. Next.js 16 statik rotada handler'a `{ params: undefined }`
  verir (`node_modules/next/dist/server/route-modules/app-route/module.js:302`). `route ? await route.params
  : {}` `undefined` döner, `Object.entries(undefined)` atar, `withAuth` yutar ve 500 `internal` döner.
- Yeniden üretme: üretim derlemesi (`pnpm build`, standalone) ve gerçek PostgreSQL ile kayıt ol, bearer ile
  `GET /api/v1/me` çağır: 500. Aynı durum `/v1/me/*`, `/v1/kvkk-requests`, `/v1/wallet`, `/v1/wallet/ledger`,
  `/v1/invoices`, `/v1/checkout/*`, `/v1/refund-requests` ve `withAuth` ile sarılı diğer statik uçlarda.
- Beklenen: 2xx (sözleşme). Kalite tarafında satır 41'in `(route?.params ? await route.params : undefined)
  ?? {}` biçimine yerelde geçici çevrilmesi tüm bu uçları 200 yaptı (değişiklik dala girmedi).
- İstenen: düzeltme ve handler'ları gerçek Next.js bağlamıyla (`{ params: undefined }` ve
  `{ params: Promise }`) çağıran birim testi. `withPublic` için de aynı denetim.
- Doğrulama: `tests/security/http/yetki-idor.spec.ts` ve `tests/e2e/specs/hesap.spec.ts` API akışı yeşil olmalı.

## O-01 (orta): /kayit ve /giris'te form yok; iç içe main

- `apps/web/src/app/(hesap)/{kayit,giris,hesap,...}/page.tsx` yalnız başlık ve açıklama basıyor; e-posta,
  parola, e-posta kodu ve passkey akışları arayüzde yok. Gate "giriş çalışır" kullanıcı için arayüzden
  kayıt ve giriş demektir.
- Sayfalar kendi `<main>`'ini açıyor; kabuk zaten `<main id="icerik">` basıyor (DEVIR, on-yuz notu: "modül
  sayfası kendi main'ini açmaz"). axe: landmark-main-is-top-level, landmark-no-duplicate-main.
- Doğrulama: `tests/e2e/specs/hesap.spec.ts` UI testleri (etiketler "E-posta", "Parola", düğme "Giriş" ve
  "Kayıt/Hesap oluştur/Devam") ve `sayfalar.spec.ts` "exactly one main landmark".

## O-08 (orta): iç hata loglanmıyor

- `guard.ts:110-112` `catch { return apiError('internal') }`. requestId istemciye gidiyor ama sunucuda
  kayıt yok; K-01 logdan bulunamadı. Plan 14.7: yapılandırılmış log. İçerik ve kişisel veri yazmadan hata
  adı, uç ve requestId loglanmalı (GlitchTip'e de bu düzeyde).

## D-05 (düşük): IP okunamazsa ortak kova

- `rate-limit.ts:98-109` IP bulunamazsa `unknown` döndürüyor; tüm istemciler tek kovada. Üretimde Traefik
  X-Real-Ip yazar; yine de `unknown` için ayrı ve daha dar bir politika (ör. 503 ve log) düşünülmeli.

## Sonuç

Kimlik, dal `dalga-1/kimlik/kapi`, 2026-10-22.

- K-01: `guard.ts` `flatParams` `{ params: undefined }` ve `{ params: Promise }` ikisini de kabul ediyor;
  `withPublic` da rota bağlamını alıyor ve hatayı yakalıyor. `__tests__/next-context.test.ts` rota
  modüllerini Next.js 16 çağrı biçimiyle çağırıyor (200, 401, 201, dinamik parametre). Üretim derlemesi
  (standalone, PostgreSQL 18, Redis) karşısında `tests/e2e/specs/hesap.spec.ts` 4/4 ve
  `tests/security/http/yetki-idor.spec.ts` 30 geçti, 1 atlandı (tohumlu ödeme satırı).
- O-01: /kayit ve /giris'te e-posta ve parola formu (`(hesap)/_bilesen/HesapFormu.tsx`); hesap sayfaları
  kendi `<main>`'ini açmıyor (section). E-posta kodu ve passkey düğmeleri on-yuz bileşenleriyle gelecek.
  /hesap/hedef iskeleti eklendi (kabuktaki bağlantı 404'tü).
- O-08: `internalError` hata sınıfı, yöntem, yol ve requestId'yi tek satır JSON olarak logluyor; gövde, sorgu
  ve kişisel veri yazılmıyor; aynı requestId istemciye dönüyor (testli).
- D-05: IP okunamazsa kova `<kural>-unknown`, sınırın onda biri; olay uyarı olarak loglanıyor (testli).

