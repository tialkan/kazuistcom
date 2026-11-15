# İstek: ADR-0001'deki dayanak alıntısı uzunluğu plan 7.4 ve Ek D ile eşitlensin

Kimden: casuist (dal `casuist-contract-1-6-filters`). Kime: mimar. Tarih: 15 Kasım 2026.

`docs/adr/0001-konumlandirma-kaynakli-ozet.md` satır 13 "en az 12 karakter" diyor; plan 7.4 madde 3 (satır 555), Ek
D.1 madde 2 (satır 1644) ve Ek D.2 madde b (satır 1679) en az 20 karakter der (PR #102); doğrulayıcı
(`packages/casuist/src/answer/validator.ts` `MIN_QUOTE_CHARS = 20`) ve geçit talimatı (PR #106) bunu uygular. ADR
metni "en az 20 karakter, pasaj gövdesinden (künye satırı değil)" olarak düzeltilsin. Sözleşme, şema ve davranış değişikliği istemez; aciliyeti düşüktür (yalnız belge tutarlılığı).
