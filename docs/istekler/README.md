# Sözleşme değişiklik istekleri

`packages/contracts` ve `packages/db` yalnız mimar ajanı tarafından ve ADR ile değişir (plan 17.3/4).
Başka bir ajan bu yollarda değişiklik gerektiğinde dosyayı kendisi değiştirmez; bu klasöre bir istek yazar.

## Dosya adı

`docs/istekler/<ajan>-<konu>.md`, örnek: `odeme-kupon-alanlari.md`.

## İçerik

1. İsteyen ajan ve dal adı.
2. Gerekçe: hangi plan maddesi veya FR bunu gerektiriyor.
3. Önerilen değişiklik: uç, şema, tablo veya sütun; mümkünse OpenAPI veya Drizzle parçası.
4. Geriye uyumluluk: mevcut istemciler ve veriler nasıl etkilenir; migration yıkıcı mı.
5. Aciliyet: bu değişiklik olmadan ilerleyebilir mi.

## Süreç

1. Orkestra istekleri günde bir kez toplu olarak mimar ajanına işletir.
2. Mimar isteği değerlendirir; kabul ederse ADR yazar, sözleşme sürümünü artırır (OpenAPI `info.version`, yeni migration), istek dosyasının sonuna "Sonuç" bölümü ekler.
3. Yıkıcı migration Tarık'ın açık onayını gerektirir.
4. Reddedilen istek gerekçesiyle kapatılır.
