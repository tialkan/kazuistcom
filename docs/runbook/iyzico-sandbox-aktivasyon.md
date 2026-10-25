# iyzico sandbox abonelik erişimi

Doğrulama: 25 Ekim 2026. Resmî kaynak: https://docs.iyzico.com/urunler/abonelik/abonelik-entegrasyonu

PR #30 denemesinde abonelik ürünü oluşturma `100001` (sistem hatası) döndü. Bu cevap tek başına hesabın
abonelik özelliğinin kapalı olduğunu kanıtlamaz. Gerçek abonelik mutlu yolu henüz geçmedi.

Resmî belge sandbox için panelden eklenti satın almayı değil, kayıtlı e-posta adresi veya üye işyeri numarasıyla
entegrasyon@iyzico.com adresinden aktivasyon istemeyi tarif ediyor. Eklentiler sayfası canlı hesap içindir.

## Kullanıcıdan gereken tek hesap adımı

1. https://sandbox-merchant.iyzipay.com adresinde sandbox hesabınızı açın. Gerekirse Ayarlar > Firma Ayarları
   bölümünden hesap ve üye işyeri bilgisini kontrol edin. Anahtarları sohbete yazmayın.
2. Hesaba kayıtlı e-posta adresinden entegrasyon@iyzico.com adresine aşağıdaki taslağı gönderin veya bu somut
   gönderim için orkestraya açık onay verin. Ajan bu belgeyi yazarken hiçbir ileti göndermedi.
3. Aktivasyon teyidinden sonra ajan, mevcut `~/Desktop/kazuist-iyzico-sandbox.txt` yolunu kullanarak ürün,
   plan, abonelik ve yenileme akışını yeniden ölçecek. Yeni token değeri istenmiyor.

## Gönderilmemiş taslak

Konu: Kazuist sandbox hesabında abonelik özelliğinin etkinleştirilmesi

Merhaba,

Kazuist entegrasyonumuz için bu e-posta adresine kayıtlı sandbox hesabımızda abonelik özelliğinin
etkinleştirilmesini rica ederiz. Abonelik ürünü oluşturma denememizde 100001 sistem hatası aldık.
Hesabımızdaki abonelik yetkisinin durumunu kontrol ederek sandbox erişimini açabilir misiniz?

Teşekkürler.

## Ölçüm sınırı

Önceki sandbox kaydı ödeme, kart reddi, 3DS başlatma, ödenmemiş token ve kısmi iade cevap biçimlerini içeriyor.
Bu kayıt uygulamanın HPP ve 3DS tarayıcı adımları, webhook teslimi, abonelik ve rapor eşlemesi dahil tüm
uçtan uca kabul senaryolarının geçtiği anlamına gelmez. Canlı ödeme anahtarı bu açıklar kapanmadan istenmez.

## Gönderim kaydı, 26 Ekim 2026

Kullanıcının 25 Ekim açık yetkisiyle taslak, sandbox profilinde doğrulanan kayıtlı hesaptan `entegrasyon@iyzico.com` adresine 26 Ekim 2026 00:32 (Europe/Istanbul) gönderildi. Gmail Gönderilenler içinde alıcı, konu ve gövde doğrulandı. Bu kayıt aktivasyonun tamamlandığını göstermez; iyzico yanıtı ve gerçek uygulama kabulü beklenir. Yerel görsel kanıt: `/tmp/kazuist-iyzico-sent-20261026.png`.
