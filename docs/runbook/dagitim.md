# Dağıtım runbook'u

Kaynak: plan.md 14.3, 14.4, 14.8; siteyarat.md 9, 15. Coolify ayrıntıları için `coolify.md`.

## Akış

```text
PR -> CI yeşil (node, python, gitleaks, docker) -> main'e birleştirme
  -> GitHub Actions "deploy-staging" (sonraki adım, Coolify API token'ı gelince)
     1. migrate uygulaması: Coolify'da deploy, bitişini bekle (exit 0)
     2. web, worker-node, worker-py: Coolify'da deploy
     3. /api/version commit'i beklenen SHA mı
  -> üretim: elle terfi (Tarık onayı), aynı sıra
```

Kurallar:

- PR testleri geçmeden otomatik dağıtım yok. Aynı commit için ikinci dağıtım kuyruğu açılmaz.
- Migration ayrı bir Coolify uygulamasıdır (`kazuist-migrate`, `infra/docker/worker-node/Dockerfile`, hedef `migrate`). Web açılış komutunda `&&` ile migration zinciri yoktur (plan 14.4/3).
- Coolify'ın "Pre-deployment" komutu migration için kullanılmaz: belgeye göre eski konteynerde çalışır ve ilk dağıtımda atlanır (coolify.io/docs, Dockerfile build pack).
- Migration geriye dönük uyumlu yazılır (önce ekle, sonra kullan, en son kaldır). Yıkıcı migration Tarık onayıyla ve öncesinde anlık yedekle.
- Ortam değişkenleri Coolify'da "Production" bölümüne, secret olarak girilir; önizleme bölümüne değil. Yer tutucu değer yapıştırılmaz. Değişken eklenince yeniden yayım yapılır.

## İmajlar

| İmaj | Dockerfile | Port | Kullanıcı | Sağlık |
|---|---|---|---|---|
| web | `infra/docker/web/Dockerfile` | 3000 | node (1000) | `/api/health` (Dockerfile HEALTHCHECK) |
| worker-node | `infra/docker/worker-node/Dockerfile` (`dist/main.js`, tsx yok) | yok | node (1000) | süreç ayakta, SIGTERM ile temiz kapanış |
| migrate | aynı dosya, `--target migrate` | yok | node (1000) | exit kodu |
| worker-py | `infra/docker/worker-py/Dockerfile` | 8000 (konteyner içi) | app (10001) | `/healthz` (Dockerfile HEALTHCHECK) |
| bakım | `infra/maintenance/Dockerfile` | 8080 | nginx (101) | `/healthz` |

Derleme bağlamı her imajda depo köküdür. web için derleme argümanları: `GIT_COMMIT`, `BUILT_AT`, `APP_VERSION`. Coolify'da Advanced > Build > Source commit availability "Available during build" yapılır ve `GIT_COMMIT=$SOURCE_COMMIT` verilir.

## Adımlar (elle dağıtım)

1. CI'ın ilgili commit'te yeşil olduğunu doğrula: `gh run list --branch main --limit 3`.
2. Veri tabanında migration varsa: VPS-2'de anlık yedek al (`yedek.md`, "Elle yedek").
3. Coolify > Projects > kazuist > staging > kazuist-migrate > Deploy. Logda `"msg":"done"` satırını gör. `"msg":"failed"` varsa dur; web dağıtılmaz, eski sürüm ayakta kalır.
4. web, worker-node, worker-py için Deploy. Coolify yeni konteyner sağlıklı olmadan trafiği çevirmez.
5. Doğrula:
   - `curl -s https://staging.kazuist.com/api/version` (Basic Auth ile) beklenen commit.
   - `curl -s -o /dev/null -w '%{http_code}' https://staging.kazuist.com/api/health` 200.
   - Uptime Kuma'da kırmızı yok; GlitchTip'te yeni hata dalgası yok.
6. Sorun varsa `geri-alma.md`.

## Dağıtım sırasında bakım sayfası

`infra/maintenance/traefik-dynamic.yml` Traefik'e eklenir; web 502/503/504 dönerse veya sağlıklı web konteyneri yoksa ham Traefik hatası yerine 503 ve bakım sayfası döner (FR-105). Ayrıntı `coolify.md`, "Bakım sayfası".

## Disk

Coolify > Servers > Docker Cleanup kullanılır; volume temizliği kapalı. Elle ölçüm: `df -h /`, `df -ih /`, `docker system df`. Güvenli temizlik: `docker builder prune -af`, `docker image prune -f`. `docker volume prune` çalıştırılmaz.
