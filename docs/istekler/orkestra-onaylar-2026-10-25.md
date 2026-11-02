# Devralma sonrası onay ve hesap adımları

25 Ekim 2026. Bu liste teknik tercih sorusu içermez; hazır ADR'ler, kullanıcı hesabından yapılacak işlem
ve eksik şirket bilgileri içindir. Parola veya token değeri sohbete yazılmaz.

## Kullanıcıdan gerekenler (tek liste)

1. ADR-0021, ADR-0022, ADR-0023, ADR-0024 ve ADR-0026, 25 Ekim 2026 sohbetinde kullanıcı tarafından onaylandı. Yeniden onay istenmez. ADR-0027 ayrıca27Ekim2026 mesajında onaylandı; yeniden onay istenmez. YeniADR-0028 henüz öneridir.
2. İyzico gönderim yetkisi kullanıldı: taslak, sandbox profilindeki kayıtlı hesaptan `entegrasyon@iyzico.com` adresine 26 Ekim 2026 00:32 gönderildi; Gönderilenler'de doğrulandı. Yanıt ve uygulama sandbox kabulü bekleniyor. Tekrar gönderim veya kullanıcı hesabı adımı gerekmiyor.
3. Künye: VKN, vergi dairesi ve KEP alanlarını `~/Desktop/kazuist-kunye.txt` dosyasında doldurun; yalnız
   dosya yolunu bildirin. Mevcut dosya varsa üzerine yazılmadı; yoksa boş alanlı, izin 600 şablonu hazırlandı.

4. GitHubActions hesap engeli: https://github.com/settings/billing > Billing and licensing. Ödeme uyarısı varsa hesap sahibi düzeltir; Budgets and alerts > Actions engeli varsa uygun bütçeyi kendisi belirler. Sonrun40445808966 hiçbir adıma başlamadı. Kart/parola/token değeri sohbete yazılmaz; kullanıcı düzeldi bilgisini verince CI yeniden çalıştırılır.

5. ADR-0028: hesap silme iadesinin denetlenebilir yönetici kararı ve paket bazında yürütülmesi, PR47/49 somut adaylarıyla öneridir. Canlı iade veya üretim migration izni içermez.
6. ADR-0029: bütün özellikler/BYOK ücretsiz, gelir yalnız isteğe bağlı platform kredisi olacak şekilde planın uyumu. Kullanıcının ürün açıklaması kaydedildi; plan değişikliği için somut ADR önerisi PR48'de. Public görünürlük ve Apache-2.0 ayrıca onay bekler; geçmiş/log/artifact mahremiyet incelemesi tamamlanmadan yayın yapılmaz. Public sorusu görünürlük izni sayılmadı.

## Önce orkestranın tamamlayacağı işler

- Türkiye VPS sağlayıcısının plan 5.5 ölçütleri teyit edilip somut satın alma paketi hazırlanacak.
  Kullanıcıdan teknik sağlayıcı seçimi istenmez; ücretli satın alma ve DNS için somut onay ayrı alınır.
- Hukuki metinlerdeki yedi doğrulama işareti ve künye alanları kapanınca son yayım onayı sunulacak.
  Bu aşamada tamamlanmamış metinlere yayım onayı istenmiyor.
- Python bağımlılık açıkları/tarama hata kodu ve rapor eşlemesi main üzerinde düzeltildi; PDF/kalıcı belge adayı yerel kaliteyi geçti fakat son CI kapısı hesap engelinde. O9 yönetici iade adayının bağımsız denetimi ve gerçek sandbox/staging kabulü sürüyor. Bunlar kullanıcıya devredilmez.

## Sonuç

Beş ADR ve taslağın gönderimi onaylandı; iyzico yanıtı ve künye bekliyor. Bu oturumda DNS, canlı ödeme, üretim migration'ı, App Store gönderimi uygulanmadı; yalnız yukarıda yetkilendirilen iyzico iletisi gönderildi. Dalga 1 kapısı yeniden ölçüldü; kapı kapanmadan sonraki dalga başlamaz.
