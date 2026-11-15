# Sunucu seçimi

## Güncel karar (15 Kasım 2026): tek Hetzner x86 sunucusu

ADR-0030 sağlayıcıyı Hetzner Cloud (AB konumu), ADR-0033 düzeni tek sunucu yaptı. Hedef 8 vCPU ve 16 GB RAM, x86;
sunucu henüz alınmadı, seçim ve ödeme Tarık'ındır. Hetzner'ın resmî sayfalarından 15 Kasım 2026'da okunan değerler
(KDV hariç; sipariş günü yeniden okunur):

| Plan | Sayfa | vCPU | RAM | NVMe | Trafik (AB) | Aylık üst sınır | Konum | Not |
|---|---|---|---|---|---|---|---|---|
| CX43 | https://www.hetzner.com/cloud/cost-optimized | 8 (Intel ya da AMD, paylaşımlı) | 16 GB | 160 GB | 20 TB | 16,49 EUR'dan başlayan | NBG1, HEL1 (sayfanın başka bölümü FSN de sayıyor) | Okunduğu anda "currently unavailable" |
| CPX42 | https://www.hetzner.com/cloud/regular-performance | 8 (AMD, paylaşımlı) | 16 GB | 320 GB | 20 TB | NBG1 69,99 EUR, HEL1 59,49 EUR | NBG1, HEL1 | Stokta görünüyordu |

Bellek bütçesi (`infra/docker-compose.prod.yml`): postgres 6 GB, worker-py 3 GB, web 1 GB, worker-node 512 MB,
valkey 384 MB, bakım 64 MB; kalan yaklaşık 4 GB işletim sistemi, Coolify ve Traefik içindir. Disk: CX43'ün 160 GB'ı
başlangıç için yeterli, corpus ve vektör dizini büyüdükçe CPX42'nin 320 GB'ı rahatlık sağlar. Konum ADR-0030 madde 2'ye
göre Almanya (NBG1 ya da FSN1), yedek seçenek Helsinki. Aşağıdaki Türkiye araştırması tarihsel kayıttır.

## Türkiye VPS sağlayıcı araştırması (tarihsel, ADR-0030 ile kapandı)

Ölçütler (plan 5.5): Türkiye'de kurulu şirket ve Türkiye'de veri merkezi; KVM; özel ağ; anlık görüntü; DDoS koruması; IPv4; Türkçe sözleşme ve veri işleme eki; ISO 27001; Coolify'ın desteklediği Ubuntu LTS. Hedef boyutlar: VPS-1 8 vCPU / 32 GB / 300 GB NVMe; VPS-2 8 vCPU / 64 GB / 1 TB NVMe.

Araştırma tarihi 2026-10-19. Fiyatlar KDV durumu ve kur nedeniyle değişir; sipariş günü sağlayıcının sayfasından yeniden okunur. "Doğrulanmadı" yazan her ölçüt satış ekibinden yazılı alınmadan seçim yapılmaz.

## Adaylar

| Ölçüt | Kuzey DC (kuzeydc.com) | Hostopya (hostopya.com) | Radore (radore.com) |
|---|---|---|---|
| Kaynak | Resmî sayfa okundu: https://www.kuzeydc.com/en/virtual-server | Arama sonucu özeti; resmî sayfa ayrıca okunmalı: https://hostopya.com/en/virtual-server | Resmî sayfa JavaScript ile yükleniyor, içerik okunamadı: https://www.radore.com |
| Şirket ve veri merkezi | Türkiye; Çekmeköy, İstanbul, Tier III (sayfada) | İstanbul, Datacasa Tier 3+ (arama özeti) | İstanbul, kendi veri merkezi (bilinen; doğrulanmadı) |
| KVM | Evet (sayfada) | Doğrulanmadı | Doğrulanmadı |
| 8 vCPU / 32 GB plan | VDS Enterprise: 8 vCPU, 32 GB, 250 GB NVMe, sınırsız trafik, 1 IPv4, aylık 34,99 USD | 10 çekirdek, 32 GB, 200 GB NVMe, aylık 799,99 TL (arama özeti) | Doğrulanmadı |
| 64 GB / 1 TB (VPS-2) | Listede yok; özel teklif sorulmalı | Doğrulanmadı | Doğrulanmadı |
| Özel ağ | Sayfada yok | Doğrulanmadı | Doğrulanmadı |
| Anlık görüntü | Sayfada yok | Doğrulanmadı | Doğrulanmadı |
| DDoS | Sayfada yok | StormWall (arama özeti) | Doğrulanmadı |
| ISO 27001 | Sayfada yok (sertifika bölümü okunamadı) | Doğrulanmadı | Doğrulanmadı |
| Türkçe sözleşme ve veri işleme eki | Sorulmalı | Sorulmalı | Sorulmalı |

Sonuç: hiçbir aday tüm ölçütleri resmî kaynakta karşılamıyor. Kuzey DC fiyat ve KVM açısından tek doğrulanmış aday; özel ağ, anlık görüntü, DDoS ve ISO 27001 yazılı teyit bekliyor. Radore kurumsal ölçütler (ISO 27001, sözleşme) için en güçlü aday olabilir, ancak bu oturumda hiçbir özelliği doğrulanamadı. Öneri: üç sağlayıcıya aşağıdaki soruları gönderip yazılı cevaba göre seçmek.

## Tarık için adımlar

1. Her sağlayıcının satış iletişim sayfasından (kuzeydc.com, hostopya.com, radore.com) şu soruları yazılı gönderin:
   1. Şirket unvanı ve MERSİS numarası; veri merkezi adresi.
   2. Sanallaştırma türü KVM mi?
   3. İki sunucu arasında ücretsiz özel ağ (VLAN veya private network) var mı?
   4. Anlık görüntü (snapshot) ve otomatik yedek var mı, ücreti nedir?
   5. DDoS koruması kapsamı ve sınırı nedir?
   6. ISO 27001 belgesi: belge numarası ve belgelendirme kuruluşu.
   7. Türkçe hizmet sözleşmesi ve KVKK veri işleme eki (veri işleyen sözleşmesi) imzalanabiliyor mu?
   8. Ubuntu 24.04 LTS imajı var mı?
   9. 8 vCPU / 32 GB / 300 GB NVMe ve 8 vCPU / 64 GB / 1 TB NVMe için aylık fiyat, KDV hariç ve dahil.
   10. Ek IPv4 ve IPv6 desteği.
2. Cevapları `docs/runbook/vps-secimi.md` dosyasına eklemek için bana iletin (kişisel iletişim bilgisi olmadan).
3. Sunucu satın alma kararı ve ödeme sizindir; ajan satın alma yapmaz.

## Güncelleme, 2 Kasım 2026: Radore resmî sayfaları ve satın alma paketi taslağı

Okunan resmî sayfalar: https://radore.com/services/cloud-server, https://radore.com/services/kvkk-compliant-hosting,
https://radore.com/services/dedicated. Kuzey DC sayfası bu oturumda okuma aracının izin listesinde değildi;
19 Ekim bilgisi değişmedi.

| Ölçüt | Radore (resmî sayfada) |
|---|---|
| Şirket | Radore Veri Merkezi Hizmetleri A.Ş.; MERSİS ve adres sayfada yok |
| Veri merkezi | "100% hosted inside Türkiye", "Data never leaves the country"; şehir/tesis yazmıyor |
| ISO 27001 | Var (ayrıca ISO 9001, 22301, 50001, PCI-DSS); belge numarası sayfada yok |
| KVKK | Veri işleyen rolünde yükümlülükleri yerine getirdiğini yazıyor; "veri işleyen sözleşmesi" adıyla anılmıyor |
| KVM | Sanallaştırma türü yazılmıyor |
| Özel ağ | Sayfada yok |
| Anlık görüntü | Otomatik yedek dahil; snapshot yazmıyor |
| DDoS | Genel ifade; kapasite yok. Dedicated'da ek hizmet |
| Ubuntu / IPv6 | Yazmıyor; ek IPv4 kiralanabiliyor |

Hazır bulut paketleri (aylık, KDV hariç, USD): RAM-Elite 4 vCPU / 32 GB / 150 GB NVMe 40,00;
RAM-Infinity 6 vCPU / 64 GB / 150 GB NVMe 72,00; CPU-Infinity 16 vCPU / 16 GB / 250 GB NVMe 60,00.
Hiçbiri plan 5.5 hedefini (8 vCPU / 32 GB / 300 GB ve 8 vCPU / 64 GB / 1 TB) tam karşılamıyor; özel yapılandırma
teklifi gerekir. Dedicated R630 64 GB (2x E5-2680 v4, 2x960 GB SSD, NVMe değil) aylık 259 USD.

### Satın alma paketi taslağı (karar ve ödeme Tarık'ındır)

1. Önce yalnız staging (Dalga 1 kapısı için yeterli): tek sunucu, en az 8 vCPU / 32 GB / 300 GB NVMe, Ubuntu 24.04,
   Coolify + PostgreSQL/pgvector + Valkey aynı makinede. Staging'de gerçek kişi verisi olmadığı için VPS-2 ayrımı
   ertelenebilir (plan 5.4).
2. Üretim için VPS-1 ve VPS-2 aynı sağlayıcıda, özel ağla; özel ağ yazılı teyit edilmeden üretim siparişi verilmez.
3. Sağlayıcıya gidecek soru listesi yukarıda (1-10). Radore için açık kalanlar: KVM, özel ağ, snapshot,
   DDoS kapasitesi, veri işleyen sözleşmesi, ISO 27001 belge numarası, Ubuntu 24.04, özel yapılandırma fiyatı.
4. Fiyatlar sipariş günü yeniden okunur; bu tablo teklif değildir.
