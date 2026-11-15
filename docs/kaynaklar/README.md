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
| protokol_durumu | gerekmez, basvuruldu, imzalandi, reddedildi, canli_federasyon, gerekli_yapilmadi (plan protokol ister, başvuru yapılmadı; kayda enum varsayılanı yazılır) |
| tarik_onayi | `bekliyor` veya `onaylandi` |

## Çalıştırma kuralı

1. Kapatma anahtarı varsayılan kapalıdır. Açmak için ortam değişkeni `on` olur (ör. `KAZUIST_SOURCE_KVKK=on`).
2. `KAZUIST_ENV=production` iken ek olarak `tarik_onayi: onaylandi` gerekir. Onay yalnız Tarık'ın açık
   onayından sonra, o kaynağın dosyasında ve bir commit ile işlenir.
3. Hata oranı eşiği aşılırsa kaynak otomatik durur ve uyarı kaydı düşer; sürmek için iç API'de `reset` çağrılır.
4. robots.txt okunamazsa (5xx, ağ hatası) çekim reddedilir. 4xx veya robots olmayan bir gövde, kısıtlama yok sayılır.
5. CAPTCHA veya bot denetimi cevabı (`DisplayCaptcha`, `reCaptchaTimeout`, reCAPTCHA, hCaptcha ve CDN denetim sayfaları;
   `core/challenge.py`) kaynağı anında durdurur ve uyarı kaydı düşer. Elle `reset` gerekir. Denetim çözülmez, aşılmaz,
   başka kimlikle tekrarlanmaz.
6. Zamanlayıcı (`core/scheduler.py`): yalnız anahtarı açık, (üretimde) onaylı, kesicisi açık kaynak için ve kaynağın
   penceresinde iş kuyruğa alır. `python -m core.scheduler --dry-run` planı basar, hiçbir şey yazmaz.
   `KAZUIST_SCHEDULER=on` döngüyü işçide başlatır; `KAZUIST_SCHEDULER_DRY_RUN=on` yalnız planı loglar.
7. Canlı kontrol: `python -m core.cli probe <kaynak>` küçük bir örnek çeker (liste satırları ve bir belge), sayıları ve
   hata oranını basar; veri tabanına yazmaz.

## Canlı kontrol özeti (2026-11-15, `core.cli probe`)

| Kaynak | Sonuç | İstek | Örnek | Hata oranı |
|---|---|---|---|---|
| aym | ok | 6 | bireysel 18.003 (5 satır, 3 esas), norm 5.620 (5 satır), 2 karar ayrıştırıldı | 0,0 |
| yargitay | ok | 3 | HGK 2025: 940 karar, 10 satır, 1 karar ayrıştırıldı | 0,0 |
| danistay | ok | 3 | İDDK 2025: 2.621 karar, 10 satır, 1 karar ayrıştırıldı | 0,0 |
| kvkk | ok | 4 | 10 satır, sonraki sayfa var, 1 özet ayrıştırıldı | 0,0 |
| rekabet | ok | 3 | 10 satır, 1 karar ayrıştırıldı (özet metni) | 0,0 |
| resmi-gazete | robots.txt okunamadı, çekim reddedildi | 1 | 0 | 1,0 |
| mevzuat | robots.txt okunamadı, çekim reddedildi | 1 | 0 | 1,0 |

OpenAlex, Crossref ve EUR-Lex bu turda canlı çekilmedi (anahtar veya seçili CELEX gerektirir; fikstür testleri çalışır).

## Geliştirme sırasında canlı sorgu kaydı (2026-10-19)

Fikstür kaydetmek için kaynak başına en çok 5 istek, 2 saniye aralıkla, `KazuistBot/1.0` ile yapıldı. Sayılar her
kaynak dosyasındadır. Testler çevrimdışı çalışır.

| Kaynak | Dosya |
|---|---|
| Anayasa Mahkemesi Kararlar Bilgi Bankası (2026-11-15) | aym.md |
| Yargıtay Karar Arama (2026-11-15) | yargitay.md |
| Danıştay Karar Arama (2026-11-15) | danistay.md |
| Mevzuat Bilgi Sistemi | mevzuat.md |
| Resmî Gazete | resmi-gazete.md |
| KVKK | kvkk.md |
| Rekabet Kurumu | rekabet.md |
| OpenAlex | openalex.md |
| Crossref | crossref.md |
| EUR-Lex ve CELLAR | eurlex.md |
