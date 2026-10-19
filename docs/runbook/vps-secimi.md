# Türkiye VPS sağlayıcı seçimi

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
