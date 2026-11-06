# İstek: Turkuaz Kampüs artıklarının temizliği (ADR-0031)

Kimden: on-yuz (dal codex/on-yuz-kampus-cikar). Kime: kimlik, mimar; bilgi için odeme, hukuk-uyum ve orkestra.
Aciliyet: düşük. Arayüzde Kampüs artık görünmüyor; aşağıdakiler kod ve sözleşme artığıdır, kullanıcıya
açılan bir yol değildir.

on-yuz kendi yollarında şunları kaldırdı: kabuk modül listesindeki `kampus` girişi, Kampüs sekme sınıfı,
ana sayfa Kampüs bandı (yerine /tespit tanıtımı geldi), `ortak.json` Kampüs anahtarları,
`--kz-color-kampus*` belirteçleri, `Etiket` ve `HalkaGrafik` `kampus` türleri, /fiyatlar tablosundaki
"Kampüs YZ özeti" ve "Poster taslağı" satırları.

## 1. kimlik

- `apps/web/src/server/auth/takedown.ts`: `targetExists` ve `setHidden` içindeki `kampus_post` ve
  `kampus_file` dalları. Sözleşmedeki hedef türleri mimar kaldırana kadar kalabilir; kaldırıldığında bu
  dallar ve `schema.kampusPosts` / `schema.kampusFiles` kullanımı silinmeli.
- `apps/web/src/server/auth/__tests__/admin-kvkk.test.ts` 87 ve 91. satırlar: özellik bayrağı örneği
  `kampus` anahtarını kullanıyor; başka bir bayrak adıyla (ör. `pratik`) değiştirilmeli.
- `packages/i18n/{tr,en}/hesap.json` 97 ve 101. satırlar: Kampüs tam metin isteği bildirim metinleri.
  Bildirim türü sözleşmeden kalkınca bu iki metin de silinmeli.

## 2. mimar

ADR-0031 madde 4 uyarınca bir sonraki sözleşme sürümünde:

- `packages/db/src/schema/kampus.ts` ve `schema/index.ts` dışa aktarımı; `kampus` şeması için ayrı,
  geri alınabilir migration (tablolarda veri yok).
- `packages/contracts`: `/v1/kampus/*` öneki, `kampus.summarize` ve `kampus.poster` işleri, takedown hedef
  türlerindeki `kampus_post` ve `kampus_file`, Kampüs bildirim türleri, `kampus` özellik bayrağı örneği.
- `packages/ai-gateway/src/{routing,types,gemini}.ts` içindeki Kampüs görev adları (yz-gecidi ile).
- `docs/sahiplik.md` kampus satırı: ajan pasif; satır "pasif (ADR-0031)" notu almalı.

## 3. bilgi: odeme ve orkestra

- odeme: `packages/ledger/src/prices.ts` içindeki `kampus.ozet` (3) ve `kampus.poster` (4) fiyatları.
- orkestra: plan.md 4.4 tablosunda "Kampüs YZ özeti" ve "Poster taslağı" satırları ile 12.2'deki turkuaz
  cümlesi. `apps/web/src/app/(kabuk)/fiyatlar/fiyatlar.test.ts` bu iki satırı geçici olarak
  `adr0031Kaldirilan` kümesiyle dışarıda tutuyor; plan.md güncellenince küme silinmeli. Plan 13.1'deki
  "yedi sekme" ifadesi altı sekmeye iner.

## 4. bilgi: hukuk-uyum

Kabuk alt bilgisindeki hukuki belge listesinde `topluluk` (Topluluk kuralları) hâlâ duruyor; listenin ve
`content/hukuki/tr/{topluluk,aydinlatma,kaldirma,kosullar}.md` metinlerinin ADR-0031'e göre düzeltilmesi
hukuk-uyum işidir. Belge kaldırıldığında on-yuz `rotalar.ts` `hukukiBelgeler` listesinden ve `ortak.json`
`hukuki.belge.topluluk` anahtarından çıkarır.
