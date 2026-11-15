# İstek: Ek D.1 talimatına künye paragrafı, yazıyla sayı ve karar bölümü kuralı

1. İsteyen: yz-gecidi ajanı, dal `yz-gecidi/ozet-talimati-dogrulayici`. Muhatap: orkestra (`plan.md` sahibi).
2. Gerekçe: casuist doğrulayıcısı (#101) yazıyla sayıyı değer ve birimle denetliyor ve iddia, süreç, karşı oy
   pasajını tek başına bağlayıcı saymıyor; #102 plan 7.4/3, Ek D.1 kural 2 ve Ek D.2/b'yi alıntı kuralına göre
   güncelledi ama bu iki kuralı ve künye satırının ne olduğunu Ek D'ye yazmadı. `SOURCED_SUMMARY_SYSTEM`
   (`packages/ai-gateway/src/prompt.ts`) bunları artık modele söylüyor; Ek D'nin her satırı talimatta birebir duruyor,
   aşağıdaki üç ek Ek D'de yok. `packages/ai-gateway/test/prompt.test.ts` plan.md'deki Ek D.1 bloğunun her satırını
   talimatta arar; aşağıdaki ekler plana olduğu gibi alınırsa test değişmeden geçer.
3. Aciliyet: hiçbir işi engellemiyor. Plan ile talimat arasındaki fark yalnız bu üç ektir.

`packages/contracts` ve `packages/db` etkilenmez; geriye uyumluluk sorunu yoktur (yalnız metin).

## Önerilen Ek D.1 metni

Giriş paragrafından sonra, "Kurallar:" satırından önce yeni paragraf:

```text
Her <kaynak> bloğunun ilk satırı künyedir: kaynağın adı, varsa sayısı ve tarihi; karar pasajlarında bölümü de
"(Bölüm: ...)" biçiminde yazılır. Künyeden sonraki satırlar pasaj gövdesidir.
```

Kural 3'ün sonuna (aynı satır):

```text
Rakamla ya da yazıyla yazdığın her sayı, tarih, süre ve tutar o cümlede kaynak gösterdiğin bir pasajda geçsin; süre ve tutarda değer ve birim aynı olsun: kaynaktaki "on beş gün" için "15 gün" yazılabilir, "otuz gün" ya da "on beş iş günü" yazılamaz.
```

Kural 6'nın sonuna (aynı satır):

```text
Künyesinde "(Bölüm: iddia ve savunma)", "(Bölüm: yargılama süreci)" veya "(Bölüm: karşı oy)" bulunan pasaj tarafların iddiasını, yargılama sürecini ya da karşı oyu aktarır; bağlayıcı kaynaktan gelse de hükmü tek başına kurmaz. Böyle bir pasaja dayanan cümlede bunu açıkça söyle ("davacıya göre", "karşı oyda" gibi).
```

Kural numaraları değişmez (1-9); kod ve belgelerdeki "Ek D.1 kural 7" gibi atıflar aynı kurala işaret etmeye devam
eder. Bölüm adları casuist `SECTION_LABELS`'tan gelir (`packages/casuist/src/answer/passages.ts`); test, adların
`kunye()` çıktısıyla aynı olduğunu da denetler.

## Önerilen diğer plan satırları

- Ek D.1 "Pasaj biçimi" bloğu künye satırını göstersin:

  ```text
  <kaynaklar>
  <kaynak id="K3" tur="karar" otorite="baglayici_karar" durum="kesinlesti" tarih="2021-11-09" veri_gunu="2026-12-01">
  ...künye satırı (Bölüm: gerekçe)...
  ...metin...
  </kaynak>
  </kaynaklar>
  ```

- 7.4/3 üçüncü madde: "Cümledeki her sayı, tarih, esas ve karar numarası, madde atfı alıntılanan pasajlarda geçiyor;
  yazıyla yazılmış süre ve tutar aynı değer ve birimle geçiyor."
- 7.4/6: "Bağlayıcı kaynaktan kurulmayan hüküm cümlesi "destekleyici kaynak" notuyla gösterilir; kararın iddia ve
  savunma, yargılama süreci ve karşı oy bölümleri tek başına bağlayıcı sayılmaz."
- Ek D.2/c sonuna: "rakamla ya da yazıyla süre ve tutar aynı değer ve birimle geçiyor ("15 gün" ile "on beş gün"
  aynı; "on beş iş günü" farklı)."
