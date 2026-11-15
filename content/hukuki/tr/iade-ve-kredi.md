---
title: İade, iptal ve kredi kuralları
slug: iade-ve-kredi
route: /hukuki/iade-ve-kredi
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Bu metin plan 4.5'i birebir izler; dayanak
> atıfları ayrıca doğrulanmıştır (aşağıdaki notlar). ADR-0029 uyarınca yeni abonelik satışı yapılmadığı 6. bölüme
> yazıldı. Kredi satışı ilk yayında kapalıdır (ADR-0038, apps/web/src/server/billing/acik.ts `odemeAcik`: iyzico
> anahtarları yokken satın alma akışı sunulmaz); girişe bu durum yazıldı. Satış açılmadan önce metin yeniden onaya
> sunulur.

Kredi satışı henüz açılmamıştır; şu anda kredi satın alınamaz. Kazuist'in sunulan özelliklerini günlük ücretsiz
hakla ve kendi OpenRouter anahtarınızla kullanabilirsiniz. Aşağıdaki satın alma, iade ve abonelik kuralları kredi
satışı açıldığında uygulanır.

## 1. Krediler

1. Satın aldığınız kredinin süresi dolmaz.
2. Promosyon kredisi (kayıt hediyesi, kupon, pilot) 90 gün geçerlidir, iade edilmez, nakde çevrilmez.
3. Kredi devredilemez ve yalnız Kazuist hizmetlerinde kullanılır.
4. İşlem başına kredi ve kalan bakiyeniz her ekranda görünür; 20 kredinin üstündeki işlemde onayınız istenir.
5. Fiyatlar KDV dahildir.

## 2. Tüketim sırası

Önce süresi en yakın promosyon kredisi, sonra abonelik yüklemesi, sonra paket kredisi kullanılır; her biri
kendi içinde ilk giren ilk çıkar.

## 3. Rezervasyon

İşlem başlarken tahmini kredi ayrılır, işlem bitince gerçekleşen düşülür, fazlası çözülür. 5 dakikada
tamamlanmayan rezervasyon kendiliğinden çözülür.

## 4. Çekimser sonuç ve teknik hata

Dayanak yetersiz olduğu için özet üretilmezse kredi düşülmez. Teknik hata da ücretsizdir.

## 5. Kredi paketi iadesi

Satın almadan sonraki 14 gün içinde ve paketten hiç kredi kullanılmamışsa tam iade yapılır. Kullanım
başlamışsa iade yoktur; bu durum ödeme öncesinde ayrı bir kutuyla onayınıza sunulur (Mesafeli Sözleşmeler
Yönetmeliği m.15/1-ğ ve h).

## 6. Abonelik

Kazuist yeni abonelik satmaz; bütün özellikler ücretsizdir ve yalnız kredi paketi satılır. Bu bölüm, daha önce
başlatılmış bir abonelik varsa o aboneliğin hakları için geçerlidir.

1. Abonelik belirsiz sürelidir; ödeme dönemi aylık veya yıllıktır. Yıllık plan, belirsiz süreli sözleşmenin
   yıllık ödeme dönemidir; belirli süreli sözleşme kendiliğinden uzamaz (Abonelik Sözleşmeleri Yönetmeliği m.13).
2. Fesih hesap sayfasında tek adımdır ve abonelik başlatmaktan zor değildir (Abonelik Yön. m.23). Varsayılan
   seçenek "dönem sonunda bitir"dir; "hemen bitir" seçeneği de vardır. Fesih anında işlenir (Yönetmelik en
   geç 7 gün istiyor, m.24).
3. Hemen fesihte aylık plan: o ayın kredisi yüklenmiş olduğundan iade yoktur, krediler hesabınızda kalır.
4. Hemen fesihte yıllık plan: teslim edilmemiş aylık yüklemelerin bedeli 15 gün içinde iade edilir
   (Abonelik Yön. m.25). Formül: iade = ödenen yıllık bedel x (yüklemesi yapılmamış ay sayısı / 12); yıllık bedel aylara eşit bölünür, indirim geri alınmaz. Örnek: Öğrenci Plus yıllık 799 TL; 3 ay yüklemesi yapılmışken hemen fesihte iade = 799 x 9 / 12 = 599,25 TL.
5. Ödeme bildirimi: her otomatik tahsilattan en az 7 gün önce e-posta; yıllık yenilemede ayrıca 30 gün önce.
6. Fiyat değişikliği: mevcut abonelere en az 30 gün önce bildirilir; yeni fiyat sonraki dönemden geçerlidir;
   dilediğiniz an fesih edebilirsiniz (fesih hakkı m.22/1; 30 günlük bildirim Kazuist taahhüdüdür).
7. Başarısız tahsilat: 1., 3. ve 7. gün yeniden denenir; sonra plan Ücretsiz'e iner, mevcut krediler kalır.
8. Fesih sonucu e-postayla yazılı olarak bildirilir.
9. İlk dönemin kredilerinden hiç kullanılmamışsa, aboneliğin başladığı günden itibaren 14 gün içinde fesihte
   ödenen bedelin tamamı iade edilir (varsayılan karar, Tarık itiraz etmezse geçerli).
10. İade işleminin sonucu ödeme kuruluşundan alınamazsa krediler hesabınızda kalır ve talep yönetim tarafından
   elle sonuçlandırılır; sonuç size e-postayla bildirilir.

## 7. Ters ibraz ve Apple iadesi

İlgili kredi geri alınır; bakiye eksiye düşerse yeni YZ işlemi açılmaz.

## 8. iOS

iOS uygulaması yayımlandığında, iOS'ta yapılan satın alımlarda faturalama, yenileme ve iade Apple sistemindedir. İptal: iPhone Ayarlar >
[adınız] > Abonelikler. İade talebi Apple'a yapılır.

## 9. Hesap silme

Kullanılmamış satın alınmış krediniz varsa silme ekranında uyarı ve iade talebi seçeneği gösterilir;
talep yönetim onayıyla sonuçlanır.

## Dayanak notları (onay öncesi kapatılacak)

- Mesafeli Sözleşmeler Yönetmeliği (RG 27/11/2014, 29188) m.15/1-ğ elektronik ortamda anında ifa edilen
  hizmetler ve anında teslim edilen gayrimaddi mallar, (h) cayma süresi dolmadan tüketicinin onayıyla
  ifasına başlanan hizmetler konusundadır (özgün metnin özeti, resmigazete.gov.tr/eskiler/2014/11/20141127-6.htm;
  birebir lafız onaydan önce karşılaştırılacak). 23/8/2022 tarihli ve 31932 sayılı değişiklik (resmigazete.gov.tr/eskiler/2022/08/20220823-2.htm) m.15/1'e yeni
  bentler ekledi, (ğ) ve (h) bentlerini değiştirmedi. 4/11/2023 tarihli 32359 sayılı Resmî Gazete'deki ilgili metin
  bu yönetmeliği değiştirmiyor.
- Abonelik Sözleşmeleri Yönetmeliği (RG 24/1/2015, 29246) m.2/2: elektrik, su, doğal gaz ve elektronik
  haberleşme dışındaki aboneliklere yalnız m.5, 6, 7, 8, 13, 22, 23, 24 ve 25 uygulanır. Bu yüzden 7 gün
  önce ödeme bildirimi (plan 4.5/8'de m.19-20), 30 gün önce fiyat bildirimi (plan 4.5/9'da m.22) ve yıllık
  plan taahhütnamesi (m.15) Kazuist için kanuni zorunluluk değil, Kazuist'in gönüllü taahhüdü olarak yazıldı.
  m.22 bu aboneliğe uygulanır: belirsiz süreli sözleşmede tüketici her an, gerekçesiz ve cezasız fesih edebilir
  (m.22/1). Fiyat değişikliği bildirimini düzenleyen bir hüküm m.2/2 listesinde yoktur; 30 gün kuralı gönüllüdür
  (ADR-0024 taslağı). [DOĞRULANACAK: 2015 sonrası bu yönetmeliği değiştiren bir düzenleme olup olmadığı;
  mevzuat.gov.tr'deki işlenmiş metinle karşılaştırılacak. 21/12/2023 tarihli değişiklik başka bir yönetmeliğe
  (Abonelik Sözleşmesinden Kaynaklanan Para Alacakları) ilişkindir.]
