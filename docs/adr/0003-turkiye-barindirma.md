# ADR-0003: Barındırma: Türkiye'deki veri merkezi, Coolify akışı

- Tarih: 2026-10-19
- Karar kodu: K-03 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

SRS 10.3 verinin Türkiye'de tutulmasını istiyor. Yurt dışı sağlayıcıda KVKK m.9 için Kurul'un standart sözleşmesinin değiştirilmeden imzalanması ve 5 iş günü içinde bildirimi gerekir; yabancı sağlayıcıdan bu imzayı almak belirsizdir.

## Karar

Uygulama, veri tabanı, nesne deposu ve yedek Türkiye'de tutulur. VPS-1 (Coolify, web, işçiler, Valkey, gözlem) ve VPS-2 (PostgreSQL ve pgvector, yalnız özel ağ) plan 5.5 boyutlarıyla açılır; yedek Türkiye'de ikinci sağlayıcıdadır. Dağıtım GitHub ve Coolify ile yapılır.

## Gerekçe

Kişisel veri için yurt dışı aktarım doğmaz; aktarım envanteri (plan 5.5) sade kalır. Bilinen dağıtım akışı ekip deneyimini korur.

## Sonuçlar

- Sağlayıcı seçimi plan 5.5 ölçütleriyle altyapi ajanı ve Tarık tarafından yapılır.
- Geliştirmede MinIO, Valkey ve PostgreSQL infra/docker-compose.dev.yml ile yerelde çalışır.
- Gözlem araçları (GlitchTip, Uptime Kuma, Umami) kendi sunucumuzdadır.

## Durum

Önerildi, Tarık onayı bekliyor.
