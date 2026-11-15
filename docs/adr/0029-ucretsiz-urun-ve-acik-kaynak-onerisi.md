# ADR-0029: Ücretsiz ürün ve ayrı açık kaynak yayın kararı

- Tarih: 2026-10-27
- Durum: Kabul edildi, 27 Ekim 2026 kullanıcı onayı
- İlgili kararlar: K-09, K-19; ADR-0009, ADR-0019

## Bağlam

Kullanıcı bütün özelliklerin ve BYOK kullanımının ücretsiz olmasını, tek gelir kaynağının kendi anahtarını kullanmak istemeyenlere isteğe bağlı platform YZ kredisi satışı olmasını istedi. Mevcut plan 4.2 ücretli özellik katmanları ve abonelik içeriyor. Bu ADR o farkı görünür kılar; plan ve arayüz henüz değiştirilmedi.

Kullanıcı ayrıca depoyu public yapmayı soru olarak gündeme getirdi. Bu, görünürlük veya lisans değişikliği için açık onay sayılmaz. K-19 mevcut özel depo kararını korur.

## Önerilen ürün kararı

1. Bütün ürün özellikleri ücretsiz hesaplara açıktır. Öğrenci Plus ve Akademisyen gibi özellik açan ücretli katmanlar kaldırılır.
2. BYOK için Kazuist kullanım bedeli alınmaz; sağlayıcının kendi hesabındaki ücret kullanıcıya aittir. Mevcut anahtar güvenliği, maskeleme ve sağlayıcı uygunluk kuralları korunur.
3. Tek gelir, kullanıcının isteğiyle satın aldığı platform YZ kredileridir. Kredi satın almak ürün özelliklerini açmaz; platformun YZ maliyetini karşılar.
4. Abonelik satışının devamı bu modelden otomatik çıkarılmaz; onay sonrası yeni abonelik sunumu kapatılır. Varsa mevcut abonelik ve bakiye hakları korunur, zorunlu taşıma veya silme yapılmaz.
5. Kötüye kullanım, kaynak tüketimi ve güvenlik sınırları bütün ücretsiz kullanımlarda şeffaf ve ölçülebilir olabilir; ücretli özellik kilidine dönüşmez. Ücretsiz özellikler sınırsız platform YZ tüketimi anlamına gelmez.
6. Günlük ücretsiz platform YZ hakkı/promosyon bütçesi ayrıca işletme maliyetine göre belirlenir. Bu ADR mevcut satın alınmış kredileri veya iadeleri değiştirmez.

## Ayrı açık kaynak önerisi

Apache-2.0, katkı ve yeniden kullanım hedefi için değerlendirilir. Şirketin kod üzerindeki hakları, üçüncü taraf varlıklar, Eurostars arka plan IP kaydı ve mahremiyet kapsamı doğrulanmalıdır. Apache-2.0 ile başkaları ticari kullanım ve rakip SaaS sunumu yapabilir; kredi gelirinin korunması lisans tarafından garanti edilmez.

Public görünürlük ve Apache-2.0 ayrı, açık kullanıcı onayı gerektirir. Onay verilmeden LICENSE eklenmez, K-19 değiştirilmez ve depo public yapılmaz. Public standart runner avantajı, mevcut hesap faturalandırma engelinin kalkacağı garantisi değildir.

## Uygulama ve kabul

ADR onayından sonra orkestra plan 4, K-09 ve ilgili pazarlama/i18n metinlerini uyumlu hale getirir; ödeme ve hukuki metin değişiklikleri kendi onay kapılarından geçer. Görünürlük önerisi için docs/istekler/orkestra-acik-kaynak-oneri.md uygulanır. Üretim ödeme, mevcut hakların azaltılması veya geçmiş temizliği bu öneriyle yetkilendirilmez.

## Onay kaydı

Kullanıcı 27 Ekim 2026 mesajında ADR-0029 kararını açıkça onayladı. Public yayına hazırlık yetkilendirildi; görünürlük değişikliği, lisansın yürürlüğe konması veya yıkıcı geçmiş temizliği bu onaydan çıkarılmaz.

## Ek: açık kaynak onayı (15 Kasım 2026)

Tarık İsmet Alkan 15 Kasım 2026'da deponun public kalmasını ve Apache-2.0 lisansını açıkça onayladı. PR 92 ile eklenen LICENSE bu onayla geçerlidir. K-19'daki Eurostars arka plan IP'si notunun bu kararla uyumu hukuk-uyum tarafından ayrıca gözden geçirilir.
