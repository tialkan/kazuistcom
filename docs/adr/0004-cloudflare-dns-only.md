# ADR-0004: Cloudflare yalnız DNS, TLS sunucuda

- Tarih: 2026-10-19
- Karar kodu: K-04 (plan.md bölüm 1)
- Durum: Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026)

## Bağlam

Alan adı zaten Cloudflare ad sunucularındadır. Proxy açılırsa IP adresi ve istek içeriği yurt dışındaki bir işleyene aktarılır; bu, KVKK m.9 kapsamında aktarım mekanizması gerektirir.

## Karar

Başlangıçta tüm kişisel veri taşıyan kayıtlar DNS only'dir. Proxy, Cloudflare ile KVKK aktarım mekanizması kurulursa ayrı bir ADR ile açılır.

## Gerekçe

Yurt dışı aktarım doğmaz. DDoS koruması barındırma sağlayıcısının ölçütleri arasındadır (plan 5.5).

## Sonuçlar

- Hız sınırı uygulamada Valkey ile yapılır; güvenilir vekil sayısı 0 kabul edilir (wt.71).
- Önbellek ve WAF Cloudflare'den beklenmez.

## Durum

Kabul edildi (Tarık İsmet Alkan, 19 Ekim 2026).
