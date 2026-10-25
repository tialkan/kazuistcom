# Devralma sonrası onay ve hesap adımları

25 Ekim 2026. Bu liste teknik tercih sorusu içermez; hazır ADR'ler, kullanıcı hesabından yapılacak işlem
ve eksik şirket bilgileri içindir. Parola veya token değeri sohbete yazılmaz.

## Kullanıcıdan gerekenler (tek liste)

1. ADR-0021, ADR-0022, ADR-0023, ADR-0024 ve ADR-0026, 25 Ekim 2026 sohbetinde kullanıcı tarafından onaylandı. Yeniden onay istenmez. Sonradan hazırlanan ADR-0027 bu onayın kapsamında değildir.
2. İyzico taslağını gönderme yetkisi aynı mesajda verildi. [Runbook](../runbook/iyzico-sandbox-aktivasyon.md) taslağı, sandbox kayıtlı gönderen e-posta adresi doğrulanınca ajan tarafından gönderilecek. Açık posta hesaplarında kayıt iletisi bulunamadı ve sandbox paneli giriş ekranında; yalnız kayıtlı e-posta adresi veya kullanıcının panelde oturum açması gerekiyor. Parola/token değeri istenmez. İleti henüz gönderilmedi.
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

Beş ADR ve taslağın gönderimi onaylandı; gönderim doğrulaması ve künye bekliyor. Bu oturumda DNS, canlı ödeme, üretim migration'ı, App Store gönderimi veya kuruma ileti
uygulanmadı. Dalga 1 kapısı yeniden ölçüldü; kapı kapanmadan sonraki dalga başlamaz.
