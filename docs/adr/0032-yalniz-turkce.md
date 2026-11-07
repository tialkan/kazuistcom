# ADR-0032: Kazuist yalnız Türkçe; İngilizce sayfalar kaldırılır

- Tarih: 2026-11-07
- Durum: Kabul edildi, 7 Kasım 2026 kullanıcı kararı
- İlgili kararlar: K-02, K-16; plan 3, 13, 18, Ek H; ADR-0031

## Bağlam

K-16 ürünün İngilizcesini 2.0'a bırakmış, i18n anahtarlarını ilk günden İngilizce eşleriyle kurmuştu; modül ajanları `packages/i18n/en/*.json` dosyaları yazdı. K-02 ve Ek H, Eurostars ortaklarına gönderilmiş bağlantılar kırılmasın diye eski Casuist İngilizce sayfalarını (/problem, /how-it-works, /evaluation, /partner, /about, /legal/*) korumuş ve eski İngilizce ana sayfayı /en adresine taşımıştı. Hukuki metinlerin İngilizce bilgilendirme sürümü de planlanmıştı.

Kullanıcı 7 Kasım 2026'da Kazuist'in İngilizcesinin hiç olmayacağını bildirdi. Eski İngilizce sayfalar için üç seçenek sunuldu (sayfalar kalsın; 301 ile Türkçeye yönlensin; yönlendirmesiz kaldırılsın) ve kullanıcı "hepsi gitsin, yönlendirmesiz" seçeneğini açıkça seçti.

## Karar

1. Kazuist'in arayüzü, içeriği, hukuki metinleri ve e-postaları yalnız Türkçedir. İngilizce ürün 2.0 dahil hiçbir sürümde planlanmaz.
2. `packages/i18n/en/**` kaldırılır; i18n paketi tek dilli çalışır, dil seçici ve İngilizce yerel ayarı kalkar. Anahtar yapısı ve `toLocaleUpperCase('tr-TR')` kuralı korunur.
3. Eski Casuist İngilizce sayfaları (/en, /problem, /how-it-works, /evaluation, /partner, /about, /legal/notice, /legal/privacy, /legal/cookies, /legal/ai, /legal/accessibility) kaldırılır ve yönlendirme konmaz; bu adresler 404 döner. Türkçe Casuist sayfaları (/tr ve altı) ile Ek H'deki Türkçe 301'ler değişmez.
4. hreflang kullanılmaz; site haritası ve llms.txt İngilizce adres içermez.
5. Hukuki metinlerin İngilizce bilgilendirme sürümü yazılmaz; varsa kaldırılır.
6. Kod, tanımlayıcılar, commit mesajları ve App Store inceleme notları (Ek J, Apple'ın gerektirdiği yerde) İngilizce kalabilir; bunlar ürün metni değildir.

## Sonuçlar

- Eurostars ortaklarına daha önce gönderilmiş İngilizce bağlantılar kırılır. Kullanıcı bu sonucu bilerek seçti. Eurostars başvurusu (teslim 4 Mart 2027) için gereken İngilizce tanıtım, Kazuist sitesi dışında (başvuru belgesi) hazırlanır.
- WebLINKrobot ölçütü Ek H'nin kalan adresleri için uygulanır; kaldırılan İngilizce adreslerin 404 vermesi bilinçlidir ve kırık bağlantı sayılmaz.
- Arama motorlarında İngilizce sayfalar bir süre görünebilir; seo ajanı kaldırılan adresler için Search Console'da kaldırma talebi hazırlar (gönderimi kullanıcı onayıyla).

## Uygulama

- on-yuz: `packages/i18n/en/**`, i18n kodundaki çok dil desteği ve testleri, `(casuist)` altındaki İngilizce sayfalar ve /en rotası, kabuktaki dil bağlantıları.
- seo: hreflang, site haritası, llms.txt.
- hukuk-uyum: content/hukuki altındaki İngilizce sürümler.
- Orkestra plan.md K-02, K-16 ve Ek H'yi günceller.

## Onay kaydı

Kullanıcı 7 Kasım 2026'da "İngilizcesi hiç olmayacak, kaldır" dedi ve eski İngilizce sayfalar için "Hepsi gitsin, yönlendirmesiz" seçeneğini seçti.
