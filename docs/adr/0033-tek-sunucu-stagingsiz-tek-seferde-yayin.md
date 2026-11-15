# ADR-0033: Tek sunucu, staging'siz, tek seferde yayın

- Tarih: 2026-11-12
- Durum: Önerildi, Tarık onayı bekliyor
- İlgili kararlar: K-03, K-04, K-11, K-18; ADR-0003, ADR-0004, ADR-0011, ADR-0018, ADR-0030; plan 5.4, 5.5, 14, 15.3, 18;
  review.md T1, T2, T4, T5, P2

## Bağlam

ADR-0030 sağlayıcıyı Hetzner Cloud (AB konumu) yaptı ve iki şey daha varsaydı: madde 3'te ayrı bir staging sunucusu
(yalnız anonim veya sentetik veri), madde 4'te plan 5.5'teki iki sunuculu üretim düzeni (VPS-1 uygulama, VPS-2 yalnız
özel ağdan erişilen PostgreSQL). Plan 5.4 (ortamlar), 5.5 (sunucu tablosu), 14.1 ve 14.3 (kurulum sırası) ile
`docs/runbook/` altındaki `coolify.md`, `dagitim.md`, `vps-secimi.md`, `dns-yedek.md` ve `geri-alma.md` aynı varsayıma
dayanır (review.md T1). OpenAPI `servers` listesinde de `staging.kazuist.com` vardır.

Tarık 12 Kasım 2026'da iki karar bildirdi (review.md 0. bölüm ve T2):

1. Staging atlanır.
2. Bütün modüller tek seferde yayına alınır; yayın fazlara bölünmez. review.md'deki "Faz 1" ve "Faz 2" etiketleri
   çıkış sırası değil, yalnız çalışma sırasıdır.

Sunucu boyutu henüz seçilmedi. Tarık'ın verdiği aralık 8 GB Arm ile 16 GB x86 arasıdır. Hetzner'ın resmî sayfasında
(hetzner.com/cloud/cost-optimized, 12 Kasım 2026'da okundu) bu aralığın iki ucu şöyledir: CAX21, Arm64 (Ampere), 4 vCPU,
8 GB RAM, 80 GB NVMe; CX43, x86, 8 vCPU, 16 GB RAM, 160 GB NVMe. Aynı sayfa okunduğu anda planları "currently
unavailable" diye gösteriyordu; stok ve fiyat sipariş günü yeniden okunur. Plan 5.5'teki boyutlar (VPS-1 32 GB, VPS-2
64 GB) tam corpus için hesaplanmıştı; bu aralık ondan belirgin biçimde küçüktür.

## Karar

1. Staging ortamı açılmaz. Plan 5.4'teki staging satırı ve plan 14.3'teki staging kurulumu kalkar. Yerine şu zincir
   çalışır: yerel ortam (`infra/docker-compose.dev.yml`), gerçek servisli CI, sonra üretim sunucusunda yayın öncesi kapalı
   prova. Kapalı provada site herkese açık değildir (`noindex`, HTTP Basic Auth ya da yalnız izinli IP), gerçek kişi
   verisi yoktur (anonim corpus, sentetik hesaplar, iyzico sandbox), prova bitince sentetik hesaplar ve sandbox kayıtları
   silinir. Prova adresi sunucu IP'si üzerinden ya da Tarık'ın onayladığı geçici bir alt alan adıyla verilir; DNS
   değişikliği Tarık'ın açık onayıyla yapılır.
2. Üretim tek sunucudadır: Hetzner Cloud, ADR-0030 madde 2'deki AB konumu (Falkenstein veya Nürnberg; Helsinki yedek).
   Coolify, web, worker-node, worker-py, PostgreSQL ve pgvector, Valkey ve bakım sayfası aynı sunucuda çalışır.
   PostgreSQL ve Valkey portları internete açılmaz, yalnız Docker iç ağından erişilir. ADR-0030 madde 4'teki iki sunucu
   düzeni ve özel ağ şartı bu ADR ile kalkar.
3. Sunucu boyutunu Tarık seçer (8 GB Arm64 CAX21 ile 16 GB x86 arası). Seçim yapılana kadar imajlar ve bellek bütçesi
   iki mimariye de uyacak biçimde hazırlanır.
4. Sunucuda derleme yapılmaz. İmajlar GitHub Actions'ta `linux/amd64` ve `linux/arm64` için çok mimarili derlenir, özel
   bir kayda (GHCR) itilir ve Coolify tarafından çekilir. Python tekerleklerinin (ör. `onnxruntime`) arm64 karşılığı
   derleme sırasında doğrulanır; arm64 derlemesi bugüne kadar denenmedi (review.md 8. bölüm).
5. Yayın tek seferdir: 1.0 modüllerinin hepsi aynı gün açılır. Modülleri tek tek kapatıp açan "yakında" düzeni yayın
   için gerekmez (review.md P3 madde 1 düşer).

## Yayının ön koşulları

Aşağıdakilerin hepsi sağlanmadan DNS geçişi yapılmaz ve site herkese açılmaz.

1. ADR-0030'un "Sonuçlar ve koşullar" bölümü değişmeden geçerlidir: üretimde gerçek kişi verisi, KVKK m.9 aktarım
   dayanağı tamamlanmadan işlenmez. Tek seferde yayın hesap, ödeme ve formları ilk günden açtığı için bu koşul yayının
   kendisinin ön koşuludur. Bu ADR o koşulu gevşetmez, ertelemez ve kısmi yayınla aşmaya izin vermez. Kapsamı:
   - m.9 dayanağı: Kurul'un standart sözleşmesinin Hetzner ile değiştirilmeden imzalanması ve imzadan sonra 5 iş günü
     içinde Kurul'a bildirilmesi ya da hukuk-uyum'un birincil kaynaktan değerlendirdiği diğer bir m.9 yolu;
   - Hetzner veri işleme sözleşmesi, ISO 27001 belgesi ve veri merkezi konumunun resmî kaynaktan kaydı;
   - aydınlatma metni, aktarım envanteri ve VERBİS kaydının yurt dışı barındırmayı yansıtması.
2. Hukuki metinlerin Tarık tarafından yayım onayı (ADR-0023 hukuki metin yayın kapısı).
3. ADR-0018 yayın kapıları (plan 15.3) ve bağımsız denetçi raporu.
4. Yedek sunucu dışındadır ve geri yükleme yayından önce bir kez denenmiştir. Aynı sunucudaki yedek yedek sayılmaz.
5. Canlı ödeme anahtarları Tarık'ın açık onayıyla girilir; o ana kadar ödeme sandbox kipindedir.
6. DNS geçişi Tarık'ın açık onayıyla ve önceki kayıtlar `docs/runbook/` altına yedeklendikten sonra yapılır
   (ADR-0004: kişisel veri taşıyan adresler DNS only).

## Açık soru: anonimleştirme ve K-11 (Tarık kararı T4)

K-11 ve ADR-0011 "anonimleştirme Türkiye'deki sunucuda yapılır; ham karar metni yurt dışına çıkmaz" der. ADR-0030
kişisel verinin AB'de barındırılmasını kabul etti ama bu ilkeyi ele almadı. Tek sunucu Hetzner AB konumunda olduğuna göre
worker-py ve anonimleştirici de orada çalışır; yani ham karar metni yurt dışında işlenir. Bu ADR bu soruya karar vermez.
Tarık'ın seçeceği yollar şunlardır:

1. K-11 değişir: anonimleştirme Hetzner AB sunucusunda yapılır; ham karar metni ADR-0030'daki m.9 dayanağının
   kapsamına alınır ve aktarım envanterine yazılır.
2. K-11 korunur: anonimleştirme Türkiye'deki ayrı bir sunucuda yapılır, Hetzner'a yalnız maskeli metin gelir. Bu, tek
   sunucu kararıyla çelişir ve ikinci bir sağlayıcı, sözleşme ve bakım yükü getirir.
3. Ham karar metni gerektiren kaynaklar T4 kararı verilene kadar üretimde açılmaz. Bu, "tek seferde yayın" kararıyla
   gerilim yaratır, çünkü /ara ve atıf ağı karar corpus'u olmadan eksik açılır.

NER modeli olmadan anonimleştirmenin yayına açılıp açılmayacağı (T5) ayrı bir karardır ve bu sorudan bağımsızdır.

## Sonuçlar ve riskler

- İlk gerçek ortam üretimdir. Migration ya da dağıtım hatası doğrudan üretimi etkiler. Karşılıklar: migration ayrı ön
  adımda ve loglu çalışır (plan 14.4/3); yayın öncesi bütün yıkıcı şema temizliği ilk dağıtımdan önce yapılır
  (`docs/istekler/mimar-p1-sozlesme-temizligi.md`); Coolify'da önceki imaja dönüş yolu ve geri yükleme testi yayından
  önce denenir.
- Tek sunucu tek arıza noktasıdır: sunucu giderse site, işçiler ve veri tabanı birlikte gider. Kurtarma süresi ve kabul
  edilebilir veri kaybı hedefleri altyapi tarafından yazılır ve yedek sıklığı ona göre ayarlanır.
- Web, işçiler, PostgreSQL, Valkey ve (açılırsa) NER modeli aynı belleği paylaşır. Her servise bellek sınırı konur; 8 GB
  seçilirse gözlem araçlarının (GlitchTip, Uptime Kuma, Umami) aynı sunucuya sığıp sığmadığı ölçülür. Dış erişilebilirlik
  denetimi aynı sunucuda çalışmaz.
- Corpus ve vektör dizini sunucu belleğiyle sınırlıdır. Ölçüm büyütme gerektirirse daha büyük sunucuya geçiş ya da ikinci
  sunucu yeni bir ADR ile yapılır.
- Yayın tarihi en yavaş ön koşula bağlıdır: KVKK m.9 dayanağı, hukuki yayım onayı, arama dizini, canlı ödeme.
- iyzico sandbox kabul senaryoları (plan 9.5) staging yerine yerelde, CI'da ve kapalı provada koşar.
- `KAZUIST_ENV=staging` değeri kodda kalır (hukuki metin yükleyicisi ve kaynak onay denetimi); artık ayrı bir sunucuyu
  değil, kapalı provayı anlatır.

## Değişen kararlar

- ADR-0030 madde 3 (staging) ve madde 4 (iki sunucu, VPS-2 yalnız özel ağ) bu ADR onaylanınca değişir. ADR-0030 madde 1,
  2 ve 5 ile "Sonuçlar ve koşullar" bölümü aynen geçerlidir.
- ADR-0030 "Uygulama" bölümündeki staging erişim dosyası yerine üretim erişim bilgisi `~/Desktop/kazuist-uretim.txt`
  dosyasında tutulur (yalnız yol; değer sohbete ve depoya girmez).
- ADR-0011 (K-11) bu ADR ile değişmez; ilişki yukarıdaki açık sorudadır.

## Uygulama (onaydan sonra)

- altyapi (review.md P2): çok mimarili imaj ve GHCR iş akışı; üretim compose ya da Coolify tanımı; dağıtım iş akışı
  (migration, sonra web ve işçiler, sonra `/api/version`); sunucu dışı yedek ve geri yükleme testi; izleme; beş
  runbook'un tek sunucuya göre yeniden yazımı.
- hukuk-uyum (review.md P5): ön koşul 1'in maddeleri; `docs/kvkk/aktarim.md`, `izleme.md` ve `yedek.md` içindeki
  "Türkiye, aktarım yok" anlatımının düzeltilmesi.
- seo: kapalı provada `noindex` kalır; üretim indeksleme yayın günü açılır.
- mimar: `.env.example` staging anlatımı bu ADR'ye göre düzeltildi (codex/p1-mimar-kararlar); OpenAPI `servers`
  listesindeki staging adresinin kaldırılması sözleşme temizliği planındadır.
- orkestra: plan.md 5.4, 5.5, 14.1, 14.3 ve 14.4/1.

## Onay kaydı

Tarık 12 Kasım 2026'da staging'in atlanmasını ve bütün modüllerin tek seferde yayına alınmasını bildirdi; karar orkestra
aracılığıyla mimara iletildi. Sunucu boyutu seçilmedi. Bu ADR metni Tarık onayı bekliyor. Onay; üretimde kişisel veri
işlenmesine, sunucu satın alımına, DNS değişikliğine ya da canlı ödemeye izin değildir.

## Not: dar çekirdekli ilk yayın (15 Kasım 2026)

Madde 5 ADR-0038 ile daraldı. Tarık'ın kararıyla (orkestra 15 Kasım 2026'da aktardı) ilk yayın dar çekirdektir: Ara
ve kaynaklı özet, Kaydettiklerim, Yazma (şablon ve kısaltma), Rehberler ve `/tespit`. Onaylı içeriği olmayan Pratik,
Kalemcik ve Atıf ağı üretimde gösterilmez ve içerik onayıyla sonradan açılır. Yayın yine tek seferdir ve fazlara
bölünmez. Bu ADR'nin diğer maddeleri ve "Yayının ön koşulları" bölümü değişmez.
