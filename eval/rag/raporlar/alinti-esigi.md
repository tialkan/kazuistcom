# Alıntı uzunluğu eşiği (2026-11-07)

Set rag-50-2026-11-07, 36 cevaplı soru, standart seçim. Komut: `node eval/rag/alinti.ts --yaz`.
Her pasaj gövdesinde her kelimeden başlayan en kısa geçerli alıntı denendi. En kısa pasaj gövdesi 12 karakter.

| Eşik (karakter) | Denenen alıntı | Aynı istemde başka pasajda da geçen | Alıntılanamayan pasaj | Künyesi tek başına yeterli pasaj |
|---|---|---|---|---|
| 12 | 39609 | 5753 (%14.5) | 0/415 | 415/415 |
| 16 | 39415 | 3941 (%10.0) | 2/415 | 415/415 |
| 20 | 39238 | 2574 (%6.6) | 2/415 | 415/415 |
| 24 | 39035 | 1981 (%5.1) | 4/415 | 415/415 |
| 32 | 38587 | 1453 (%3.8) | 5/415 | 415/415 |

Künye satırı artık alıntı denetiminin dışında (yalnız sayı denetimine girer); son sütun, dışlama olmasaydı
künyenin kendisinin kaç pasajda geçerli alıntı olabileceğini gösterir.

32 karakterden kısa pasaj gövdeleri (farklı pasajlar):

- Türk Borçlar Kanunu m.50 II. Zararın ve kusurun ispatı: "III. Tazminat"
- Türk Borçlar Kanunu m.64 2. Sorumluluk: "B. Kusursuz sorumluluk"
- Türk Borçlar Kanunu m.73 II. Rücu isteminde: "D. Yargılama"
- Türk Borçlar Kanunu m.68 b. Alıkoyma hakkı: "3. Yapı malikinin sorumluluğu"
