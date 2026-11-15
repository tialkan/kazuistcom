# content/hukuki

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-15 (dar çekirdekli ilk yayın, ADR-0038). Sahibi: hukuk-uyum ajanı
(docs/sahiplik.md).

Hiçbir metin Tarık onaylamadan yayımlanmaz (plan 11). Metinler uyum garantisi vermez.

## Biçim

Her dosya Markdown ve YAML ön bilgisiyle başlar. on-yuz kabuğu ön bilgiyi okur, gövdeyi render eder.

```yaml
title: Sayfa başlığı
slug: aydinlatma            # rota parçası
route: /hukuki/aydinlatma   # yayın yolu
lang: tr                    # yalnız tr (ADR-0032)
binding: true               # metinler bağlayıcıdır
version: 2026-11-12.1       # sürüm; consents.version alanına yazılan değer
date: 2026-11-12            # sürüm tarihi
status: taslak              # taslak veya yayinda; taslak durumundaki sayfa yayımlanmaz
consent_kind: aydinlatma    # varsa packages/db consent_kind değeri
```

Gövdede `{{...}}` biçimindeki yer tutucular (unvan dışı künye bilgileri, iletişim adresi, fiyat) yayından
önce doldurulur; dolmamış yer tutucu içeren sayfa yayımlanmamalıdır (istek: docs/istekler/hukuk-uyum-yayin-kapisi.md).
`[DOĞRULANACAK: ...]` işaretleri onaydan önce kapatılır. Yurt dışı aktarım dayanağına bağlı işaretler
(aydinlatma 5. bölüm) bilerek açık bırakıldı: dayanak tamamlanmadan metin yayımlanamasın diye (ADR-0033 ön koşul 1).

## PDF'e dönüşen metinler (odeme, O6)

Üç metin (tr/on-bilgilendirme, tr/mesafeli-satis, tr/abonelik) sipariş anında doldurulup
PDF'e çevrilir ve kalıcı veri saklayıcısı olarak e-postayla gönderilir (Mesafeli Sözleşmeler Yön. m.6; Abonelik
Sözleşmeleri Yön. m.5). Yapı kuralları:

- Gövde yalnız başlık, paragraf, numaralı liste ve tablodan oluşur; görsel, bileşen ve gömülü HTML yoktur.
- Siparişe özgü alanlar aşağıdadır; sunucu her birini doldurur, eksik alan varsa PDF üretilmez:
  - tr/on-bilgilendirme.md: AYLIK_KREDI, INDIRIM, KREDI, ODEME_DONEMI, TUTAR_TL, URUN_ACIKLAMASI, URUN_ADI, URUN_TURU
    (IOS_SURUM 2026-11-12 sürümünde çıkarıldı: form yalnız web satışında kullanılır)
  - tr/mesafeli-satis.md: ALICI_AD, ALICI_EPOSTA, SIPARIS_TARIHI, TUTAR_TL, URUN_ADI
  - tr/abonelik.md: ALICI_AD, ALICI_EPOSTA, AYLIK_INDIRIM_TL, AYLIK_KREDI, AYLIK_LISTE_FIYATI_TL, DONEM_BASLANGIC, DONEM_BITIS, ODEME_DONEMI, PLAN_ADI, SOZLESME_TARIHI, TUTAR_TL, YILLIK_TUTAR_TL
  Şirket alanlarından henüz bilinmeyenler ({{KEP}}) yayın kapısında kapanır.
- Ön bilgide `pdf: true` ve `pdf_fields: [A, B, C]` (YAML akış dizisi) yukarıdaki listelerle tanımlıdır. on-yuz ön
  bilgi ayrıştırıcısı (`apps/web/src/app/(kabuk)/_hukuki/md.ts` `onBilgi`) listeyi okur; ödeme adımı
  (`legal-presentation.ts`, `createLegalSnapshot`) bu alanları şart koşar (docs/istekler/hukuk-uyum-p5-tutarlilik.md
  madde 1). Metinler `taslak` durumundayken ve `{{KEP}}` açıkken ödeme adımı yine hukuki metin göstermez.
- Gövdede `pdf_fields` dışında `{{` ile başlayan hiçbir ifade (örnek gösterimi dahil) bulunmaz; yayın kapısı onu açık
  yer tutucu sayar.
- Bağlantılar tam adresle (https://kazuist.com/...) yazılır; PDF'te tıklanmadan okunabilir.
- Ön bilgiden sonraki ilk alıntı bloğu (TASLAK notu) ve on-bilgilendirme'deki "Gösterim kuralları" paragrafı
  PDF'e girmez; PDF'in başına metin sürümü (version) ve sipariş kimliği yazılır, consents kaydıyla eşleşir.
- Gövde en az 12 punto eşdeğeriyle basılır.

## Dosyalar

- tr/: bağlayıcı Türkçe metinler (plan 11 tablosu)

Kazuist yalnız Türkçedir (ADR-0032). İngilizce bilgilendirme sürümleri ve /legal/* adresleri kaldırıldı; yükleyici
`lang: tr` dışındaki metni reddeder, `alternate` (hreflang eşi) alanı kullanılmaz.

## Ürün davranışıyla tutarlılık (bağımsız denetçi için, 2026-11-15)

Metinlerdeki her olgusal iddia koddaki karşılığıyla eşleştirildi. "Ön koşul" satırları bugün kodda yoktur ve
yayından önce ilgili paketle gelir; o paket gelmezse metin değişir.

| İddia | Metin | Kanıt | Durum |
|---|---|---|---|
| Sunucular Hetzner, Almanya | uyari, aydinlatma 4-5, gizlilik 1 | ADR-0030 madde 2, ADR-0033 | Karar; sunucu siparişi ve m.9 dayanağı yok (ön koşul; docs/kvkk/hetzner-standart-sozlesme-bildirimi.md) |
| Hizmet yalnız dar çekirdek: Ara ve kaynaklı özet, Kaydettiklerim, Yazma (şablon, kısaltma), Rehberler, /tespit | kosullar 2, uyari, erisilebilirlik, cerezler 2, aydinlatma 2 | (kabuk)/_kabuk/yayin.ts `ertelenenModuller` (pratik, kalemcik, atif-agi; üretimde 404); yazma/page.tsx Kalemcik kartı `modulGorunur` | Doğrulandı. Modül açılırsa (KAZUIST_MODULLER) metinler yeni sürümle güncellenir |
| Yazma projeleri yalnız Kalemcik arayüzünde | aydinlatma 2 (satır çıkarıldı) | kalemcik/_bilesen/Kalemcik.tsx tek istemci; /api/v1/writing-projects ucu çalışır kalır (ADR-0038 madde 8) | Doğrulandı; uç açık olduğu için docs/kvkk/envanter.md satır 16'da tutuldu |
| Kredi satışı kapalı | kosullar 1 ve 5, aydinlatma 2-4, gizlilik 3, yapay-zeka 7, iade-ve-kredi giriş, ödeme metinlerinin TASLAK notu | server/billing/acik.ts `odemeAcik` (iyzico anahtarları yoksa false); byok.json `satisKapali` | Doğrulandı |
| Rehber ilerlemesi localStorage'da; pratik anahtarları üretimde yazılmaz | cerezler 2, aydinlatma 2, gizlilik 1 | rehberler/_alan/ilerleme.ts; pratik rotaları üretimde 404 (yayin.ts) | Doğrulandı |
| BYOK anahtarı varsayılan sessionStorage, seçimle localStorage, tek depoda, anahtar `kazuist.byok.v1` | cerezler 2, gizlilik 1 ve 3, yapay-zeka 4 | ai-gateway/src/byok/settings.ts `BYOK_STORAGE_ITEM`, `saveByokSettings`, `readByokSettings`; (hesap)/_bilesen/ByokAyarlari.tsx `clearByokSettings` | Doğrulandı |
| BYOK yalnız OpenRouter; tarayıcıdan doğrudan çağrı; anahtar sunucuya gitmez | kosullar 5, aydinlatma 4-5, yapay-zeka 4 | byok/settings.ts `BYOK_CLIENT_PROVIDERS`; byok/client.ts `PrepareBody` (anahtar alanı yok); security-headers.ts connect-src openrouter.ai | Doğrulandı |
| BYOK isteklerinde data_collection deny, seçimle zdr | yapay-zeka 4, gizlilik 1 | adapters/index.ts satır 145; byok/client.ts `openRouter: { zdr: s.zdr }` | Doğrulandı |
| Tarayıcı göndermeden önce maskelemeyi yeniden denetler | aydinlatma 5, yapay-zeka 4 | byok/client.ts `assertMasked` (`maskesiz_metin`) | Doğrulandı |
| BYOK özet cümleleri sunucuda doğrulanır, saklanmaz | aydinlatma 2, yapay-zeka 4-5 | ara/_sunucu/ozet.ts verify `savedId: null`; client.ts `save: false` | Doğrulandı |
| BYOK aktarma modu sunulmuyor | yapay-zeka 4, acik-riza 3 | ara/_bilesen/OzetAlani.tsx yalnız `mode: 'platform'` gönderir | Arayüzde doğrulandı. Sunucu ucu (ara/_sunucu/ozet.ts) `byok_aktarma`yı yz_aktarim onayıyla hâlâ kabul ediyor; kapatma kararı casuist ve yz-gecidi'nin |
| Platform modunda zdr her istekte | yapay-zeka 4, aydinlatma 4 | ai-gateway/src/gateway.ts `{ zdr: true }` | Doğrulandı |
| /tespit metni cihazdan çıkmaz | cerezler 2, aydinlatma 2 | tespit/tespit.test.ts depolama ve ağ yasağı; tespit.json | Doğrulandı |
| Ücretsiz hak için IP ve hesap özeti, bir günlük sayaç | aydinlatma 2 | ai-gateway/src/budget.ts, ara/_sunucu/gecit.ts `keyedHash` | Doğrulandı |
| YZ kaydında içerik yok, yalnız meta veri | yapay-zeka 5, gizlilik 1 | ai-gateway/src/observe.ts `ALLOWED` | Doğrulandı |
| Soru ve kılavuz metni maskelenerek gönderilir | aydinlatma 2, yapay-zeka 3 | ara/_sunucu/gecit.ts `maskQuery`, yazma/_sunucu/yz.ts `scrub` | Doğrulandı |
| Kılavuz bellekte okunur, 20 MB sınırı, tür denetimi | gizlilik 2 | yazma/_cekirdek/metin-cikarma.ts | Doğrulandı |
| Virüs taraması | (çıkarıldı) | kodda ClamAV yok | Metinden çıkarıldı |
| JSON ve CSV veri indirme | gizlilik 4 | (hesap)/hesap/verilerim/page.tsx | Doğrulandı |
| Hesap silmede 14 gün bekleme | gizlilik 3, kosullar 9 | ACCOUNT_PURGE_GRACE_DAYS varsayılanı 14 (.env.example) | Doğrulandı |
| 18 yaş beyanı koşul onayıyla | kosullar 4, gizlilik 6 | kayıt kutusu "Kullanım koşullarını okudum ve kabul ediyorum" (hesap.json) | Kutu metninde yaş yok; istek kimliğe |
| Kaldırma talebi e-postayla | kaldirma 2 | sitede form ve kayıt sayfası bağlantısı yok | Metin buna göre yazıldı |
| Hesapsız KVKK başvurusu e-posta veya yazılı | basvuru | /hesap/kvkk var, hesapsız form yok | Metin buna göre yazıldı |
| Yeni abonelik satılmaz | iade-ve-kredi 6, on-bilgilendirme 7, abonelik | (odeme)/odeme/page.tsx `abonelikSatisiKapali` | Doğrulandı |
| Analitik etkin değil | cerezler 1, gizlilik 1 | kodda Umami SDK'sı yok | Doğrulandı |
| Veri tabanı internete kapalı | gizlilik 2 | ADR-0033 karar 2 | Ön koşul (review.md P2) |
| Koyu tema | (çıkarıldı) | plan 12 madde 2 | Metinden çıkarıldı |
| Ödeme adımında hukuki metin gösterimi | on-bilgilendirme, mesafeli-satis | legal-presentation.ts `pdf` şartı; _hukuki/test/odeme-gosterimi.test.tsx | Ayrıştırıcı düzeldi, alanlar eklendi; yayın onayı ve {{KEP}} bekleniyor |
