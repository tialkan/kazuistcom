# Kaynak belgeleri

Plan 6.2/1: her kaynak için bir dosya. Bu klasör aynı zamanda getiricilerin SSRF izin listesidir (plan 5.6/5):
`services/worker-py/core/sources.py` her dosyanın YAML başlığını okur; `alan_adlari` dışındaki hiçbir ana makineye
istek gitmez.

## Başlık alanları

| Alan | Anlamı |
|---|---|
| kaynak | Kod adı (kapatma anahtarı: `KAZUIST_SOURCE_<AD>`, büyük harf, tire alt çizgi) |
| alan_adlari | İzin verilen ana makineler (yalnız https, 443) |
| robots_alan_adlari | robots.txt'si okunan ana makineler |
| hiz_rps | Saniyedeki istek sınırı (varsayılan 0,5) |
| lisans_dayanagi | Kayıtlara `licenseBasis` olarak yazılan metin |
| protokol_durumu | gerekmez, basvuruldu, imzalandi, reddedildi, canli_federasyon |
| tarik_onayi | `bekliyor` veya `onaylandi` |

## Çalıştırma kuralı

1. Kapatma anahtarı varsayılan kapalıdır. Açmak için ortam değişkeni `on` olur (ör. `KAZUIST_SOURCE_KVKK=on`).
2. `KAZUIST_ENV=production` iken ek olarak `tarik_onayi: onaylandi` gerekir. Onay yalnız Tarık'ın açık
   onayından sonra, o kaynağın dosyasında ve bir commit ile işlenir.
3. Hata oranı eşiği aşılırsa kaynak otomatik durur ve uyarı kaydı düşer; sürmek için iç API'de `reset` çağrılır.
4. robots.txt okunamazsa (5xx, ağ hatası) çekim reddedilir. 4xx veya robots olmayan bir gövde, kısıtlama yok sayılır.

## Geliştirme sırasında canlı sorgu kaydı (2026-10-19)

Fikstür kaydetmek için kaynak başına en çok 5 istek, 2 saniye aralıkla, `KazuistBot/1.0` ile yapıldı. Sayılar her
kaynak dosyasındadır. Testler çevrimdışı çalışır.

| Kaynak | Dosya |
|---|---|
| Mevzuat Bilgi Sistemi | mevzuat.md |
| Resmî Gazete | resmi-gazete.md |
| KVKK | kvkk.md |
| Rekabet Kurumu | rekabet.md |
| OpenAlex | openalex.md |
| Crossref | crossref.md |
| EUR-Lex ve CELLAR | eurlex.md |
