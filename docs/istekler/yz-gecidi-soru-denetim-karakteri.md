# İstek: kaynaklı özet sorusunda denetim karakterleri sözleşmede reddedilsin

Kimden: yz-gecidi (dal `yz-gecidi/butce-byok-baglama`). Kime: mimar. Tarih: 15 Kasım 2026.

## Gerekçe

review.md P8.5 ve plan 8.5: soru ve pasajlar tek etiket uzayında maskelenirken iç ayırıcı (`\u0000\u0001`)
kullanılıyor. Soru bu ayırıcıyı taşıdığında pasajlar kayıyordu. Geçit artık denetim karakterlerini maskelemeden
önce siliyor (`scrubParts`) ve web ucu bunları içeren soruyu 400 ile reddediyor
(`apps/web/src/app/ara/_sunucu/ozet.ts` `hasControlChars`, `POST /v1/answers` ve `POST /v1/answers/prepare`).
Kural şu an yalnız uç kodunda; OpenAPI ve üretilen istemci bunu bilmiyor, iOS ve başka istemciler 400'ün
nedenini sözleşmeden okuyamıyor.

## Önerilen değişiklik

`packages/contracts/src/schemas.ts` içinde `AnswerRequest.q` ve `PrepareRequest.q` için aynı kural:

```ts
// C0 denetim karakterleri (sekme, satır sonu ve satır başı hariç) ve DEL
const SoruMetni = z
  .string()
  .min(3)
  .max(1000)
  .refine((q) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(q), {
    message: 'q must not contain control characters',
  });
```

OpenAPI `AnswerRequest.q` ve `PrepareRequest.q` için `pattern: '^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$'`.
`SearchQuery.q` için de aynı kural düşünülebilir (arama sorgusu ayırıcı kullanmıyor; zorunlu değil).

## Geriye uyumluluk

Davranış değişmez: uçlar bu soruları zaten 400 ile reddediyor. Sözleşme gelince `hasControlChars` denetimi
şemaya taşınır ve uçtaki ek satır kalkar. Migration yok.

## Aciliyet

Düşük. Güvenlik açığı uç kodunda ve geçitte kapalı; istek yalnız sözleşmenin gerçeği söylemesi içindir.

## Sonuç (mimar, 15 Kasım 2026, sözleşme v1.6, ADR-0038)

Kabul. `QuestionText` (`packages/contracts/src/schemas.ts`, desen `QUESTION_TEXT_PATTERN`) `AnswerRequest.q` ve
`PrepareRequest.q` için ortak; OpenAPI'de `QuestionText` şeması aynı `pattern`'i taşır ve iki gövde ona başvurur.
Sözleşme testi zod ile OpenAPI desenini her C0 karakteri ve DEL için karşılaştırır. `SearchQuery.q`'ya kural
eklenmedi (bugün kabul edilen sorguları reddederdi). Uçtaki `hasControlChars` satırının kaldırılması casuist'e
yönlendirildi; geçitteki `scrubParts` silmesi kalır.

## Uygulama (casuist, 15 Kasım 2026, dal `casuist-contract-1-6-filters`)

`hasControlChars` ve ek satır `ozet.ts`'den kaldırıldı; iki uçta 400 testi (`ozet.test.ts`, NUL, BEL, DEL; sekme ve
satır sonu 200) ve BYOK uçtan uca testindeki ayırıcı reddi kaldı ve geçiyor. `scrubParts` değişmedi.
