# ADR-0024: Plan 4.5 abonelik atıflarının düzeltilmesi

- Tarih: 2026-10-22 (güncelleme 2026-10-25: yıllık plan iade formülü docs/kararlar.md 2026-10-22 satırına göre)
- Karar kodu: yok (plan 4.5, 11; istek: docs/istekler/hukuk-uyum-urun-tutarliligi.md madde 1)
- Durum: Kabul edildi (2026-10-25, kullanıcı onayı)

## Bağlam

Plan 4.5/5-9, Kazuist aboneliği için Abonelik Sözleşmeleri Yönetmeliği'nin (RG 24/1/2015, 29246) m.13, 15, 16,
19-20, 22, 23, 24 ve 25'ine kanuni dayanak olarak atıf yapıyor. Yönetmeliğin özgün metni
(https://www.resmigazete.gov.tr/eskiler/2015/01/20150124-2.htm, 2026-10-22'de okundu) m.2/2'de elektrik, su,
doğal gaz ve elektronik haberleşme dışındaki abonelik sözleşmelerine yalnız m.5, 6, 7, 8, 13, 22, 23, 24 ve 25'in
uygulanacağını söylüyor. Kazuist aboneliği bu dört sektörün dışındadır.

Doğrulama sonucu:

- m.13 (belirli süreli sözleşme kendiliğinden uzamaz), m.23 (fesih yöntemi kuruluştan zor olamaz), m.24 (fesih
  en geç 7 günde işlenir), m.25 (fesih teyidi; kullanılmayan ön ödemenin 15 günde iadesi) uygulanır.
- m.22 uygulanır. m.22/1: belirsiz süreli veya bir yıl ve daha uzun belirli süreli abonelikte tüketici her an,
  gerekçesiz ve cezasız fesih edebilir. m.22, fiyat değişikliği bildirimi içermez; plan 4.5/9'daki "30 gün önce
  bildirim" m.22'ye dayanamaz. m.2/2 listesindeki hiçbir madde genel bir fiyat değişikliği bildirimi düzenlemiyor
  (m.6/1-i yalnız zorunlu ek ücretlerin değişince nasıl bildirileceğinin sözleşmede yazılmasını istiyor).
- m.15 (taahhütname), m.16 (taahhüt ihlalinde talep edilebilecek bedel), m.19-20 (ödeme bildirimi ve 7 gün
  önce gönderim) Kazuist aboneliğine uygulanmaz.

Sonraki değişikliklerin m.2/2 listesini değiştirip değiştirmediği mevzuat.gov.tr işlenmiş metniyle ayrıca
karşılaştırılacak; 21/12/2023 tarihli değişiklik başka bir yönetmeliğe ilişkindir.

## Karar

1. Plan 4.5'teki m.15, m.16, m.19-20 ve fiyat değişikliği için m.22 atıfları "Kazuist'in gönüllü taahhüdü" olarak
   yeniden yazılır. Taahhütler (yıllık plan taahhütnamesi, 7 ve 30 gün önce ödeme bildirimi, 30 gün önce fiyat
   değişikliği bildirimi, yıllık plan iade formülü) ürün davranışı olarak aynen korunur.
2. Kanuni dayanak olarak yalnız m.5, 6, 13, 22, 23, 24 ve 25 gösterilir; 6502 sayılı Kanun m.52 ve Mesafeli
   Sözleşmeler Yönetmeliği hükümleri saklıdır.
3. Yıllık plan hemen fesih iadesi eşit bölüşümle hesaplanır (docs/kararlar.md, 2026-10-22, orkestra
   varsayılanı): iade = ödenen yıllık bedel - (kredi yüklemesi yapılmış ay sayısı x ödenen yıllık bedel / 12).
   Kesinti kuruşa aşağı yuvarlanır (tüketici lehine) ve iade sıfırın altına inmez. Yüklemesi yapılmamış aylar
   m.25 anlamında kullanılmamış ön ödemedir ve kesintisiz iade edilir. Aylık liste fiyatıyla mahsup kullanılmaz;
   önceki taslaktaki mahsup uygulanmayan m.16'ya dayanıyordu. Uygulama: packages/ledger
   `annualRefundKurus({ paidKurus, grantedMonths })`. Örnek (varsayımsal tutar): 1.200,00 TL ödenmiş ve 3 ayı
   yüklenmiş planda kesinti 300,00 TL, iade 900,00 TL.
4. Koşul ve fiyat değişikliği abonelere en az 30 gün önce bildirilir; yeni fiyat sonraki dönemden geçerlidir.
   Bu bildirim gönüllü taahhüttür (m.22 fiyat değişikliği bildirimi düzenlemez).

## Gerekçe

Uygulanmayan hükme dayanak olarak atıf yapmak denetimde ve uyuşmazlıkta yanıltıcıdır; taahhütlerin gönüllü
olduğunu açıkça yazmak tüketici lehine davranışı değiştirmeden metni doğru kılar. Eşit bölüşüm, yüklenmemiş
aylar için hiçbir kesinti bırakmadığından m.25'in kesintisiz iade kuralıyla çatışmaz ve uyuşmazlık riskini
düşürür; liste fiyatıyla mahsup ise ancak uygulanmayan m.16'ya dayanabiliyordu.

## Sonuçlar

- content/hukuki/tr/iade-ve-kredi.md ve abonelik.md bu ADR'ye göre yazıldı. abonelik.md'deki
  {{AYLIK_LISTE_FIYATI_TL}} ve {{AYLIK_INDIRIM_TL}} alanları eşit bölüşümde gerekmez; metin ve PDF alan listesi
  hukuk-uyum tarafından güncellenir (docs/istekler/odeme-denetim-2.md).
- plan.md 4.5 metni orkestra tarafından düzeltilir (plan.md orkestranındır).
- docs/adr/README.md dizinine satır mimar tarafından eklenir.

## Durum

Kabul edildi (2026-10-25, kullanıcı onayı).
