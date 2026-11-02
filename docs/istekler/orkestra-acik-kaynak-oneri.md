# Açık kaynak yayın kapsamı önerisi

Tarih: 2026-10-27. Salt okunur inceleme adayı: 1a97d36. Görünürlük, lisans veya geçmiş değişikliği yapılmadı. Ürün modeli ADR-0029 önerisindedir; public yayın henüz onaylanmadı.

## İnceleme kanıtı ve sınırları

`gitleaks git --redact --log-opts=--all` 167 commit ve yaklaşık 10,22 MB taradı, secret bulgusu yok. Bu sonuç kişisel veri, ticari sır, belge yayın hakkı veya bütün uzak içeriklerin temizliği garantisi değildir. Yerel git nesneleri ve erişilebilir refler tarandı; bağımsız uzak forklar, silinmiş GitHub içerikleri ve sağlayıcı kayıtları kapsam dışıdır.

GitHub API 141 Actions çalışması ve 91 artifact gösterdi. Bunların bütün içerikleri incelenmedi. Görünürlük değişikliğinden önce geçmiş log ve artifactlar, PR/issue ekleri ve uzak dallar ayrıca incelenmelidir. İncelenmemiş içerik güvenli kabul edilmez.

## Somut yayın inceleme noktaları

- docs/kaynak/Kazuist.docx: özgün SRS, içerik/metadata ve telefon benzeri örüntüler; yayın hakkı ve mahremiyet incelemesi gerekir.
- docs/protokol/aym.md:42, danistay.md:42, yargitay.md:42, ulakbim.md:37, yok.md:37 ve adalet-bakanligi.md:43: gerçek iletişim bilgili imza satırları. docs/protokol/README.md:3 bunları onay bekleyen taslak olarak tanımlar.
- content/hukuki/tr/aydinlatma.md:22-23 ve mesafeli-satis.md:20: şirket künyesi/iletişim; kamuya açık şirket bilgisi olabilir, yine de yayın kapsamı doğrulanmalıdır.
- plan.md:99, docs/adr/0019-ip-kaydi.md ve docs/ip/arka-plan-kaydi.md: şirket mülkiyeti, özel depo kararı ve Eurostars arka plan IP kaydı. Yayınla uyumlu ADR ve hak sahipliği doğrulaması gerekir.
- Git commit yazar metadata bilgileri ve geçmişteki eski belge sürümleri ayrıca kapsama alınmalıdır. Güncel dosyadan çıkarmak geçmişi temizlemez.

## Lisans ve varlıklar

Kökte LICENSE, NOTICE, CONTRIBUTING, SECURITY ve başlangıç README belgesi yok. Apache-2.0 yalnız öneridir, uygulanmadı. Üçüncü taraf bildirimleri ve katkı kabul koşulları lisans seçimiyle birlikte hazırlanmalıdır. Ticari kopya ve rakip barındırma Apache-2.0 kapsamında mümkün olabilir.

Web fontlarının OFL bildirimleri ve DejaVu fontunun lisans/kaynak kaydı bulunuyor. Tracked model ağırlığı görülmedi. Sentetik değerlendirme üreticileri synthetic işareti kullanıyor; gerçek hukuk kaynağı ve ileride eklenecek dataset yeniden dağıtım hakları ayrıca kontrol edilir. Bağımlılık güvenlik taraması veri ve model lisans incelemesinin yerine geçmez.

.gitignore env, worktree ve raw-store yollarını koruyor; model ağırlıkları, yerel PDF/CSV, lhci-report ve özel operasyon çıktıları için açık koruma gözden geçirilmelidir. Ignore geçmişte izlenmiş dosyaları gizlemez.

## Aynı depoyu public yapmadan zorunlu sıra

1. Şirket hakları ve K-19 değişikliği; lisans ve yayın kapsamı için açık onay.
2. Kaynak, SRS, kurum taslakları, kişisel bilgiler, bütün refler ve metadata incelemesi.
3. Actions log/artifact ve PR/issue eklerinin içerik kontrolü.
4. Üçüncü taraf lisans envanteri, README, katkı ve güvenlik belgeleri.
5. Gerekiyorsa geçmiş temizliği için ayrı somut plan ve açık onay. Bu belge geçmiş silmeye izin vermez.
6. Son adayın yeniden secret/mahremiyet kontrolü ve açık görünürlük değişikliği onayı.

Public standart runner kullanımı mevcut hesap kilidinin çözüleceği anlamına gelmez. CI çalışmadan PR birleştirilmez.
