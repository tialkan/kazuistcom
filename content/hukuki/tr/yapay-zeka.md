---
title: Yapay zekâ politikası
slug: yapay-zeka
route: /hukuki/yapay-zeka
lang: tr
binding: true
version: 2026-10-19.1
date: 2026-10-19
status: taslak
alternate: /legal/ai
---

> TASLAK, Tarık onayı bekliyor. Sürüm tarihi: 19 Ekim 2026. Mevcut sayfanın güncellenmiş hâlidir.

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
yüzde yüz başarı garantisi yoktur; özel nitelikli kişisel verilerinizi (sağlık, ceza kaydı vb.) sorgu
olarak yazmamanızı rica ederiz.

## 4. Sağlayıcılar ve modlar

| Mod | Kimin anahtarı | Metin nereye gider |
|---|---|---|
| Platform | Kazuist'in | Kazuist sunucusundan Anthropic'e, yalnız maskeli metin |
| Kendi anahtarınız (BYOK), istemci modu (varsayılan) | Sizin | Tarayıcınızdan veya iOS uygulamasından doğrudan seçtiğiniz sağlayıcıya. Kazuist imzalı ve maskeli istem paketini hazırlar, çağrıyı siz yaparsınız |
| BYOK, aktarma modu | Sizin | Kazuist sunucusu üzerinden; anahtar yalnız istek belleğinde, saklanmaz ve kayda yazılmaz. Bu mod kullanılmadan önce size açıkça söylenir |

Desteklenen sağlayıcılar: Anthropic (Claude), OpenRouter, OpenAI, Google Gemini.

Anthropic, ticari koşulları ve gizlilik merkezi bilgilerine göre API girdi ve çıktılarını belirli bir
süre sonra siler; politika ihlali işaretlenen içerikleri daha uzun tutabilir [DOĞRULANACAK: güncel süreler,
Anthropic gizlilik merkezi; plan 8.10/1'de 30 gün ve 2 yıl yazıyor]. Bu yüzden Kazuist kişisel veri göndermez.

BYOK modunda sağlayıcıyla ilişki sizinle sağlayıcı arasındadır; sağlayıcının koşulları ve gizlilik
politikası geçerlidir.

### Anahtarınızın saklanması

Anahtar varsayılan olarak yalnız o oturum için tarayıcınızda tutulur. "Bu cihazda hatırla" seçeneği
anahtarı tarayıcının kalıcı deposunda tutar; ortak kullanılan cihazda seçmeyin. iOS'ta anahtar Anahtar
Zinciri'nde saklanır. Kazuist sunucusu 1.0'da anahtar saklamaz.

### Google Gemini ücretsiz katman uyarısı

Google'ın Gemini API koşullarına göre ücretsiz katmanda gönderilen içerik ve cevaplar Google'ın ürün
geliştirmesinde kullanılabilir ve insan incelemesine girebilir; Google bu katmanda hassas, gizli veya
kişisel bilgi gönderilmemesini istemektedir. Bu kural Google'ın belirttiği bölgeler (AEA, İsviçre ve
Birleşik Krallık) dışındaki kullanıcılar için geçerlidir [DOĞRULANACAK: Gemini API Additional Terms
güncel metni, ai.google.dev].

Bu yüzden:

1. Gemini anahtarı girdiğinizde ücretli faturalandırmaya bağlı olup olmadığı sorulur; cevap vermezseniz
   ücretsiz katman kabul edilir.
2. Ücretsiz katmanda yayımlanmamış taslak ve Kampüs dosyası gönderen işlemler kapalıdır; açık onayınızla açılabilir.

### OpenRouter

OpenRouter isteklerinde varsayılan olarak veri toplamayan sağlayıcılar seçilir
(`provider.data_collection: "deny"`). "Gizlilik öncelikli" seçeneğinde ayrıca sıfır veri saklama koşulu
istenir (`provider.zdr: true`).

## 5. Kayıt (log)

İçerik kayda yazılmaz. Yalnız işlem türü, model, token sayısı, süre, maliyet ve kullanıcı kimliğinin tek
yönlü özeti tutulur.

## 6. Avrupa Birliği kullanıcıları için şeffaflık notu

Kazuist'in ürettiği özetler yapay zekâ ile üretilmiştir ve arayüzde bu şekilde işaretlenir. Kazuist,
yargı makamlarına karar desteği sunmak amacıyla tasarlanmamıştır; hedef kullanıcısı öğrenci, akademisyen
ve meslek adaylarıdır. AB Yapay Zekâ Tüzüğü kapsamındaki risk sınıflandırması kullanım amacına göre ayrıca
değerlendirilir [DOĞRULANACAK: Tüzüğün ilgili madde ve uygulama tarihleri, eur-lex.europa.eu].

## 7. Krediler

YZ işlemlerinin kredi karşılığı her ekranda gösterilir; 20 kredinin üstündeki işlemde onay istenir.
Ayrıntı: [İade, iptal ve kredi kuralları](/hukuki/iade-ve-kredi).
