# Coolify staging kurulumu

Kaynak: plan.md 5.4, 5.5, 14.3, 14.4; siteyarat.md 7-9, 15. Coolify belgesi 2026-10-19'da https://coolify.io/docs üzerinden okundu; kurulum günü yeniden kontrol edilir, eski blog komutları kullanılmaz.

## Ön koşullar

- VPS-1 ve VPS-2 (`vps-secimi.md`), Ubuntu LTS. Coolify belgesi 20.04, 22.04 ve 24.04'ü listeliyor; daha yeni LTS kurulacaksa önce belge kontrol edilir.
- Asgari Coolify gereksinimi 2 çekirdek, 2 GB RAM, 10 GB disk; VPS-1 bunun çok üstünde.
- SSH yalnız anahtarla; parola girişi ve root SSH kapalı; güvenlik duvarı: 22 (yalnız yönetici IP'leri), 80, 443. Coolify paneli 8000 yalnız kurulum sırasında yönetici IP'sine açık, sonra `coolify.kazuist.com` üzerinden.
- VPS-2 yalnız özel ağda; 5432 internete kapalı.

## Kurulum (VPS-1)

1. SSH ile bağlan, `sudo apt update && sudo apt upgrade`.
2. Resmî kurulum betiği: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`.
3. `http://<VPS-1 IP>:8000` adresini yönetici IP'sinden aç; ilk yönetici hesabını Tarık oluşturur ve iki adımlı doğrulamayı açar.
4. Settings > General: Instance domain `https://coolify.kazuist.com` (DNS kaydı Tarık onayıyla, DNS only). Sonra 8000'i kapat.
5. Settings > Advanced > API access: Enabled; Allowed API IPs: yönetici ve GitHub Actions çıkışı yerine yalnız yönetici IP'leri (dağıtım webhook'u ayrı).
6. Servers > localhost: "reachable/validated" olduğunu ve Proxy'nin (Traefik) çalıştığını doğrula.
7. Servers > Add: VPS-2'yi özel ağ IP'siyle ekle (yalnız PostgreSQL için).

## Proje ve ortamlar

Projects > New: `kazuist`; ortamlar `staging` ve `production`.

| Kaynak | Tür | Ayar |
|---|---|---|
| kazuist-migrate | Application, Dockerfile | Base Directory `/`, Dockerfile Location `infra/docker/worker-node/Dockerfile`, Docker Build Stage Target `migrate`, Restart policy: no; çıkış kodu dağıtımın sonucudur |
| web | Application, Dockerfile | `infra/docker/web/Dockerfile`, Ports Exposes 3000, alan `https://staging.kazuist.com`, Healthcheck `/api/health` |
| worker-node | Application, Dockerfile | `infra/docker/worker-node/Dockerfile`, alan yok |
| worker-py | Application, Dockerfile | `infra/docker/worker-py/Dockerfile`, alan yok, 8000 yalnız iç ağ |
| valkey | Database, Valkey | iç ağ, kalıcı volume, parola |
| postgres | VPS-2'de pgvector imajı (`pgvector/pgvector:0.8.7-pg18-trixie`) | kalıcı volume, özel ağ, WAL arşivi (`yedek.md`) |
| maintenance | Application, Dockerfile | `infra/maintenance/Dockerfile`, alan yok, konteyner adı `kazuist-maintenance` |
| glitchtip, uptime-kuma, umami | Service (Coolify şablonu) | `izleme.md` |

Ortam değişkenleri: `.env.example` listesi; Production bölümüne secret olarak. Kritik değişken eksikse `/api/health` 503 döner.

## Staging koruması

- HTTP Basic Auth: web uygulamasına Traefik basicauth middleware'i (Coolify: uygulama > Advanced > Container Labels'a `traefik.http.middlewares.kazuist-staging-auth.basicauth.users=<htpasswd>` ve router'a ekleme). htpasswd değeri Coolify secret'ında; depoya girmez. Etiket adları kurulum günü Coolify'ın ürettiği router adına göre ayarlanır.
- noindex: `X-Robots-Tag: noindex, nofollow` başlığı aynı yöntemle (headers middleware) ve uygulamanın staging robots kuralı (seo ajanı).
- TLS: Traefik ve Let's Encrypt; Cloudflare DNS only. HTTP'den HTTPS'e tek yönlendirme.
- HSTS yalnız uygulamadan gelir (`apps/web/src/server/security-headers.ts`, üretim derlemesinde `max-age=63072000`, includeSubDomains ve preload yok). Traefik'te ikinci bir HSTS (headers middleware `stsSeconds` vb.) eklenmez; iki kaynak çelişir. CSP ve diğer güvenlik başlıkları da yalnız uygulamadandır.

## Bakım sayfası (FR-105)

1. maintenance uygulamasını dağıt; konteyner adının `kazuist-maintenance` olduğunu ve `coolify` ağında olduğunu doğrula.
2. Servers > VPS-1 > Proxy > Dynamic Configurations: `infra/maintenance/traefik-dynamic.yml` içeriğini ekle; `HOST` yerine ortamın alan adını yaz; `entryPoints` ve `certResolver` adlarını sunucudaki Traefik yapılandırmasından (Proxy > Configuration) doğrula.
3. web uygulamasının router'ına `kazuist-maintenance@file` middleware'ini ekle.
4. Test: web'i durdur; `curl -s -o /dev/null -w '%{http_code}' https://staging.kazuist.com/` 503 ve gövdede "bakımda". web'i başlat; 200.

## Otomatik dağıtım (main -> staging)

Coolify webhook yerine GitHub Actions'tan Coolify API çağrısı önerilir; sıra kontrolü (önce migrate, bitince uygulamalar) ve commit doğrulaması bu sayede yapılır.

1. Coolify token'ı (Tarık, aşağıda) `deploy` yetkili oluşturulur; GitHub > Settings > Environments > `staging` ortamının secret'ı `COOLIFY_TOKEN` olarak eklenir (Tarık). Değer sohbete yazılmaz.
2. Workflow (sonraki PR): main'de CI yeşilse `GET /api/v1/deploy?uuid=<migrate-uuid>` ile migrate dağıtımı, `GET /api/v1/deployments/<id>` ile bitiş beklenir, sonra web, worker-node, worker-py; en sonda `/api/version` commit kontrolü. Uç adları kurulum günü https://coolify.io/docs/api-reference üzerinden doğrulanır.
3. Üretim terfisi elle (`workflow_dispatch`, GitHub Environment onayı Tarık).

## Coolify API token'ı (Tarık)

1. `https://coolify.kazuist.com` > sol menü Keys & Tokens > API Tokens.
2. Description: `kazuist altyapi ajani (okuma)`. Expires in: 90 days. Permissions: yalnız `read`. Create token.
3. Dağıtım için ayrı token: Description `kazuist github deploy`, Permissions yalnız `deploy`, Expires in 90 days.
4. Okuma token'ını `~/Desktop/kazuist-coolify-api.txt` dosyasına iki satır olarak kaydedin: `COOLIFY_URL=https://coolify.kazuist.com` ve `COOLIFY_API_TOKEN=<token>`; `chmod 600`. Dağıtım token'ını yalnız GitHub secret'ına girin.
5. Ajan token'ı `GET /api/v1/teams/current` ile doğrular; HTTPS olmayan adrese token gönderilmez.

## Kurulum sonrası doğrulama

`dagitim.md` adım 5 ve plan 14.9 dış kabul testleri; ayrıca dışarıdan `nmap -Pn -p 5432,6379,8000 <ip>` kapalı.
