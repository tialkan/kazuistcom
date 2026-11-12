---
title: Yapay zekâ politikası
slug: yapay-zeka
route: /hukuki/yapay-zeka
lang: tr
binding: true
version: 2026-11-12.1
date: 2026-11-12
status: taslak
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 12 Kasım 2026. Mevcut sayfanın güncellenmiş hâlidir. BYOK arayüzü
> henüz yoktur (review.md P8 madde 4); BYOK satırları o arayüz yayına girdiğinde geçerlidir ve yayın onayından
> önce arayüzle karşılaştırılır.

## 1. Kazuist'te yapay zekânın rolü

Kazuist bir araştırma ve öğrenme aracıdır. Kaynaklı özet, bulunan kararları ve mevzuatı özetler; her cümle
dayandığı kaynak pasajına bağlanır. Kazuist kişiye özgü hukuki mütalaa vermez, avukatlık hizmeti sunmaz;
çıktıyı değerlendirme ve kullanma sorumluluğu kullanıcıdadır.

## 2. Kaynak bağlama ve çekimserlik

- Dayanağı gösterilemeyen cümle gösterilmez.
- Dayanak yetersizse özet üretilmez ve bunun için kredi düşülmez.
- Özet, kaynağın yerine geçmez; karar ve mevzuat metnine bağlantı her zaman verilir.

## 3. Kişisel verilerin maskelenmesi

Her modda, sorgu ve sizin metniniz dışarı çıkmadan önce kimlik numarası, telefon, e-posta, IBAN gibi
tanımlayıcılar ve kişi adları [KİŞİ-1], [TELEFON] gibi etiketlere çevrilir. Eşleme yalnız istek süresince
bellekte tutulur. Kararlar ise yayından önce anonimleştirilmiştir. Maskeleme otomatik bir işlemdir ve
hata yapabilir; özel nitelikli kişisel verilerinizi (sağlık, ceza kaydı vb.) sorgu olarak yazmamanızı rica
ederiz. Yazma araçlarında kılavuzdan kural çıkarma da aynı maskelemeden geçer.

## 4. Sağlayıcılar ve modlar

| Mod | Kimin anahtarı | Metin nereye gider |
|---|---|---|
| Platform | Kazuist'in | Kazuist sunucusundan OpenRouter üzerinden modele (Claude Haiku ve Sonnet); yedek olarak doğrudan Anthropic'e. Yalnız maskeli metin |
| Kendi anahtarınız (BYOK), istemci modu (varsayılan) | Sizin | Tarayıcınızdan veya iOS uygulamasından doğrudan seçtiğiniz sağlayıcıya. Kazuist imzalı ve maskeli istem paketini hazırlar, çağrıyı siz yaparsınız |
| BYOK, aktarma modu | Sizin | Kazuist sunucusu üzerinden; anahtar yalnız istek belleğinde, saklanmaz ve kayda yazılmaz. Bu mod kullanılmadan önce size açıkça söylenir |

Desteklenen sağlayıcılar: Anthropic (Claude), OpenRouter, OpenAI, Google Gemini.

Platform modunda istekler OpenRouter, Inc. (ABD) üzerinden modele iletilir (ADR-0025). Her istekte yalnız kullanıcı
verisi toplamayan sağlayıcılar (`provider.data_collection: "deny"`) ve sıfır veri saklama politikası olan uç noktalar
(`provider.zdr: true`) seçilir. OpenRouter'ın belgelerine göre istem kaydı (prompt logging) varsayılan olarak kapalıdır,
girdi ve çıktılar model eğitiminde kullanılmaz; hesap ve kullanım meta verisi gizlilik politikasına göre tutulur
(openrouter.ai/docs/features/zdr, openrouter.ai/docs/features/provider-routing, openrouter.ai/privacy son güncelleme
31 Ağustos 2026; 23 Ekim 2026'da okundu). Anthropic'e doğrudan bağlantı yalnız yedektir.

Yedek olarak doğrudan Anthropic kullanıldığında, Anthropic'in gizlilik merkezine göre API girdi ve çıktıları alındıktan veya üretildikten sonra 30 gün içinde
silinir; kullanım politikası ihlali olarak işaretlenen içerik 2 yıla kadar, güvenlik sınıflandırma puanları 7 yıla
kadar tutulabilir (privacy.claude.com, 22 Ekim 2026'da okundu). Bu yüzden Kazuist kişisel veri göndermez.

BYOK modunda sağlayıcıyla ilişki sizinle sağlayıcı arasındadır; sağlayıcının koşulları ve gizlilik
politikası geçerlidir.

### Anahtarınızın saklanması

Anahtar varsayılan olarak yalnız o oturum için tarayıcınızda tutulur. "Bu cihazda hatırla" seçeneği
anahtarı tarayıcının kalıcı deposunda tutar; ortak kullanılan cihazda seçmeyin. iOS'ta anahtar Anahtar
Zinciri'nde saklanır. Kazuist sunucusu 1.0'da anahtar saklamaz.

### Google Gemini ücretsiz katman uyarısı

Google'ın Gemini API koşullarına göre ücretsiz katmanda gönderilen içerik ve cevaplar Google'ın ürün
geliştirmesinde kullanılabilir ve insan incelemesine girebilir; Google bu katmanda hassas, gizli veya
kişisel bilgi gönderilmemesini istemektedir. Google, AEA, İsviçre ve Birleşik Krallık'taki kullanıcılara
sunulan uygulamalarda yalnız ücretli hizmetin kullanılmasını ister ve bu bölgelerde ücretsiz kotaya da ücretli
hizmetin veri kullanım koşullarını uygular (Gemini API Additional Terms of Service, ai.google.dev, son güncelleme
28 Nisan 2026).

Bu yüzden:

1. Gemini anahtarı yalnız, anahtarın ücretli faturalandırmaya bağlı olduğunu beyan ederseniz kabul edilir;
   ücretsiz katman anahtarı Kazuist'te kullanılamaz.
2. Beyanın doğru olmaması hâlinde içeriğiniz Google'ın ücretsiz katman koşullarına tabi olabilir; beyan sizin sorumluluğunuzdadır.

### OpenRouter (kendi anahtarınızla)

Kendi OpenRouter anahtarınızla yapılan isteklerde de varsayılan olarak veri toplamayan sağlayıcılar seçilir
(`provider.data_collection: "deny"`). "Gizlilik öncelikli" seçeneğinde ayrıca sıfır veri saklama koşulu
istenir (`provider.zdr: true`).

## 5. Kayıt (log)

İçerik kayda yazılmaz. Yalnız işlem türü, model, token sayısı, süre, maliyet ve kullanıcı kimliğinin tek
yönlü özeti tutulur.

## 6. Avrupa Birliği kullanıcıları için şeffaflık notu

Kazuist'in ürettiği özetler yapay zekâ ile üretilmiştir ve arayüzde bu şekilde işaretlenir. Kazuist,
yargı makamlarına karar desteği sunmak amacıyla tasarlanmamıştır; hedef kullanıcısı öğrenci, akademisyen
ve meslek adaylarıdır. AB Yapay Zekâ Tüzüğü'nün (Tüzük (AB) 2024/1689) yapay zekâ ile üretilen içeriğe ilişkin şeffaflık
yükümlülükleri (m.50) 2 Ağustos 2026'dan beri uygulanır; Tüzük (AB) 2026/1744 bu tarihten önce piyasada
olan sistemler için makinece okunabilir işaretleme yükümlülüğüne (m.50/2) dört aylık geçiş süresi tanımıştır.
Risk sınıflandırması kullanım amacına göre ayrıca değerlendirilir.

## 7. Krediler

YZ işlemlerinin kredi karşılığı her ekranda gösterilir; 20 kredinin üstündeki işlemde onay istenir.
Ayrıntı: [İade, iptal ve kredi kuralları](/hukuki/iade-ve-kredi).
