# Devralma sonrası onay ve hesap adımları

25 Ekim 2026. Bu liste teknik tercih sorusu içermez; hazır ADR'ler, kullanıcı hesabından yapılacak işlem
ve eksik şirket bilgileri içindir. Parola veya token değeri sohbete yazılmaz.

## Kullanıcıdan gerekenler (tek liste)

1. Aşağıdaki ADR önerilerinin onayı:
   - [ADR-0021](../adr/0021-yerel-s3-seaweedfs.md): yerel geliştirme ve CI nesne deposu SeaweedFS.
   - [ADR-0022](../adr/0022-altin-set-etiketleme.md): Türkiye'de, iç ağda altın set etiketleme yöntemi.
   - [ADR-0023](../adr/0023-sozlesme-v1-1.md): sözleşme 1.1 ve eklemeli migration 0003.
   - [ADR-0024](../adr/0024-abonelik-atif-duzeltmesi.md): abonelik atıfları ve yıllık bedelin aylara eşit
     bölündüğü, tüketici lehine iade yaklaşımı. Mevcut orkestra varsayılanı korunuyor; ADR kabul kaydı yok.
   - [ADR-0026](../adr/0026-sozlesme-v1-2.md): sözleşme 1.2, eklemeli migration 0004, defter korumaları,
     ödeme ve bildirim sözleşmeleri. Ürün fiyat sürümleme tüketicisi henüz tamam değil.
2. Sandbox abonelik erişimi: https://sandbox-merchant.iyzipay.com adresindeki hesabınıza kayıtlı e-posta
   adresinden entegrasyon@iyzico.com adresine aktivasyon/durum teyidi talebi gönderin. Tam adımlar ve
   gönderilmemiş hazır taslak [runbook'ta](../runbook/iyzico-sandbox-aktivasyon.md). Ajanın göndermesini
   isterseniz bu somut taslağın gönderimine açık onay gerekir. Resmî belge sandbox için bu yolu tarif
   ediyor; Eklentiler sayfasından satın alma canlı hesap içindir. 100001 cevabı tek başına eklentinin
   kapalı olduğunu kanıtlamaz. Yeni anahtar değeri istenmiyor; mevcut dosya yolu yeterli.
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

Onaylar bekliyor. Bu oturumda DNS, canlı ödeme, üretim migration'ı, App Store gönderimi veya kuruma ileti
uygulanmadı. Dalga 1 kapısı yeniden ölçüldü; kapı kapanmadan sonraki dalga başlamaz.
