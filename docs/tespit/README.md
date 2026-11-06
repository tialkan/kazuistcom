# /tespit: yazım kuralları ve iz denetleyici

Sayfa: `apps/web/src/app/tespit/`. Girişsiz ve ücretsizdir. Üç parçası vardır: bütün istemi tek tıkla kopyalayan
düğme (ve `.md` indirme), tarayıcıda çalışan kural tabanlı iz denetleyici, kural setinin bölüm bölüm okunur gösterimi.

## Tek kaynak

`docs/tespit/yazim-kurallari.md` (sürüm 1.2, 11 bölüm, 159 madde) tek kaynaktır. Kopyalanan istem, indirilen dosya,
sayfadaki kural gösterimi ve denetleyici bu dosyadan türer.

- `_veri/ayristir.ts` Markdown'u ayrıştırır. `_veri/kurallar.json` onun çıktısıdır ve depoda durur (derleme zamanında
  `docs/` okunmaz, çünkü standalone imajda yoktur).
- Yeniden üretmek için: `node apps/web/src/app/tespit/_veri/uret.ts` (Node 24, bağımlılık yok; çıktıyı prettier ile
  biçimlendirir). Markdown değişip JSON değişmediyse `tespit.test.ts` kırılır.
- `_veri/izler.ts` denetleyicinin iz kataloğudur. Her girdi bir kural numarasına bağlıdır ve (varsa) o kuralın metninde
  geçen birebir `terim` ile gelir. Test, her terimin gerçekten o kuralın metninde geçtiğini ve her girdinin kendi
  örneğini yakaladığını doğrular; böylece kural seti ile denetleyici ayrışmaz.
- Kural numarası `<bölüm>.<sıra>` biçimindedir (ör. 4.10). Bölüm 9'un ikinci listesi kaynakta yeniden 1'den başladığı
  için 9.7 ile 9.12 olarak numaralanır.

## Metin denetimi (scripts/check-text.mjs)

Kural metni `content/yasak-ifadeler.txt` ifadelerini ("kusursuz", "sinerji" gibi) örnek olarak içerir. Veri
`apps/web/src/app/tespit/_veri/` altında durur; bu yol `check-text.mjs` tarafından yalnız uzun çizgi için taranır.
Denetim devre dışı bırakılmadı. Arayüz metinleri `packages/i18n/{tr,en}/tespit.json` içindedir ve yasak ifade içermez.
Uzun ve orta çizgi karakterleri koda `String.fromCharCode` ile üretilir.

## Gizlilik

Denetleyici (`denetle.ts`, `izler.ts`, `Denetleyici.tsx`) ağ, depolama, günlükleme ve sunucu kodu içermez; test bunu
kaynak taramasıyla zorlar. CSP `connect-src 'self'` ile gelir. Sayfada bu açıkça söylenir.

## Sunum ilkesi

Sonuç hiçbir yerde "yapay zekâ yazdı" ya da "%X yapay zekâ" diye sunulmaz. Gösterilen: şiddete göre iz sayısı (kesin,
olası, zayıf), 1000 sözcükte iz, iz türü sayısı, ritim ölçümü (kural 10.6) ve yanlış pozitif uyarısı (kural 9.3, 9.4,
9.5). Sayısal eşikler yalnız kural metninde varsa kullanılır (yarıdan fazlası -mektedir/-dır: 6.3; üç art arda: 6.3).
Değişkenlik katsayısı eşiği (0,30) buluşsal olarak işaretlidir.

## Kapsam sınırı

Denetleyici kural setinin sözcük ve kalıp listelerini, atıf ve sohbet izlerini, çizgileri, yer tutucuları, biçim
izlerini ve ritmi ölçer. Anlam, atıf doğruluğu, künye ve DOI denetimi (Bölüm 3 ve 8) ölçülemez; bunlar insan okuması
ve doğrulama gerektirir.

## Doğrulama kaydı

`docs/tespit/ekran/` altında 375, 768 ve 1440 px ekran görüntüleri ve `dogrulama.json` (axe, taşma, kopyalama,
yedek yol, ağ isteği ölçümü) bulunur. Yerel üretim derlemesine karşı Playwright ile alındı.
