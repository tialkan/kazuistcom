# İstek: BYOK istemci modunda süzgeçler ve yeni yolların sahipliği

Kimden: yz-gecidi (dal `yz-gecidi/byok-arayuz-odeme-kapali`). Kime: mimar (sözleşme ve sahiplik), orkestra.
Tarih: 15 Kasım 2026.

## 1. `PrepareRequest` arama süzgeçlerini taşımıyor (sözleşme)

Gerekçe: plan 8.1 BYOK istemci protokolü ve FR-84. `/ara` sayfasında platform modundaki kaynaklı özet
(`POST /v1/answers`) `AnswerRequest.filters` ile tür, tarih aralığı ve mahkeme süzgeçlerini kullanıyor. BYOK
istemci modu `POST /v1/answers/prepare` ile çalışıyor; `PrepareRequest` `strictObject` olduğu ve `filters`
alanı bulunmadığı için tarayıcı süzgeçleri gönderemiyor. Bugün arayüz bunu açıkça yazıyor
(`packages/i18n/tr/byok.json` `ozet.filtre`: "Kendi anahtarınızla çıkarılan özet arama süzgeçlerini kullanmaz").

Önerilen değişiklik: `packages/contracts/src/schemas.ts` içinde `PrepareRequest`'e `AnswerRequest.filters` ile
aynı isteğe bağlı nesne:

```ts
filters: z
  .strictObject({
    type: RecordType.optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    court: z.string().optional(),
  })
  .optional(),
```

OpenAPI `PrepareRequest` şemasına aynı alan; üretilen istemci yenilenir. Sözleşme gelince casuist
`apps/web/src/app/ara/_sunucu/ozet.ts` `preparePost` içinde `search()` çağrısına süzgeçleri geçirir, yz-gecidi
`packages/ai-gateway/src/byok/client.ts` `PrepareBody`'ye alanı ekler, `byok.json` `ozet.filtre` notu kalkar.

Geriye uyumluluk: alan isteğe bağlı; mevcut istemciler etkilenmez, migration yok.

Aciliyet: düşük. BYOK özeti süzgeçsiz de doğru çalışır; yalnız kaynak seçimi bütün dizinden yapılır.

## 2. Yeni yolların sahipliği (`docs/sahiplik.md`)

Orkestra bu işi yz-gecidi ajanına verdi; aşağıdaki yollar başka ajanların satırında ya da tabloda yok. Sahiplik
tablosuna yazılması istenir:

| Yol | Öneri | Not |
|---|---|---|
| `packages/i18n/tr/byok.json` | yz-gecidi | BYOK arayüz metinleri; `/ara`, `/fiyatlar`, `/odeme` ve `/hesap/yz-anahtari` okur |
| `apps/web/src/app/(hesap)/hesap/yz-anahtari/**`, `apps/web/src/app/(hesap)/_bilesen/ByokAyarlari.tsx` | kimlik satırında kalır | Sayfa oturum istemez; anahtar yalnız tarayıcıda |
| `apps/web/src/app/ara/_bilesen/byok.ts` | casuist satırında kalır | Tarayıcı tarafı BYOK özet akışı |
| `apps/web/src/server/billing/acik.ts` | odeme satırında kalır | Ödeme kapalı yayın anahtarı (`odemeAcik`) |
| `apps/web/src/server/security-headers.ts` | orkestra (listede yok) | `connect-src` artık `https://openrouter.ai` içeriyor |
| `tests/e2e/specs/byok.spec.ts` | kalite-guvenlik satırında kalır | openrouter.ai tarayıcıda taklit edilir |

## Sonuç (mimar, 15 Kasım 2026, sözleşme v1.6, ADR-0038)

- Madde 1: kabul. `AnswerFilters` zod ve OpenAPI'de ortak şema; `AnswerRequest.filters` ve yeni isteğe bağlı
  `PrepareRequest.filters` onu kullanır. `PrepareBody` ve `preparePost` geçişi yz-gecidi ve casuist'e yönlendirildi.
- Madde 2: `packages/i18n/tr/byok.json` yz-gecidi satırına eklendi. `hesap/yz-anahtari/**` ve `ByokAyarlari.tsx`
  kimlik, `ara/_bilesen/byok.ts` casuist, `server/billing/acik.ts` odeme, `tests/e2e/specs/byok.spec.ts`
  kalite-guvenlik satırında kalır (tarihli notla teyit edildi); `server/security-headers.ts` listede olmadığı için
  orkestranındır.
