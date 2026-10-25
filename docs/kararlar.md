# Tarık kararları

Plan dışı ya da plan içinde Tarık onayı bekleyen kararların tarihli kaydı. ADR gerektirenler ayrıca ADR'ye işlenir.

| Tarih | Konu | Karar | Kaynak |
|---|---|---|---|
| 2026-10-19 | ADR-0001..0020 | Kabul | Sohbet onayı |
| 2026-10-20 | Şirket künyesi (MERSİS 0591095454600001, Ankara Ticaret Sicili 550123, Kızılırmak Mah. 1450 Sk. Hayat Plaza No: 16 Çankaya / Ankara) | Kabul; kaynak mevcut sitenin /tr/hakkinda sayfası | Sohbet onayı |
| 2026-10-20 | Alt bilgi iletişim adresi kulularteknoloji@gmail.com | Kabul | Sohbet onayı |
| 2026-10-20 | Casuist başlık görseli ve TÜBİTAK, Eureka, Eurostars, üniversite logoları | Geri eklenir; görselin YZ ürünü olmadığı ve logo kullanım izni Tarık beyanıdır | Sohbet onayı |
| 2026-10-20 | Fiyat ve kredi tabloları (plan 4.2-4.4) | Kabul; /fiyatlar sayfasından TASLAK notu kalkar | Sohbet onayı |
| 2026-10-20 | NER aday model ağırlıklarının yerelde indirilmesi (Hushmark BERTurk, akdeniz27, GLiNER multi v2.1) | Kabul; ağırlıklar depoya girmez, savasy lisans netleşene kadar bekler | Sohbet onayı |
| 2026-10-22 | Aynı anda çalışan alt ajan sayısı | En fazla 3-4 | Sohbet onayı |
| 2026-10-22 | Orkestra varsayılanları (Tarık "sorma, sen karar ver" dedi) | Yaş sınırı 18 ve kayıtta beyan; hesap silme bekleme 14 gün; abonelikte ilk dönem kredisi hiç kullanılmamışsa 14 gün içinde tam iade; sonucu belirsiz iade (refund_pending): kredi kilitli kalır, yönetici 3 iş günü içinde iyzico panelinden doğrulayıp kapatır; iyzico inceleme (fraudStatus 0) sonucu IFN'e bağlı kalmadan bekleyen siparişleri yeniden sorgulayan işle izlenir | Orkestra varsayılanı |
| 2026-10-22 | Yıllık plan hemen fesih iadesi (ADR-0024 riski) ve koşul değişikliği bildirimi | İade = ödenen yıllık bedel eksi (yüklemesi yapılmış ay sayısı çarpı yıllık bedel / 12); liste fiyatıyla mahsup kullanılmaz (Abonelik Yön. m.25 karşısında tüketici lehine, uyuşmazlık riski düşük). Koşul değişikliği en az 30 gün önce bildirilir | Orkestra varsayılanı |
| 2026-10-22 | BYOK'ta Gemini ücretsiz katman (Gemini API Additional Terms, AEA, İsviçre, Birleşik Krallık kullanıcıları) | Gemini anahtarı yalnız kullanıcı ücretli faturalandırmayı beyan ederse kabul edilir; beyan yoksa Gemini BYOK kapalı (plan 8.4 daraltıldı) | Orkestra varsayılanı |
| 2026-10-23 | Platform YZ sağlayıcısı | OpenRouter (ADR-0025); Anthropic doğrudan yedek, anahtarı zorunlu değil | Sohbet kararı |
| 2026-10-23 | Künye iletişim bilgileri | E-posta teknoloji@kulular.com, telefon +90 505 781 48 46 (kulular.com.tr'de yayımlı); önceki gmail adresinin yerine | Orkestra varsayılanı, kaynak kulular.com.tr |
| 2026-10-23 | iyzico sandbox anahtarları | ~/Desktop/kazuist-iyzico-sandbox.txt (izin 600); kaynak Tarık'ın verdiği dosya, iki değer de sandbox önekli; IYZICO_MERCHANT_ID eksik | Tarık |

Henüz onaylanmamış: hukuki metinler (TASLAK), kaynak bağlayıcılarının üretimde açılması (docs/kaynaklar), anonimleştirme policy.yaml, DNS ve canlı ödeme.

## Orkestra devralma varsayılanları, 25 Ekim 2026

- Önceki iki Claude ajanının son kayıtları kullanım sınırında durduğunu gösterdi; mevcut kirli mimar
  worktree'si korunarak devralındı, ödeme PR #30 dört tamamlanmış yeşil CI işi sonrası birleştirildi.
- Dalga 1 kapısı yeniden ölçülmeden Dalga 2 başlamaz. Staging yokluğu ve gerçek sandbox kabul kanıtının
  eksikliği geçer olarak yazılmaz. Sağlayıcı cevap şekli fikstürü gerçek uygulama uçtan uca testi sayılmaz.
- 100001 cevabından sandbox abonelik özelliğinin kapalı olduğu kesin sonucu çıkarılmaz. Resmî belgeye
  göre aktivasyon durumu entegrasyon ekibinden teyit edilir; ileti gönderimi kullanıcı onayına tabidir.
- ADR-0021, 0022, 0023, 0024 ve yeni 0026 için önceki onay eksikliği korunur; bu oturum onay verilmiş gibi
  kayıt açmaz, planı bu önerilerle değiştirmez ve sürüm etiketi koymaz.

## 2026-10-25: ADR onayları ve iyzico yazışma yetkisi

Kullanıcı ADR-0021, ADR-0022, ADR-0023, ADR-0024 ve ADR-0026 kararlarını açıkça onayladı. İyzico sandbox abonelik aktivasyon taslağının gönderilmesine de izin verdi. Gönderim kaydı, kayıtlı hesap ve gönderilmiş ileti doğrulandıktan sonra eklenir. Hukuki metinlerin yayını için bu onaylardan izin çıkarılmaz; künye dosyasını kullanıcı dolduracak.
