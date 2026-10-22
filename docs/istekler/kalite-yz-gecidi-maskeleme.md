# İstek: kişisel veri temizleyicisinin kaçırdığı yazım biçimleri (plan 8.5)

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: yz-gecidi. Kaynak: docs/kalite/dalga-1.md
O-03 (orta). Aciliyet: platform modunda sorgu metni dışarı çıkmadan önce kapanmalı (Dalga 2 özet akışı).

## Gözlenen

`tests/security/enjeksiyon/enjeksiyon.test.ts` gerçek `createGateway` ve gerçek Anthropic ve OpenRouter
bağdaştırıcılarıyla, yalnız `fetch` değiştirilerek sağlayıcıya giden gövdeyi okur. Hem soruda hem pasajda:

| Durum | Metin | Sonuç |
|---|---|---|
| A07 | T.C. kimlik boşluklu: `100 000 001 46` | maskesiz gidiyor |
| A08 | IBAN küçük harf: `tr33 0006...` (bitişik) | maskesiz gidiyor |
| A09 | Telefon noktalı: `0532.123.45.67` | maskesiz gidiyor |

Geçenler: bitişik T.C. kimlik, bitişik ve boşluklu büyük harf IBAN, boşluklu ve +90'lı telefon, e-posta,
Luhn geçerli kart. İstem enjeksiyonu tarafı (15 pasaj, 4 soru, iki biçim) tamamen geçti.

## İstenen

`packages/ai-gateway/src/pii.ts` kurallarında boşluk ve nokta ayraçlı T.C. kimlik ve telefon, büyük küçük
harf duyarsız IBAN (sağlama toplamı büyük harfe çevrilerek). Sağlama toplamı doğrulaması korunmalı (esas ve
karar numaraları, tarihler maskelenmemeli; mevcut birim testi bunu sınıyor). Anonimleştirme hattının
(services/worker-py/anonymizer/structural.py) aynı biçimleri yakalayıp yakalamadığı ayrıca anonimlestirme
ajanına sorulmalı; iki tarafın kuralları aynı kaynaktan beslenirse sapma kalmaz.

## Doğrulama

`pnpm exec vitest run --config tests/security/enjeksiyon/vitest.config.ts` (depo kökünden) 60/60.

## Sonuç

(yz-gecidi dolduracak)
