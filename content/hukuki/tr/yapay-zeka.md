---
title: Yapay zekâ politikası
slug: yapay-zeka
route: /hukuki/yapay-zeka
lang: tr
binding: true
version: 2026-11-15.1
date: 2026-11-15
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 15 Kasım 2026. Mevcut sayfanın güncellenmiş hâlidir. BYOK bölümü
> yayındaki arayüze göre yazıldı (packages/ai-gateway/src/byok/settings.ts ve client.ts, adapters/index.ts
> `data_collection: 'deny'`, packages/i18n/tr/byok.json): tarayıcıdan doğrudan çağrı yalnız OpenRouter ile çalışır.
> Arayüz aktarma modunu (sunucu üzerinden BYOK) sunmadığı için o satır "sunulmuyor" diye yazıldı; doğrudan Gemini
> anahtarı kabul edilmediği için Gemini ücretsiz katman bölümü çıkarıldı (geri gelirse docs/kvkk ve acik-riza madde
> 4 ile birlikte). iOS uygulaması henüz yoktur. Kredi satışı ilk yayında kapalıdır (ADR-0038).

## 1. Kazuist'te yapay zekânın rolü

Kazuist bir araştırma ve öğrenme aracıdır. Kaynaklı özet, bulunan kararları ve mevzuatı özetler; her cümle
dayandığı kaynak pasajına bağlanır. Kazuist kişiye özgü hukuki mütalaa vermez, avukatlık hizmeti sunmaz;
çıktıyı değerlendirme ve kullanma sorumluluğu kullanıcıdadır.

## 2. Kaynak bağlama ve çekimserlik

- Dayanağı gösterilemeyen cümle gösterilmez.
- Dayanak yetersizse özet üretilmez ve bunun için kredi düşülmez.
- Özet, kaynağın yerine geçmez; karar ve mevzuat metnine bağlantı her zaman verilir.

## 3. Kişisel verilerin maskelenmesi

Her modda, sorgu ve sizin metniniz dışarı çıkmadan önce Kazuist sunucusunda kimlik numarası, telefon, e-posta, IBAN
gibi tanımlayıcılar ve kişi adları [KİŞİ-1], [TELEFON] gibi etiketlere çevrilir. Eşleme yalnız istek süresince
bellekte tutulur. Kararlar ise yayından önce anonimleştirilmiştir. Maskeleme otomatik bir işlemdir ve
hata yapabilir; özel nitelikli kişisel verilerinizi (sağlık, ceza kaydı vb.) sorgu olarak yazmamanızı rica
ederiz. Yazma araçlarında kılavuzdan kural çıkarma da aynı maskelemeden geçer.

## 4. Sağlayıcılar ve modlar

| Mod | Kimin anahtarı | Metin nereye gider |
|---|---|---|
| Platform (günlük ücretsiz hak) | Kazuist'in | Kazuist sunucusundan OpenRouter üzerinden modele; yedek olarak doğrudan Anthropic'e. Yalnız maskeli metin |
| Kendi anahtarınız (BYOK) | Sizin OpenRouter anahtarınız | Kazuist sunucusu soruyu ve kaynak pasajlarını maskeler ve tarayıcınıza imzalı bir paket olarak döner; tarayıcınız paketi sizin anahtarınızla doğrudan OpenRouter'a gönderir. Kazuist sunucusu OpenRouter'a bağlanmaz ve anahtarınızı görmez |
| BYOK, sunucu üzerinden aktarma | Sizin | Şu anda sunulmuyor |

Platform modunda istekler OpenRouter, Inc. (ABD) üzerinden modele iletilir (ADR-0025). Her istekte yalnız kullanıcı
verisi toplamayan sağlayıcılar (`provider.data_collection: "deny"`) ve sıfır veri saklama politikası olan uç noktalar
(`provider.zdr: true`) seçilir. OpenRouter'ın belgelerine göre istem kaydı (prompt logging) varsayılan olarak kapalıdır,
girdi ve çıktılar model eğitiminde kullanılmaz; hesap ve kullanım meta verisi gizlilik politikasına göre tutulur
(openrouter.ai/docs/features/zdr, openrouter.ai/docs/features/provider-routing, openrouter.ai/privacy son güncelleme
31 Ağustos 2026; 23 Ekim 2026'da okundu). Anthropic'e doğrudan bağlantı yalnız yedektir.

Yedek olarak doğrudan Anthropic kullanıldığında, Anthropic'in gizlilik merkezine göre API girdi ve çıktıları alındıktan veya üretildikten sonra 30 gün içinde
silinir; kullanım politikası ihlali olarak işaretlenen içerik 2 yıla kadar, güvenlik sınıflandırma puanları 7 yıla
kadar tutulabilir (privacy.claude.com, 22 Ekim 2026'da okundu). Bu yüzden Kazuist kişisel veri göndermez.

### Kendi anahtarınızla (BYOK) nasıl çalışır

1. Sorunuz ve sayfadaki arama süzgeçleri Kazuist sunucusuna gider; anahtarınız bu isteğe eklenmez. Sunucu en ilgili
   kaynak pasajlarını seçer, soruyu ve pasajları maskeler ve on dakika geçerli, tek kullanımlık imzalı bir paket
   döner. Bu adım için giriş yapmış olmanız gerekir.
2. Tarayıcınız paketi göndermeden önce metinde kimlik numarası, telefon, e-posta, IBAN gibi bir tanımlayıcının
   kalıp kalmadığını yeniden denetler; kalmışsa istek OpenRouter'a gönderilmez.
3. Tarayıcınız maskelenmiş metni sizin anahtarınızla doğrudan OpenRouter'a gönderir. Her istekte veri toplayan
   sağlayıcılar dışarıda bırakılır (`provider.data_collection: "deny"`). "Gizlilik öncelikli" seçeneğini
   işaretlerseniz istek ayrıca yalnız sıfır veri saklama uç noktalarına yönlendirilir (`provider.zdr: true`); bazı
   modeller o zaman kullanılamayabilir.
4. Gelen her cümle gösterilmeden önce tarayıcınızda kaynağıyla karşılaştırılır, ardından Kazuist sunucusunda yeniden
   doğrulanır. Doğrulama için özetin cümleleri sunucuya gider; kaydedilmez ve içerik kayda yazılmaz.
5. Bu işlemler için platform kredisi veya günlük ücretsiz hak düşmez; kullanım bedelini OpenRouter'a siz ödersiniz.

İstek tarayıcınızdan sizin OpenRouter hesabınızla yapıldığı için OpenRouter, IP adresinizi ve hesap bilgilerinizi
görür. Bu ilişki sizinle OpenRouter arasındadır; OpenRouter'ın ve seçtiğiniz modeli sunan sağlayıcının koşulları ve
gizlilik politikası geçerlidir. Kendi anahtarınızı şimdilik yalnız OpenRouter için kullanabilirsiniz; OpenRouter
üzerinden Anthropic, OpenAI ve Google modellerine erişilebilir.

### Anahtarınızın saklanması

Anahtar yalnız tarayıcınızda tutulur ve Kazuist sunucusuna gönderilmez. Varsayılan olarak yalnız o oturum için
tarayıcının oturum deposunda (sessionStorage) kalır ve sekmeyi kapatınca silinir. "Bu cihazda hatırla" seçeneğini
seçerseniz tarayıcının yerel deposunda (localStorage) kalır; o tarayıcıya erişen herkes onu kullanabilir, bu yüzden
ortak kullanılan bir cihazda seçmeyin. Anahtar aynı anda yalnız bir depoda bulunur. "Anahtarı dene" düğmesi
anahtarınızı tarayıcınızdan doğrudan OpenRouter'a sorar; yanıt saklanmaz. Anahtarı "Kendi YZ anahtarınız" sayfasından
(/hesap/yz-anahtari) silebilirsiniz.

Yalnız Kazuist için oluşturduğunuz ve harcama sınırı koyduğunuz ayrı bir anahtar kullanmanızı öneririz. OpenRouter,
sınırı olmayan anahtarların tarayıcıda kullanılmamasını önerir; Kazuist böyle bir anahtarı denediğinizde sizi uyarır.

### Ücretsiz model uyarısı

Adı `:free` ile biten ücretsiz OpenRouter modellerinde kullanım sınırları düşüktür ve sağlayıcı koşulları farklı
olabilir. Kazuist veri toplayan sağlayıcıları dışarıda bıraktığı için ücretsiz modeller bazen yanıt vermeyebilir.
Ücretsiz modellerle hassas veya yayımlanmamış metin göndermeyin.

## 5. Kayıt (log)

İçerik kayda yazılmaz. Platform modundaki işlemlerde yalnız işlem türü, model, token sayısı, süre, maliyet ve
kullanıcı kimliğinin tek yönlü özeti tutulur. Kendi anahtarınızla yapılan isteklerde OpenRouter'a giden çağrı
Kazuist sunucusundan geçmez ve Kazuist bu çağrının maliyetini görmez; doğrulama için sunucuya gelen cümleler
saklanmaz ve kayda yazılmaz.

## 6. Avrupa Birliği kullanıcıları için şeffaflık notu

Kazuist'in ürettiği özetler yapay zekâ ile üretilmiştir ve arayüzde bu şekilde işaretlenir. Kazuist,
yargı makamlarına karar desteği sunmak amacıyla tasarlanmamıştır; hedef kullanıcısı öğrenci, akademisyen
ve meslek adaylarıdır. AB Yapay Zekâ Tüzüğü'nün (Tüzük (AB) 2024/1689) yapay zekâ ile üretilen içeriğe ilişkin şeffaflık
yükümlülükleri (m.50) 2 Ağustos 2026'dan beri uygulanır; Tüzük (AB) 2026/1744 bu tarihten önce piyasada
olan sistemler için makinece okunabilir işaretleme yükümlülüğüne (m.50/2) dört aylık geçiş süresi tanımıştır.
Risk sınıflandırması kullanım amacına göre ayrıca değerlendirilir.

## 7. Krediler

Kredi satışı henüz açılmamıştır; platform modundaki özet günlük ücretsiz hakla, BYOK modundaki özet kendi
anahtarınızla çalışır. Kredi satışı açıldığında YZ işlemlerinin kredi karşılığı her ekranda gösterilir ve 20
kredinin üstündeki işlemde onay istenir. Ayrıntı: [İade, iptal ve kredi kuralları](/hukuki/iade-ve-kredi).
