# content/hukuki

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-11-12 (review.md P5). Sahibi: hukuk-uyum ajanı (docs/sahiplik.md).

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

## Ürün davranışıyla tutarlılık (bağımsız denetçi için, 2026-11-12)

Metinlerdeki her olgusal iddia koddaki karşılığıyla eşleştirildi. "Ön koşul" satırları bugün kodda yoktur ve
yayından önce ilgili paketle gelir; o paket gelmezse metin değişir.

| İddia | Metin | Kanıt | Durum |
|---|---|---|---|
| Sunucular Hetzner, AB | uyari, aydinlatma 4-5, gizlilik 1 | ADR-0030, ADR-0033 | Karar; sunucu siparişi ve m.9 dayanağı yok (ön koşul) |
| Oturum çerezi adı, ömrü, bayrakları | cerezler 1 | docs/istekler/kalite-hukuk-uyum-taslaklar.md madde 3 ölçümü | Doğrulandı (2 Kasım) |
| pratik ve rehber ilerlemesi localStorage'da | cerezler 2, aydinlatma 2, gizlilik 1 | pratik/_alan/depo.ts, deneme-oturumu.ts, rehberler/_alan/ilerleme.ts | Doğrulandı |
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
| BYOK anahtarının tarayıcıda tutulması | cerezler 2, yapay-zeka 4 | BYOK arayüzü yok (review.md P8 madde 4) | Ön koşul; metin "kullanıma açıldığında" diye yazıldı |
| Analitik etkin değil | cerezler 1, gizlilik 1 | kodda Umami SDK'sı yok | Doğrulandı |
| Veri tabanı internete kapalı | gizlilik 2 | ADR-0033 karar 2 | Ön koşul (review.md P2) |
| Koyu tema | (çıkarıldı) | plan 12 madde 2 | Metinden çıkarıldı |
| Ödeme adımında hukuki metin gösterimi | on-bilgilendirme, mesafeli-satis | legal-presentation.ts `pdf` şartı; _hukuki/test/odeme-gosterimi.test.tsx | Ayrıştırıcı düzeldi, alanlar eklendi; yayın onayı ve {{KEP}} bekleniyor |
