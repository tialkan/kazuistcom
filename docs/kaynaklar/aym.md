---
kaynak: aym
alan_adlari: [kararlarbilgibankasi.anayasa.gov.tr, normkararlarbilgibankasi.anayasa.gov.tr]
hiz_rps: 0.5
lisans_dayanagi: "Resmî karar (Anayasa m.153, 6216 sayılı Kanun m.50); Anayasa Mahkemesi Kararlar Bilgi Bankası'nda kamuya açık yayımlanır"
protokol_durumu: gerekmez
tarik_onayi: bekliyor
---

# Anayasa Mahkemesi Kararlar Bilgi Bankası

Plan 6.1: norm denetimi ve bireysel başvuru esas inceleme kararları, haftalık. Bağlayıcı Python kodu
`services/worker-py/connectors/aym.py`. Tarık onayı: bekliyor.

## Kapsam

| Tür | Sayı (2026-11-15) | Alınan |
|---|---|---|
| Norm denetimi (`NormDenetimi`) | 5.620 | Hepsi |
| Bireysel başvuru (`BireyselBasvuru`) | 18.003 | Yalnız "Esas (İhlal)" ve "Esas (İhlal Olmadığı)" (plan 6.1); "Kabul Edilemezlik vd." atlanır |

Sayfa 50 (100'lük) örnekleminde bireysel başvuruların yüzde 75'i esas kararıydı; tam sayım yapılmadı.

## Kullanım koşulları (DOĞRULANMADI)

- Bilgi bankasının kendi sayfasında (tek sayfa uygulama, `/kbb/`) ayrı bir kullanım koşulları veya yeniden kullanım
  metni bulunamadı. Uygulamanın paketinde yalnız şu not var: "Kararlar Bilgi Bankasında yayımlanan karar metni
  editöryal düzeltmelere tabi tutulmuş olabilir." Bu yüzden kullanıcıya her zaman resmî kaynak bağlantısı gösterilir.
- Kurum sitesi (`www.anayasa.gov.tr`) altbilgisi "Tüm hakları saklıdır" der; `/tr/iletisim/kvkk` yalnız kurumun kendi
  ziyaretçi verilerine ilişkin aydınlatma metnidir, yeniden kullanıma dair hüküm içermez.
- Otomatik erişim ve yeniden kullanım için yazılı bir hüküm bulunmadı: DOĞRULANMADI. Tarık onayından önce hukuk-uyum
  ajanı kurumun yazılı görüşünü almalıdır (iletişim: `bilgi(et)anayasa.gov.tr`, kurum sitesi iletişim sayfası).

## Hukuki dayanak

- Karar metinleri resmî metindir (FSEK m.31, telif konusu dışı). Anayasa m.153 norm denetimi kararlarını bağlayıcı kılar;
  bireysel başvuru kararları dosya bakımından bağlayıcıdır (Anayasa m.148, 6216 sayılı Kanun m.50), plan Ek F.
- Kurumun SSS sayfası: "Genel Kurul ve Bölüm kararlarının tümü ile Komisyon kararlarından kabul edilebilirlik açısından
  ilkesel önem taşıyanları Anayasa Mahkemesinin internet sitesinde yayımlanır." Kararlar bu yayından alınır; yeni bir
  yayın kanalı açılmaz.

## Kişisel veri

- Bireysel başvuru kararları başvurucunun adını (liste alanı `basvuruAdi`, karar başlığı "AD SOYAD BAŞVURUSU"),
  başvurucu ve vekil adını, karşı tarafların ve şirketlerin adlarını, bazen sağlık ve ceza mahkûmiyeti bilgilerini
  (KVKK m.6) içerir. Başvurucu, kimliğinin kamuya açık belgelerde gizlenmesini talep edebilir (SSS 2.9); gizlilik
  talebi olan kararlarda kaynak adı kendisi maskeler.
- Norm denetimi kararları kural olarak kişi içermez; dava örnekleri ve ek belgeler adlandırma içerebilir.
- Bu bağlayıcıda `basvuruAdi` hiçbir kayda, başlığa veya ada kopyalanmaz. Karar başlığı yalnız "Anayasa Mahkemesi,
  <Bölüm>, B. No: yyyy/n (tarih)" biçimindedir (başlık arama dizinine girer; kişi adı girmez).
- Karar metni `records.text` içine `anonymized=false` ile yazılır, `anon.run` işi kuyruğa girer; `masked_text` boş
  kalır ve kayıt anonimleştirme bitene kadar sunulmaz (plan 6.2/6). Ham JSON (başvurucu adı dahil) yalnız ham arşivde
  durur; arşiv dışarıya kapalıdır, sorgu sonuç listeleri arşivlenmez.
- Yüksek mahkeme üyesi adları (Başkan, Üyeler, Raportör) Ek E uyarınca kaynak açık yayımlıyorsa korunur. Not:
  `anonymizer/policy.yaml` `open_sources` değeri "AYM" yazar, kayıtta mahkeme adı "Anayasa Mahkemesi" olduğu için
  eşleşme sağlanmaz ve üye adları fazla maskelenir (güvenli yön); istek `docs/istekler/veri-toplama-ingest-payloadlari.md`.

## robots.txt (2026-11-15)

- `kararlarbilgibankasi.anayasa.gov.tr/robots.txt` ve `normkararlarbilgibankasi.anayasa.gov.tr/robots.txt`: HTTP 404
  (nginx). Kısıtlama yok. `www.anayasa.gov.tr/robots.txt`: 404.
- Kod her çalıştırmada robots.txt'yi `KazuistBot/1.0` ile okur; 5xx veya ağ hatasında çekim reddedilir.

## Uç noktalar

- Tek uç: `POST https://kararlarbilgibankasi.anayasa.gov.tr/api/core/public/search` (norm için aynı yol
  `normkararlarbilgibankasi` ana makinesinde; sitenin kendi uygulaması bu iki çağrıyı yapar). Gövde:
  `{"kararTipi": "BireyselBasvuru"|"NormDenetimi", "page": n, "size": k}` liste; `"id": "<uuid>"` ile tek karar ve
  `icerik` (Word HTML) alanı. `size` 100'e kadar çalıştı (tek istek 2026-11-15, 0,6 sn, 228 KB).
- Kullanılmayan: PDF, UDF ve Word indirmeleri. Sitenin uygulaması bu indirmeleri `X-Captcha-Verified` üstbilgisiyle ve
  dakikada 3 indirmeyi aşınca "security-check" sayfasıyla korur; bu insan denetimidir, otomatik çekim bu uçlara gitmez.
  Metin zaten `icerik` içinde geldiği için gerek de yoktur.
- Belge bağlantısı (kullanıcıya gösterilen): `https://<ana makine>/kbb/pages/search/<tür>?id=<base64url("kbb:"+uuid)>&type=<tür>`;
  sitenin kendi sayfasının kullandığı adres biçimidir, tarayıcıda açılışı bu çalışmada doğrulanmadı (tek sayfa uygulama,
  işlenmiş sayfa görülmedi).
- Sıralama sabit değildir (sayfa 50 farklı yıllardan karar içeriyor); bu yüzden listeyi her çalıştırmada baştan sona
  gezip bilinen `source_key`'leri atlarız; sayfa kayması kaçırmaya değil en çok tekrara yol açar.

## Hız, önbellek ve devam edebilirlik

- 0,5 istek/sn (2 sn aralık); 429'da `Retry-After`; hata oranı eşiği aşılırsa otomatik durma; CAPTCHA veya insan
  denetimi cevabı gelirse kaynak anında durur ve elle `reset` gerekir (`core/challenge.py`).
- Tam tarama tahmini: liste 181 sayfa (100'lük, yaklaşık 6 dk) + yaklaşık 6 bin ayrı karar belgesi (yaklaşık 3,5 saat);
  gece penceresinde bölünerek yapılır. Zamanlayıcı her çalıştırmada bir liste sayfası işi kuyruğa alır; her liste işi
  yeni kararlar için ayrı belge işleri açar ve sıradaki sayfayı kuyruğa koyar: kuyruk durumu devam noktasıdır.
- Ham belge SHA-256 ile depoya yazılır (`sources_raw`); aynı baytlar bir kez saklanır, değişmeyen belge yeniden
  işlenmez. `sourceUrl`, `fetchedAt`, `licenseBasis` her kayıttadır.

## Protokol

Plan 6.1 AYM için protokol istemez ("Resmî karar"). Haftalık toplu çekim için kuruma bilgi verilmesi önerilir; yapılmadı.

## Geliştirme sırasında canlı sorgu kaydı (2026-11-15)

`KazuistBot/1.0` ile 11 istek: robots.txt (3 ana makine), giriş sayfası ve JS paketi, liste (bireysel size 2 ve size
100, norm size 2), bireysel ve norm için birer karar belgesi. Fikstürler `tests/fixtures/aym/` altındadır; başvurucu ve
vekil adları kaldırılmış, listede `basvuruAdi` "[ANONİM]" yapılmıştır. Ayrıca `core.cli probe aym` ile 6 istek (hata oranı 0,0). Referans: yargi-mcp (MIT) uç şekilleri; kod
alınmadı, `NOTICE` değişmedi.

## Tarık'tan

Üretim öncesi: kurumdan yazılı yeniden kullanım görüşü (hukuk-uyum); bu dosyada `tarik_onayi: onaylandi` için açık onay.
