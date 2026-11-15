---
kaynak: danistay
alan_adlari: [karararama.danistay.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî karar; Danıştay Karar Arama sitesinde kamuya açık yayımlanır (toplu çekme için protokol başvurusu gerekli)"
protokol_durumu: gerekli_yapilmadi
tarik_onayi: bekliyor
---

# Danıştay Karar Arama

Plan 6.1: çekirdek İBK; İDDK ve VDDK 1.1; diğer daireler yalnız canlı federasyon. Bağlayıcı kod
`services/worker-py/connectors/danistay.py`. Tarık onayı: bekliyor.

## Kapsam

| Birim (sitenin seçim değeri) | Plan | Sayı (2026-11-15) |
|---|---|---|
| İçtihatları Birleştirme Kurulu (İBK) | 1.0 | 0 sonuç ("İçtihatları Birleştirme Kurulu" ve "Büyük Gen.Kur." iki seçenek de) |
| İdare Dava Daireleri Kurulu (İDDK) | 1.1 | 3.491 (yalnız 2024 karar yılı) |
| Vergi Dava Daireleri Kurulu (VDDK) | 1.1 | 1.012 (yalnız 2024 karar yılı) |

Site İBK için sonuç döndürmedi; birim yapılandırmada durur, site listelerse kendiliğinden gelir. İBK kararlarının
Danıştay'ın başka bir kanalında yayımlanıp yayımlanmadığı araştırılmadı. VDDK listesinde aynı esas ve karar numaralı
çift satırlar görüldü (2024/1008, 2024/1216); kaynak anahtarı birim, esas ve karar olduğundan tek kayda iner.

## Kullanım koşulları (DOĞRULANMADI)

Sitede kullanım koşulları veya yeniden kullanım bildirimi bulunamadı (giriş sayfası okundu). Otomatik erişim hakkında
yazılı hüküm yok: DOĞRULANMADI. Plan 6.1 "protokol başvurusu" der; başvuru yapılmadı (`protokol_durumu:
gerekli_yapilmadi`, kayıtlara enum varsayılanı `gerekmez` yazılır; bkz. yargitay.md).

## robots.txt (2026-11-15)

`https://karararama.danistay.gov.tr/robots.txt` HTTP 200, gövde JSON hata zarfı ("No static resource robots.txt",
`ESN: danistay-karar-arama`); robots dosyası değil, kısıtlama yok sayılır. Sitenin otomatik erişim beyanı yok.

## İnsan denetimi (CAPTCHA) durumu

Yargıtay ile aynı yazılım: sayfada `#isDisplayCaptcha` alanı (2026-11-15: `false`) ve `DisplayCaptcha` /
`reCaptchaTimeout` cevapları. Böyle bir cevap gelirse kaynak anında durur ve elle `reset` gerekir; hiçbir koşulda
aşılmaz (ayrıntı yargitay.md). Geliştirme sırasında CAPTCHA ile karşılaşılmadı.

## Uç noktalar

- Liste: `POST https://karararama.danistay.gov.tr/aramadetaylist`, gövde `{"data": {"daire": "...", "kararYil":
  "2024", "siralama": "1", "siralamaDirection": "desc", "pageSize": 10, "pageNumber": 1}}`; cevap `data.data[]`
  (`id`, `daireKurul`, `esasNo`, `kararNo`, `kararTarihi`), `recordsTotal`.
- Belge: `GET /getDokuman?id=<id>&arananKelime=` bir HTML sayfası döner; karar metni sayfadaki gizli
  `<p id="hiddencontent">` içinde kaçırılmış HTML olarak durur. Kullanıcıya gösterilen resmî bağlantı bu adrestir.

## Kişisel veri

Bu sitede kararlar kaynakta anonim yayımlanır (örnek belgede adlar "..." ile değiştirilmiş), yine de taranır (plan 6.4/8).
Metin `anonymized=false` ile yazılır ve `anon.run` kuyruğa girer; başlık yalnız "Danıştay <Birim>, E. ..., K. ... (tarih)".

## Hız, devam edebilirlik

Yargıtay ile aynı: 0,5 istek/sn, liste sayfası işleri (birim ve karar yılı bazında), tekilleştirme anahtarı
`danistay:<birim>:<esas>:<karar>`. İDDK 2024 tek başına yaklaşık 3,5 bin belge (yaklaşık 2 saat).

## Geliştirme sırasında canlı sorgu kaydı (2026-11-15)

`KazuistBot/1.0` ile 7 istek: robots.txt, giriş sayfası, İDDK 2024 listesi, bir belge, İBK iki seçenek (boş), VDDK 2024
listesi. Fikstürler `tests/fixtures/danistay/` altındadır (gerçek cevaplar). Ayrıca `core.cli probe danistay` ile 3 istek (İDDK 2025: 2.621 karar; hata oranı 0,0).

## Tarık'tan

Protokol kararı, yazılı yeniden kullanım görüşü (hukuk-uyum) ve bu dosyada `tarik_onayi: onaylandi` için açık onay.
