# Devralma sonrası onay ve hesap adımları

25 Ekim 2026. Bu liste teknik tercih sorusu içermez; hazır ADR'ler, kullanıcı hesabından yapılacak işlem
ve eksik şirket bilgileri içindir. Parola veya token değeri sohbete yazılmaz.

## Kullanıcıdan gerekenler (tek liste)

1. ADR-0021, ADR-0022, ADR-0023, ADR-0024 ve ADR-0026, 25 Ekim 2026 sohbetinde kullanıcı tarafından onaylandı. Yeniden onay istenmez. Sonradan hazırlanan ADR-0027 bu onayın kapsamında değildir.
2. İyzico gönderim yetkisi kullanıldı: taslak, sandbox profilindeki kayıtlı hesaptan `entegrasyon@iyzico.com` adresine 26 Ekim 2026 00:32 gönderildi; Gönderilenler'de doğrulandı. Yanıt ve uygulama sandbox kabulü bekleniyor. Tekrar gönderim veya kullanıcı hesabı adımı gerekmiyor.
3. Künye: VKN, vergi dairesi ve KEP alanlarını `~/Desktop/kazuist-kunye.txt` dosyasında doldurun; yalnız
   dosya yolunu bildirin. Mevcut dosya varsa üzerine yazılmadı; yoksa boş alanlı, izin 600 şablonu hazırlandı.

## Önce orkestranın tamamlayacağı işler

- Türkiye VPS sağlayıcısının plan 5.5 ölçütleri teyit edilip somut satın alma paketi hazırlanacak.
  Kullanıcıdan teknik sağlayıcı seçimi istenmez; ücretli satın alma ve DNS için somut onay ayrı alınır.
- Hukuki metinlerdeki yedi doğrulama işareti ve künye alanları kapanınca son yayım onayı sunulacak.
  Bu aşamada tamamlanmamış metinlere yayım onayı istenmiyor.
- Python bağımlılık açıkları ve tarama hata kodu davranışı, PDF/kalıcı sözleşme teslimi, gerçek sandbox
  akışı ve dolu rapor eşlemesi açık teknik işlerdir. Bunlar kullanıcıya devredilmez.

## Sonuç

Beş ADR ve taslağın gönderimi onaylandı; iyzico yanıtı ve künye bekliyor. Bu oturumda DNS, canlı ödeme, üretim migration'ı, App Store gönderimi uygulanmadı; yalnız yukarıda yetkilendirilen iyzico iletisi gönderildi. Dalga 1 kapısı yeniden ölçüldü; kapı kapanmadan sonraki dalga başlamaz.
