---
kaynak: yargitay
alan_adlari: [karararama.yargitay.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî karar; Yargıtay Karar Arama sitesinde kamuya açık yayımlanır (toplu çekme için protokol başvurusu gerekli)"
protokol_durumu: gerekli_yapilmadi
tarik_onayi: bekliyor
---

# Yargıtay Karar Arama

Plan 6.1: çekirdek HGK, CGK ve İBK (2010 sonrası); diğer daireler yalnız canlı federasyon. Bağlayıcı kod
`services/worker-py/connectors/yargitay.py`. Tarık onayı: bekliyor.

## Kapsam

| Birim (sitenin seçim değeri) | Plan | Sayı (2026-11-15) |
|---|---|---|
| Büyük Genel Kurulu (İçtihadı Birleştirme Büyük Genel Kurulu, İBK) | 1.0 | 40 (tüm yıllar) |
| Hukuk Genel Kurulu (HGK) | 1.0 | 747 (yalnız 2024 karar yılı) |
| Ceza Genel Kurulu (CGK) | 1.1 | sayılmadı |

Dairelerin kararları çekilmez (plan: canlı federasyon).

## Kullanım koşulları (DOĞRULANMADI)

- Sitede kullanım koşulları, telif veya yeniden kullanım bildirimi bulunamadı (giriş sayfası ve arama sayfası
  okundu; web aramasında da resmî bir koşul veya toplu veri politikası çıkmadı). Otomatik erişim ve yeniden kullanım
  hakkında yazılı hüküm yok: DOĞRULANMADI.
- Plan 6.1 "toplu çekme için protokol başvurusu" der. Başvuru yapılmadı. Bu yüzden `protokol_durumu` değeri
  `gerekli_yapilmadi`; kayıtlar `records.protocol_status` içine enum varsayılanı `gerekmez` ile yazılır (enumda bu durum
  için değer yok, istek `docs/istekler/veri-toplama-ingest-payloadlari.md`). Üretimde toplu çekimden önce Yargıtay
  Bilgi İşlem Daire Başkanlığı ile protokol görüşmesi gerekir.

## robots.txt (2026-11-15)

`https://karararama.yargitay.gov.tr/robots.txt` HTTP 200 döner ama gövde bir robots dosyası değildir: JSON hata
zarfı ("No static resource robots.txt", `ESN: yargitay-karar-arama`). RFC 9309 ve `core/robots.py` uyarınca robots
olmayan gövde kısıtlama yok sayılır. Yani engel yok, ama sitenin otomatik erişim konusunda bir beyanı da yok.

## İnsan denetimi (CAPTCHA) durumu

- Arama sayfası Google reCAPTCHA yükler; görünürlük sayfadaki `#isDisplayCaptcha` alanıyla (2026-11-15: `false`)
  ve sunucunun `DisplayCaptcha` / `reCaptchaTimeout` cevabıyla açılır ("Ben robot değilim" iletisi).
- Kural: bu cevaplardan biri gelirse `core/challenge.py` kaynağı anında durdurur (`ChallengeDetected`), uyarı kaydı
  düşer, çekim elle `reset` yapılana kadar sürmez. CAPTCHA çözülmez, çözdürülmez, aşılmaz; başka kullanıcı kimliği,
  tarayıcı taklidi veya Origin/Referer sahteciliği yapılmaz. Geliştirme sırasında CAPTCHA ile karşılaşılmadı.
- yargi-mcp referansında görülen taklit üstbilgiler (`X-KL-KIS-Ajax-Request`, `X-Requested-With`, `verify=False`) ve
  Bedesten (`bedesten.adalet.gov.tr`) uçları bilinçli olarak KULLANILMAZ: referans uygulama Bedesten'e tarayıcı kimliği
  ve `mevzuat.adalet.gov.tr` Origin/Referer taklidiyle gidiyor; böyle bir taklit yapılmaz. Bedesten bu çalışmada hiç
  denenmedi, robots.txt ve koşulları okunmadı; açılırsa ayrı kaynak dosyası gerekir.

## Uç noktalar

- Liste: `POST https://karararama.yargitay.gov.tr/aramadetaylist`, gövde `{"data": {"birimYrgKurulDaire": "...",
  "kararYil": "2024", "pageSize": 10, "pageNumber": 1, ...}}` (sitenin kendi sayfasının yaptığı çağrı). Cevap:
  `data.data[]` (`id`, `daire`, `esasNo`, `kararNo`, `kararTarihi` gg.aa.yyyy), `recordsTotal`.
- Belge: `GET /getDokuman?id=<id>` cevap `{"data": "<html>"}`; kullanıcıya gösterilen resmî bağlantı bu adrestir
  (JSON döner; sitenin kullanıcıya dönük ayrı bir karar sayfası bulunamadı).
- Sayfa boyutu 10 (sitenin kendi boyutu); daha büyük değer denenmedi.

## Kişisel veri

Kararlar kaynakta çoğunlukla maskeli yayımlanır, ama maskeleme tam değildir (kural: kaynağında anonim karar da
taranır, plan 6.4/8). Metin `records.text` içine `anonymized=false` ile yazılır ve `anon.run` kuyruğa girir; başlık
yalnız "Yargıtay <Birim>, E. yyyy/n, K. yyyy/n (tarih)" biçimindedir, taraf adı içermez. Liste cevapları arşivlenmez.

## Hız, devam edebilirlik

0,5 istek/sn; 429'da `Retry-After`; hata eşiği ve CAPTCHA durdurması geçerli. Tarama birim ve karar yılı bazında liste
sayfası işleriyle yapılır (her işte 10 karar); HGK için 2010'dan bugüne yaklaşık 11 bin karar, yaklaşık 6 saat gece
penceresi; zamanlayıcı bölerek yürütür. Tekilleştirme anahtarı birim, esas, karar (kaynak anahtarı
`yargitay:<birim>:<esas>:<karar>`), böylece aynı karara giden çift kayıtlar birleşir.

## Geliştirme sırasında canlı sorgu kaydı (2026-11-15)

`KazuistBot/1.0` ile 5 istek: robots.txt, giriş sayfası, HGK 2024 listesi (5 satır), bir belge, BGK listesi (3 satır).
Fikstürler `tests/fixtures/yargitay/` altındadır (gerçek cevaplar; bu belgede kişi adı yoktu). Ayrıca `core.cli probe yargitay` ile 3 istek (HGK 2025: 940 karar; hata oranı 0,0).

## Tarık'tan

Protokol başvurusu kararı (Yargıtay Bilgi İşlem), kuruma yazılı yeniden kullanım görüşü (hukuk-uyum) ve bu dosyada
`tarik_onayi: onaylandi` için açık onay. Onaysız ve protokolsüz kaynak üretimde çalışmaz.
