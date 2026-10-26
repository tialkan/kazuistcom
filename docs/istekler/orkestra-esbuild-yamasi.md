# Esbuild geliştirme bağımlılığı güvenlik yaması

26 Ekim 2026, orkestra. O-07 kalan Node orta bulgusu.

`@esbuild-kit/core-utils` terk edilmiş yükleyicisi esbuild0.18.20 istediğinden, güncel drizzle-kit0.31.11 ve better-auth zincirinde eski sürüm kalıyordu. Esbuild'in resmî GHSA-67mh-4wv8-2f99 bildiriminde yamalı alt sınır0.25.0 olarak verilir: https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99 .

Yalnız bu üst paketin esbuild bağımlılığı, mevcut doğrudan araç zincirinin kullandığı MIT lisanslı0.28.2'ye sabitlendi. Tüm bağımlılıkları değiştiren genel override yoktur. Core-utils yerindeki gerçek resolver ile sürüm ve TypeScript transform smoke doğrulandı. Drizzle-kit gerçek PostgreSQL şemasından yalnız geçici dizine migration üretti; herhangi bir veri tabanına bağlanılmadı veya migration uygulanmadı. DB27 test, web88/1ortam skip ve Node düşük eşik dahil audit temiz. Kilit dosyasında eski esbuild0.18.20 kaldırıldı.

0.x sürüm geçişi nedeniyle dört CI işi ve bağımsız kalite tekrar ölçümü birleştirme önkoşuludur; tarama eşiği gevşetilmedi, advisory ignore eklenmedi. Bu değişiklik eski yükleyicinin ileride desteklenen alternatifle kaldırılması gereğini ortadan kaldırmaz.
