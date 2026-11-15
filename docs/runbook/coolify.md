# Coolify: tek sunucu, Docker Compose kaynağı, GHCR imajları

Kaynak: ADR-0033 (tek sunucu, staging yok, sunucuda derleme yok), plan.md 14.4; siteyarat.md 8-9, 15-16. Coolify
belgesi 15 Kasım 2026'da okundu (adresler `ilk-kurulum.md` başında); kurulum günü yeniden okunur. Boş sunucudan
kurulum adımları `ilk-kurulum.md`'dedir; bu belge kaynağın yapısını ve günlük işleri anlatır.

## Yapı

Tek Coolify kaynağı: Projects > kazuist > production > Docker Compose, Git kaynağı `tialkan/kazuistcom` `main`, dosya
`infra/docker-compose.prod.yml`.

| Hizmet | İmaj | Bellek sınırı | Sağlık | Birim |
|---|---|---|---|---|
| postgres | `pgvector/pgvector:0.8.7-pg18-trixie` | 6g | `pg_isready` | adlandırılmış birim `pgdata` |
| valkey | `valkey/valkey:9.0.6-alpine` | 384m | `valkey-cli ping` (parolalı) | adlandırılmış birim `valkeydata` (AOF, `noeviction`) |
| migrate | `ghcr.io/tialkan/kazuist-migrate:<tag>` | 512m | çıkış kodu (`exclude_from_hc`) | yok |
| web | `ghcr.io/tialkan/kazuist-web:<tag>` | 1g | `/api/health` | yok |
| worker-node | `ghcr.io/tialkan/kazuist-worker-node:<tag>` | 512m | veritabanına `select 1` | yok |
| worker-py | `ghcr.io/tialkan/kazuist-worker-py:<tag>` | 3g | `/healthz` | `/srv/kazuist/raw-store` yazılır; `/srv/kazuist/models/{ner,embed}` yalnız okunur |
| maintenance | `ghcr.io/tialkan/kazuist-maintenance:<tag>` | 64m | `/healthz` | yok |

Bellek sınırları takası da kapsar (`memswap_limit` = `mem_limit`). Toplam yaklaşık 11,3 GB; 16 GB sunucuda işletim
sistemi, sayfa önbelleği, Docker, Coolify ve Traefik için yaklaşık 4 GB kalır. PostgreSQL ayarları (shared_buffers
1536MB, effective_cache_size 4GB, maintenance_work_mem 512MB, work_mem 16MB, max_connections 100) 6 GB sınırına göre
dosyada yazılıdır.

GlitchTip, Uptime Kuma ve Umami bu sunucuda çalışmaz: dış erişilebilirlik denetimi izlenen sunucuda olamaz ve bellek
bütçesi uygulamaya ayrılır (`izleme.md`).

Port: hiçbir hizmet `ports:` yayımlamaz. Traefik web'e yığın ağından ulaşır (Domains > web > `https://<alan>:3000`);
worker-py iç API'si `http://worker-py:8001` yalnız yığın ağında; PostgreSQL ve Valkey internete hiç açılmaz.

Güvenlik: uygulama konteynerleri root olmayan kullanıcıyla (`node` 1000, `app` 10001, nginx 101), `cap_drop: ALL` ve
`no-new-privileges` ile çalışır. CI bunları her PR'da aynı dosyayla denetler (`.github/workflows/ci.yml`, docker işi,
"Production compose").

## İmajlar ve etiketler

CI (`.github/workflows/ci.yml`) PR'larda imajları yalnız derler ve test eder. main'e push'ta dört iş (node, python,
gitleaks, docker) yeşil olunca `publish` işi aynı Dockerfile ve katman önbelleğiyle `linux/amd64` imajlarını GHCR'ye
iter: `ghcr.io/tialkan/kazuist-{web,worker-node,migrate,worker-py,maintenance}`, etiketler tam commit sha'sı ve
`main`. Sunucu imajı çeker, derlemez.

Üretimde `KAZUIST_IMAGE_TAG` her zaman bir sha'dır; `main` etiketi yalnız kapalı provada kolaylık içindir. Böylece
geri alma bir değişkeni eski sha'ya çevirmektir (`geri-alma.md`).

## Kapalı prova koruması

- Erişim: Hetzner Firewall'da 443 yalnız yönetici IP'lerine açık (ADR-0033 madde 1, "yalnız izinli IP"); 80 herkese
  açık kalır (Let's Encrypt HTTP doğrulaması ve HTTPS yönlendirmesi).
- `noindex`: `KAZUIST_ENV=staging` iken uygulama `noindex` ve kapalı robots üretir (seo).
- İstenirse ek olarak HTTP Basic Auth: Coolify'ın web için ürettiği yönlendirici adına Traefik `basicauth` ara
  katmanı etiketle eklenir; htpasswd değeri Coolify secret'ında durur, depoya girmez. Yönlendirici adı kurulum günü
  `docker inspect` ile okunur.
- TLS: Traefik ve Let's Encrypt; Cloudflare DNS only. HSTS yalnız uygulamadan gelir
  (`apps/web/src/server/security-headers.ts`); Traefik'te ikinci HSTS eklenmez.

## Bakım sayfası (FR-105)

`maintenance` hizmeti yığındadır, konteyner adı `kazuist-maintenance`. Traefik dinamik yapılandırması
(`infra/maintenance/traefik-dynamic.yml`) Servers > localhost > Proxy > Dynamic Configurations'a eklenir; `HOST` web'in
alan adıdır. web router'ına `kazuist-maintenance@file` ara katmanı web hizmetinin etiketleriyle eklenir (yönlendirici
adı kurulum günü okunur). Test: `docker stop <web>`; `curl -s -o /dev/null -w '%{http_code}' https://<alan>/` 503 ve
gövdede "bakımda"; Coolify > Restart ile web döner, 200.

## Docker temizliği

Servers > localhost > Docker Cleanup: kullanılmayan imajlar ve derleme önbelleği; volume temizliği kapalı. Elle:
`docker image prune -f`. `docker volume prune` çalıştırılmaz (`pgdata` ve `valkeydata` silinir).

## Coolify API (isteğe bağlı)

Dağıtım bugün elle yapılır (`dagitim.md`). İleride GitHub Actions'tan terfi istenirse Coolify > Keys & Tokens > API
Tokens'ta yalnız `deploy` yetkili, 90 gün süreli token üretilir ve GitHub > Settings > Environments > `production`
secret'ı olarak girilir (Tarık). Uç adları kurulum günü https://coolify.io/docs/api-reference üzerinden doğrulanır.
Ajan için salt okunur token `~/Desktop/kazuist-coolify-api.txt` dosyasında (`COOLIFY_URL`, `COOLIFY_API_TOKEN`) durur;
HTTPS olmayan adrese token gönderilmez.
