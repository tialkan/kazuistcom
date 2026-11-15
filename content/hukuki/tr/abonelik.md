---
title: Abonelik sözleşmesi ve yıllık plan taahhütnamesi
slug: abonelik
route: /hukuki/abonelik
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
consent_kind: abonelik_sozlesmesi
pdf: true
pdf_fields: [ALICI_AD, ALICI_EPOSTA, AYLIK_INDIRIM_TL, AYLIK_KREDI, AYLIK_LISTE_FIYATI_TL, DONEM_BASLANGIC, DONEM_BITIS, ODEME_DONEMI, PLAN_ADI, SOZLESME_TARIHI, TUTAR_TL, YILLIK_TUTAR_TL]
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. İlk yayında kredi satışı da kapalıdır (ADR-0038,
> apps/web/src/server/billing/acik.ts `odemeAcik`); gövde bu sürümde değişmedi. ADR-0029 uyarınca yeni abonelik satışı kapalıdır;
> bu metin yalnız daha önce başlatılmış abonelikler için tutulur. Ön bilgide `consent_kind` sözleşme v1.1 değerine
> (abonelik_sozlesmesi) çekildi; ön bilgilendirme formunun madde numarası değiştiği için madde 7 atfı güncellendi.

Dayanak: 6502 sayılı Kanun m.52 (güncel metin mevzuat.gov.tr'den okundu; sözleşmenin bir nüshası kâğıtta veya kalıcı veri saklayıcısıyla verilir) ve Abonelik Sözleşmeleri Yönetmeliği
(RG 24/1/2015, 29246). Yönetmelik m.2/2 uyarınca bu tür aboneliklere m.5, 6, 7, 8, 13, 22, 23, 24 ve 25
uygulanır; taahhütname (m.15) Kazuist'in gönüllü olarak eklediği bir belgedir. Sözleşme en az 12 punto
eşdeğerinde ve kalıcı veri saklayıcısıyla verilir (m.5). Abonelik adımında ön bilgilendirme formu ve
mesafeli satış sözleşmesi de onaylanır.

## Madde 1. Taraflar

Hizmet sağlayıcı: Kulular Bilişim Teknolojileri Ltd. Şti., MERSİS 0591095454600001, Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara, teknoloji@kulular.com.
Abone: {{ALICI_AD}}, {{ALICI_EPOSTA}}.

## Madde 2. Konu ve süre

Konu: {{PLAN_ADI}} planı. Sözleşme belirsiz sürelidir. Ödeme dönemi: {{ODEME_DONEMI}} (aylık veya yıllık).
Sözleşme tarihi: {{SOZLESME_TARIHI}}. İlk hizmet (kredi yüklemesi ve plan özellikleri) tarihi: ödeme
doğrulandığı an.

## Madde 3. Bedel

Dönem bedeli KDV dahil {{TUTAR_TL}} TL'dir. Her dönemin başında iyzico aracılığıyla kaydettiğiniz karttan
tahsil edilir. Her ay {{AYLIK_KREDI}} kredi yüklenir; yıllık planda yükleme her ay, abonelik etkin oldukça yapılır.

## Madde 4. Bildirimler

Her otomatik tahsilattan en az 7 gün önce, yıllık yenilemede ayrıca 30 gün önce e-posta gönderilir. Fiyat
değişikliği en az 30 gün önce bildirilir ve sonraki dönemden geçerli olur.

## Madde 5. Fesih

1. Abone sözleşmeyi dilediği an, gerekçe göstermeden ve cezai şart ödemeden fesih edebilir (m.22).
2. Fesih hesap sayfasında tek adımdır ve aboneliği başlatmaktan zor değildir (m.23). Seçenekler: "dönem
   sonunda bitir" (varsayılan) ve "hemen bitir". Fesih anında işlenir (m.24 en geç 7 gün öngörür).
3. Fesih sonucu e-postayla yazılı olarak bildirilir (m.25).
4. Hemen fesihte aylık plan: o ayın kredisi yüklenmiş olduğundan iade yoktur; krediler hesapta kalır.
5. Hemen fesihte yıllık plan: teslim edilmemiş aylık yüklemelerin bedeli 15 gün içinde iade edilir (m.25),
   taahhütnamedeki formülle.

## Madde 6. Başarısız tahsilat

Tahsilat 1., 3. ve 7. gün yeniden denenir; sonra plan Ücretsiz'e iner, mevcut krediler kalır.

## Madde 7. Cayma

Krediler ödemeyle birlikte yüklendiği ve kullanılabilir olduğu için cayma kuralı ön bilgilendirme formu
madde 6'daki gibidir. İlk dönemin kredilerinden hiç kullanılmamışsa sözleşmenin kurulduğu günden itibaren
14 gün içinde fesih ve tam iade yapılır (varsayılan karar, Tarık itiraz etmezse geçerli).

## Yıllık plan taahhütnamesi

Bu taahhütname sözleşmenin ayrılmaz parçasıdır.

| Unsur | Değer |
|---|---|
| Taahhüdün niteliği | Belirsiz süreli aboneliğin 12 aylık ödeme dönemi; abone her an fesih edebilir |
| Ödeme dönemi başlangıcı ve bitişi | {{DONEM_BASLANGIC}} - {{DONEM_BITIS}} |
| Hizmet | {{PLAN_ADI}}, her ay {{AYLIK_KREDI}} kredi |
| Yıllık toplam bedel (KDV dahil) | {{YILLIK_TUTAR_TL}} TL |
| Taahhütsüz (aylık) liste fiyatı | {{AYLIK_LISTE_FIYATI_TL}} TL/ay |
| Aylık karşılığı indirim | {{AYLIK_INDIRIM_TL}} TL |
| Erken fesihte iade formülü | İade = ödenen yıllık bedel x (yüklemesi yapılmamış ay sayısı / 12); yıllık bedel aylara eşit bölünür, indirim geri alınmaz. Ek bedel istenmez |
| Örnek | Öğrenci Plus yıllık 799 TL; 3 ay yüklemesi yapılmışken hemen fesihte iade = 799 x 9 / 12 = 599,25 TL |
| İade süresi | Fesihten itibaren 15 gün |

Taahhütlü fiyat, taahhütsüz fiyatın üzerinde değildir.
