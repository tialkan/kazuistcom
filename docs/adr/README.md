# ADR dizini

ADR-0001..0020 plan.md bölüm 1'deki K-01..K-20 kararlarından türetildi ve "Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)" durumundadır. ADR-0021 ve sonrası sözleşme isteklerinden (docs/istekler) doğar; durumları tabloda yazılıdır.

| No | Başlık | Özet |
|---|---|---|
| [0001](0001-konumlandirma-kaynakli-ozet.md) | Konumlandırma: kaynak bağlama çekirdeği ve kaynaklı özet | Kazuist, Casuist kaynak bağlama çekirdeği üzerine kurulu araştırma ve yazma platformudur; arayüzde cevap değil kaynaklı özet üretilir. |
| [0002](0002-url-koruma.md) | URL düzeni: Türkçe ürün kökte, mevcut 22 adres korunur | Mevcut 22 adres kırılmaz; 16'sı aynen kalır, 5 Türkçe hukuki sayfa tek 301 ile yeni hukuki sayfalara gider, / ürün ana sayfası olur, eski İngilizce ana sayfa /en'e taşınır. |
| [0003](0003-turkiye-barindirma.md) | Barındırma: Türkiye'deki veri merkezi, Coolify akışı | siteyarat.md akışı (GitHub, Coolify, Cloudflare DNS) korunur; sağlayıcı Türkiye'de kurulu bir şirketin Türkiye'deki veri merkezidir. |
| [0004](0004-cloudflare-dns-only.md) | Cloudflare yalnız DNS, TLS sunucuda | Kişisel veri taşıyan adresler Cloudflare'de "DNS only" kalır; TLS Coolify Traefik ve Let's Encrypt ile sunucuda sonlanır. |
| [0005](0005-yigin-ve-kimlik.md) | Yığın ve kimlik: TypeScript monorepo, Python işçi, PostgreSQL; kimlikte Better Auth | TypeScript monorepo (Next.js web ve /api/v1), Python işçi, PostgreSQL ve pgvector, Valkey, S3 uyumlu depo; kimlik kütüphanesi Better Auth, alternatif Auth.js değerlendirilip seçilmedi. |
| [0006](0006-postgres-hibrit-arama.md) | Arama: PostgreSQL içinde hibrit getirme | Türkçe tam metin, vektör, norm ve karar kimliği çözücü ve RRF birleştirme PostgreSQL içinde yapılır; OpenSearch yalnız ölçüm gerektirirse eklenir. |
| [0007](0007-yz-gecidi.md) | YZ: sağlayıcıdan bağımsız geçit, platformda Claude Haiku 5.5 ve Sonnet 5.5 | packages/ai-gateway sağlayıcı bağdaştırıcılarını tek arayüzde toplar; platform modunda varsayılan Haiku 5.5 ve Sonnet 5.5; dışarıya yalnız anonim ve maskeli metin gider. |
| [0008](0008-byok-istemci-modu.md) | BYOK: anahtar istemcide, sunucu görmez | Varsayılan BYOK modunda sağlayıcı istemciden doğrudan çağrılır; Kazuist sunucusu anahtarı görmez. Desteklenen: OpenRouter, Anthropic, OpenAI, Google Gemini. |
| [0009](0009-gelir-modeli.md) | Gelir modeli: ücretsiz, BYOK, süresiz kredi, kredi yükleyen abonelik | Dört katman: ücretsiz kullanım, BYOK (ücretsiz), süresiz kredi paketleri, her ay kredi yükleyen abonelik; kurumsal 2.0. |
| [0010](0010-odeme.md) | Ödeme: web'de iyzico, iOS'ta StoreKit 2, tek defter | Web'de iyzico (Ödeme Formu ve 3D Secure; abonelik eklentisi), iOS'ta StoreKit 2; tek cüzdan ve tek çift taraflı defter. |
| [0011](0011-anonimlestirme-turkiyede.md) | Anonimleştirme Türkiye'deki sunucuda | Ham karar metni yurt dışına çıkmaz; anonimleştirme kural, NER topluluğu ve editör kuyruğuyla Türkiye'deki sunucuda yapılır; isim politikası Ek E. |
| [0012](0012-veri-edinimi.md) | Veri edinimi: çekirdek dizin ve canlı resmî kaynak federasyonu | Lisans dayanağı açık kaynaklar ve seçili kurullar çekirdek dizine alınır; diğer kaynaklar talep üzerine canlı getirilir, anonimleştirilir ve önbelleğe alınır; protokol başvuruları paralel yürür. |
| [0013](0013-ios-swiftui.md) | iOS: yerel SwiftUI uygulaması, aynı API | iOS uygulaması SwiftUI ile yazılır ve aynı /api/v1 sözleşmesini kullanır; web 1.0 kararlı olunca TestFlight, ardından App Store. |
| [0014](0014-kampus-modul-siniri.md) | Turkuaz Kampüs: tek alan adı, ayrı şema ve API öneki | Kampüs kazuist.com/kampus altında ortak hesapla çalışır; veri ayrı PostgreSQL şemasında (kampus), API /v1/kampus önekinde ve özellik bayrağı arkasındadır. |
| [0015](0015-tasarim.md) | Tasarım: açık tema, özgün kimlik, kenar şerhi | Açık tema, özgün kimlik, imza öğesi "kenar şerhi"; YZ ile üretilmiş görsel ve emoji yok. |
| [0016](0016-dil-i18n.md) | Dil: kaynak Türkçe, i18n anahtarları ilk günden | Kaynak dil Türkçedir; tüm arayüz metni packages/i18n anahtarlarıyla gelir; ürünün İngilizcesi 2.0'dır; Casuist İngilizce sayfaları sürer. |
| [0017](0017-kapsam-eklemeleri.md) | 1.0 kapsam eklemeleri | 1.0'a HMGS modu, FSRS aralıklı tekrar, CSL kaynakça dışa aktarma, kısaltmalar cetveli, KVKK-GDPR madde eşleniği ilk seti, kural kaynağını gösterme ve otorite sınıfı etiketi eklenir. |
| [0018](0018-yayin-kapilari.md) | Yayın kapıları | Yayın; webtools robotları, RAG, anonimleştirme, ödeme ve güvenlik ölçütlerinden oluşan kapılardan geçer. |
| [0019](0019-ip-kaydi.md) | IP: özel depo, ADR ve commit geçmişi arka plan IP kaydıdır | Kod Kulular'ın GitHub organizasyonunda özel depodadır; ADR'ler ve commit geçmişi tarihli arka plan IP kaydıdır. |
| [0020](0020-ajan-duzeni.md) | Ajan düzeni: önce sözleşme, sonra yol sahipliğiyle paralel dalgalar | Dalga 0'da sözleşmeler yazılır; sonraki dalgalarda ajanlar yol sahipliğiyle worktree'lerde paralel çalışır; işi üretmemiş bağımsız denetçi denetler. |
| [0021](0021-yerel-s3-seaweedfs.md) | Yerel geliştirme ve CI için S3 deposu: SeaweedFS | Kabul edildi (2026-10-25, kullanıcı onayı). MinIO imajları anonim çekilemiyor ve depo arşivlendi; yerel ve CI'da Apache-2.0 lisanslı SeaweedFS kullanılır, üretim deposu değişmez. |
| [0022](0022-altin-set-etiketleme.md) | Anonimleştirme altın seti için etiketleme yöntemi | Kabul edildi (2026-10-25, kullanıcı onayı). Dalga 2'de Türkiye sunucusunda, iç ağdan erişilen Label Studio CE; editör kuyruğu olgunlaşınca yönetim ekranına geçiş yeniden değerlendirilir. |
| [0023](0023-sozlesme-v1-1.md) | Sözleşme v1.1: Dalga 1 istekleri | Kabul edildi (2026-10-25, kullanıcı onayı). KVKK m.11 başvuruları ve hesapsız başvuru, kaldırma talebi hedefleri ve süreleri, iki adım, account.purge, rıza türleri, ödeme alanları, masked_text, hukuki metin yayın kapısı, health bağlantısı; migration 0003. |
| [0024](0024-abonelik-atif-duzeltmesi.md) | Plan 4.5 abonelik atıflarının düzeltilmesi | Kabul edildi (2026-10-25, kullanıcı onayı). Abonelik Sözleşmeleri Yön. m.2/2 gereği yalnız m.5, 6, 13, 22-25 dayanaktır; diğer taahhütler gönüllüdür. Yıllık plan hemen fesih iadesi eşit bölüşüm: ödenen yıllık bedel eksi yüklenmiş ay x yıllık bedel / 12. |
| [0025](0025-platform-yz-saglayicisi-openrouter.md) | Platform modunda YZ sağlayıcısı OpenRouter | Kabul edildi (Tarık İsmet Alkan, 23 Ekim 2026). Platform istekleri OpenRouter üzerinden, veri toplama reddi ve sıfır veri saklamayla; Anthropic doğrudan yedek. |
| [0026](0026-sozlesme-v1-2.md) | Sözleşme v1.2: ödeme denetimi, PDF ön bilgi alanları ve parçalama tutarlılığı | Kabul edildi (2026-10-25, kullanıcı onayı). Defter değişmezliği (D6), ürün sürümleme genişletmesi (D4), fesih ve iade idempotency (D3), abonelik onay alanları (O5), dönüş, IFN, D8 ve O-N1 uçları, bildirim alt türleri, PDF alanları, embed.chunks tutarlılığı, ner-runtime; migration 0004. |
| [0027](0027-kalici-siparis-belgeleri-ve-urun-surumleri.md) | Kalıcı sipariş belgeleri, ürün sürümleri ve silmede iade tercihi | Kabul edildi (2026-10-27, kullanıcı onayı); migration0005 ve sözleşme1.3. Hukuki yayım/canlı migration izni değildir. |

| [0028](0028-hesap-silme-iade-yonetimi.md) | Hesap silme iadesi: yönetici kararı, kalem ve sağlayıcı sonucu | 27 Ekim 2026 kabul edildi. Orijinal tahsilat/kalan kredi üst sınırı, immutable karar/kalem ve aktör/gerekçe denetimi; migration0006, sözleşme1.4. |

Yeni ADR: sıradaki numarayla, aynı bölüm düzeniyle; sözleşme değişikliği isteyen her istek (docs/istekler/) bir ADR ile sonuçlanır.

- ADR-0029: [Ücretsiz ürün ve ayrı açık kaynak yayın kararı](0029-ucretsiz-urun-ve-acik-kaynak-onerisi.md), 27 Ekim 2026 kabul edildi; public/lisans uygulaması ayrı onay kapısında.
- ADR-0030: [Barındırma sağlayıcısı Hetzner](0030-hetzner-barindirma.md), 6 Kasım 2026 kabul edildi; üretimde kişisel veri KVKK m.9 koşullarına bağlı.
- ADR-0031: [Turkuaz Kampüs kapsam dışı; /tespit eklendi](0031-turkuaz-kampus-kapsam-disi.md), 6 Kasım 2026 kabul edildi.
- ADR-0032: [Kazuist yalnız Türkçe; İngilizce sayfalar kaldırılır](0032-yalniz-turkce.md), 7 Kasım 2026 kabul edildi; eski İngilizce adresler yönlendirmesiz 404.
