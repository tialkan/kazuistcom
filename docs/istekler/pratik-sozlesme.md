# pratik: sözleşme ve şema isteği (mimar)

Tarih: 7 Kasım 2026. İsteyen: pratik. Kapsam: plan 10.6 ve Ek C. Mimar ADR ile karar verir; pratik bu dosyadaki
hiçbir yolu kendisi değiştirmedi.

## Şimdi nasıl çalışıyor

Kartlar `content/desteler/*.json` dosyalarındadır ve derleme sırasında zod şemasıyla doğrulanır
(`apps/web/src/app/pratik/_alan/kart.ts`). İlerleme (FSRS durumu, günlük sayaçlar, seri, deneme geçmişi) kullanıcının
tarayıcısında (`localStorage`, anahtar `kazuist.pratik.v1`) durur. Sunucuya yalnız iki okuma ucu bağlıdır:
`GET /api/v1/decks` ve `GET /api/v1/decks/{id}/cards`. Veri tabanındaki `decks`, `cards`, `card_versions`,
`card_reviews`, `exams`, `exam_attempts` tablolarına henüz yazılmaz ve okunmaz.

## İstek 1: Card şeması (openapi.yaml components.schemas.Card)

Mevcut `kind` sıralaması (`bilgi, coktan_secmeli, dogru_yanlis, eslestirme`) dört oyunu taşımaz. Uç şu an ek alanlar
döndürüyor (şema `additionalProperties` yasaklamıyor): `oyun` (`olay_karti | hala_gecerli_mi | dogru_yanlis |
hangisi_once`), `dogruIndex`, `kanun[{ref, metin}]`, `baglantilar[{etiket, url}]`, `kaynakKayitIdleri[]`, `zorluk`,
`hmgsAlani`, `surum`. İstek: bu alanları şemaya yazın ve `kind` yerine `oyun` kullanın. `Deck.id` ve `Card.id`
içerik kimliğinden türetilen sürüm 5 UUID'dir (`kartUuid` ve `desteUuid`).

## İstek 2: kart alanları veri tabanında

Plan 10.6/1 alanları `cards` ve `card_versions` tablolarında yok:

- `cards.hmgs_alani text null`, `cards.zorluk smallint`, `cards.kaynak_kayit_idleri text[]` (anahtar
  `mevzuat:<kanunNo>:m<madde>`, çözümleme `records.source_key`).
- `card_versions.oyun`, `card_versions.choices` zaten var; `answer` yerine `answer_index smallint` ve `explanation text`,
  `sources jsonb` (kanun, madde, birebir alıntı, doğrulama tarihi, madde özeti) gerekir.
- İki editörlü onay için yeni tablo `card_approvals (card_id, version, editor_id, decided_at, note)` ve
  `unique (card_id, version, editor_id)`. Yayın koşulu: HMGS kartlarında en az iki farklı editör, diğerlerinde bir;
  yazar kendi kartını onaylayamaz (şu an `onay.ts` kuralı).
- `review_queue` (`cards` kuyruğu) payload'ı: `{ cardId, version, kaynakOzeti }`; `adminDecideQueueItem` kararını
  `card_approvals` satırına çevirmek pratik tarafındadır.

## İstek 3: istemci ilerlemesinin sunucuya eşlenmesi (isteğe bağlı, 1.0 sonrası olabilir)

`POST /v1/reviews`, `GET /v1/hmgs/exams`, `POST /v1/hmgs/exams/{id}/attempts`, `GET /v1/hmgs/report` sözleşmede var,
uygulanmadı: ilerleme cihazda tutulduğu için gerek duyulmadı. Hesapla eşleme istenirse `card_reviews` zaten ts-fsrs
alanlarını taşır (`stability`, `difficulty`, `elapsed_days`, `scheduled_days`, `reps`, `lapses`, `state`,
`last_review`); `learning_steps` gerekmez, çünkü zamanlayıcı dakika düzeyinde adım kullanmaz
(docs/istekler/pratik-ts-fsrs.md). Deneme sunucuda puanlanacaksa cevaplar sunucuda tutulmalı; şu an istemci puanlar
(kendi kendine çalışma, kaygı yok).
