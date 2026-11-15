# İlk kurulum: boş Ubuntu 24.04 sunucusundan kapalı provaya ve yayına

Kaynak: ADR-0030, ADR-0033 (tek sunucu, staging yok, kapalı prova), ADR-0004 (Cloudflare DNS only), plan 5.6, 14.3,
14.4, 14.9; siteyarat.md 6-9, 12-13, 15-20. Coolify belgesi 15 Kasım 2026'da okundu:
https://coolify.io/docs/get-started/installation, https://coolify.io/docs/knowledge-base/server/firewall,
https://coolify.io/docs/knowledge-base/docker/compose, https://coolify.io/docs/knowledge-base/docker/registry.
Kurulum günü bu sayfalar yeniden okunur; eski blog komutları kullanılmaz.

Hedef: tek Hetzner Cloud x86 sunucusu, 8 vCPU ve 16 GB RAM (CX43 ya da CPX42, `vps-secimi.md`), Coolify, Cloudflare
DNS only. Yayın ödemesiz (IYZICO_* boş) ve BYOK ile açılır.

Kurallar: her adımdan önce mevcut değer okunur ve not edilir. DNS, silme, disk ve erişim değişikliği Tarık'ın açık
onayıyla yapılır. Parola, token ve anahtar sohbete, depoya ve loga yazılmaz; sunucu erişim bilgisi yalnız
`~/Desktop/kazuist-uretim.txt` dosyasındadır. "İstek gönderildi" başarı sayılmaz; her adımın sonunda doğrulama
komutu çalıştırılır.

## 0. Ön koşullar (Tarık)

1. Hetzner Console > Projects > yeni proje `kazuist` (mevcut `kulular-uretim-01` sunucusuna dokunulmaz, ADR-0030).
2. Security > SSH Keys > Add SSH key: yönetici makinesinin ed25519 açık anahtarı.
3. Firewalls > Create Firewall, ad `kazuist-uretim`. Kurallar (Inbound):

   | Port | Kaynak | Not |
   |---|---|---|
   | 22/tcp | yalnız yönetici IP'leri | SSH |
   | 80/tcp | herkes | Let's Encrypt HTTP doğrulaması ve HTTPS yönlendirmesi |
   | 443/tcp | kapalı prova boyunca yalnız yönetici IP'leri; yayın günü herkes | ADR-0033 madde 1, "yalnız izinli IP" |
   | ICMP | herkes | ping |

   8000, 6001, 6002 (Coolify paneli) açılmaz; panele SSH tüneliyle girilir (adım 4). Docker'ın yayımladığı portlar
   ufw'yi atlayabilir (Coolify güvenlik duvarı belgesi); bu yüzden asıl koruma sunucunun dışındaki Hetzner
   Firewall'dur.
4. Servers > Add Server: Location Nuremberg (NBG1) ya da Falkenstein (FSN1); Image Ubuntu 24.04; Type CX43 ya da
   CPX42; SSH key adım 2; Firewall `kazuist-uretim`; Backups isteğe bağlı (sunucu dışı yedeğin yerini tutmaz);
   Name `kazuist-uretim-01`. Satın alma ve ödeme Tarık'ındır.
5. IPv4 adresini ve SSH kullanıcısını (`root`) `~/Desktop/kazuist-uretim.txt` dosyasına yazın (`SUNUCU_IP=...`,
   `SSH_USER=root`), `chmod 600`. Dosyaya parola yazılmaz; giriş yalnız anahtarla.

## 1. SSH ve temel güvenlik

Komutlar yönetici makinesinden; IP dosyadan okunur ve ekrana basılmaz.

```bash
set -a; . ~/Desktop/kazuist-uretim.txt; set +a
ssh "$SSH_USER@$SUNUCU_IP" 'cat /etc/os-release | head -2; uname -m; df -h /; df -ih /; free -h; timedatectl'
```

Beklenen: Ubuntu 24.04, `x86_64`, disk ve RAM sipariş edilenle aynı. Çıktı not edilir (geri dönüş noktası).

Sunucuda (ilk SSH oturumu açık kalır; ikinci bir oturumla denenmeden kapatılmaz):

```bash
apt-get update && apt-get -y upgrade
apt-get -y install ufw unattended-upgrades curl git jq
systemctl is-enabled unattended-upgrades        # enabled beklenir (güvenlik güncellemeleri)

# SSH: yalnız anahtar. Coolify localhost sunucusuna root ve kendi anahtarıyla bağlandığı için root girişi
# "prohibit-password" kalır (parola kapalı, anahtar açık).
cp /etc/ssh/sshd_config /root/sshd_config.yedek
cat >/etc/ssh/sshd_config.d/10-kazuist.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl reload ssh
```

İkinci terminalden `ssh root@<IP> true` ile girişin çalıştığını doğrulayın; sonra devam edin.

ufw (sunucu içi ikinci katman; Docker'ın yayımladığı portları kapatmaz, asıl filtre Hetzner Firewall'dur):

```bash
ufw status verbose                               # önce mevcut durum
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                                 # kaynağı Hetzner Firewall daraltır; Coolify kendi SSH'ını da kullanır
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose
```

Takas alanı (konteynerlerin bellek sınırları takası kapsar; bu yalnız işletim sistemi ve Coolify için tampon):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/90-kazuist.conf && sysctl --system >/dev/null
free -h
```

## 2. Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
docker version --format '{{.Server.Version}}'    # 24 ya da üstü
docker ps --format '{{.Names}}\t{{.Status}}'      # coolify, coolify-db, coolify-redis, coolify-realtime, coolify-proxy
```

Panel SSH tüneliyle açılır (8000, 6001, 6002 internete açılmaz):

```bash
ssh -N -L 8000:127.0.0.1:8000 -L 6001:127.0.0.1:6001 -L 6002:127.0.0.1:6002 root@<IP>
```

Tarayıcıda `http://localhost:8000`: ilk yönetici hesabını Tarık oluşturur, Settings > Two-factor ile iki adımlı
doğrulamayı açar. Sonra:

1. Servers > localhost: "Reachable" ve "Validated"; Proxy: Traefik çalışıyor.
2. Settings > Notifications > Email: dağıtım başarısızlığı bildirimleri Tarık'ın adresine.
3. Coolify alan adı (`coolify.kazuist.com`) DNS kaydı ister; Tarık onayına kadar panel yalnız tünelle kullanılır.

## 3. Sunucu klasörleri, kayıt girişi ve depo kopyası

```bash
# worker-py ham arşivi (uid 10001 imajdaki "app" kullanıcısı) ve yalnız okunur model klasörleri
install -d -o 10001 -g 10001 -m 750 /srv/kazuist/raw-store
install -d -o root -g root -m 755 /srv/kazuist/models/ner /srv/kazuist/models/embed
ls -ld /srv/kazuist/raw-store /srv/kazuist/models/*

# Yedek ve sağlık betikleri için deponun salt okunur kopyası (depo herkese açık, Apache-2.0)
git clone --depth 1 https://github.com/tialkan/kazuistcom.git /opt/kazuist
git -C /opt/kazuist log -1 --format='%H %cI'
```

GHCR girişi (imajlar özel paket olarak kalırsa): Tarık GitHub'da token üretir (aşağıda "Tarık'tan gerekenler"),
Coolify > Servers > localhost > Registries > Log in > GHCR ile girer; Coolify sunucu kullanıcısı için `docker login`
çalıştırır ve token'ı veritabanında tutmaz. SSH ile yapılacaksa: `docker login ghcr.io -u <github kullanıcı adı>
--password-stdin` (token terminale yapıştırılır, komut satırına ve geçmişe yazılmaz). Doğrulama:
`docker pull ghcr.io/tialkan/kazuist-web:main`.

## 4. Coolify kaynağı (Docker Compose, GHCR imajları)

Projects > New: `kazuist`, ortam `production`. Add Resource > Public Repository:

| Alan | Değer |
|---|---|
| Repository URL | `https://github.com/tialkan/kazuistcom` |
| Branch | `main` |
| Build Pack | Docker Compose |
| Base Directory | `/` |
| Docker Compose Location | `/infra/docker-compose.prod.yml` |

Bu dosyadaki her hizmet `image:` kullanır; sunucuda derleme yapılmaz. Domains bölümünde yalnız `web` hizmetine alan
verilir: kapalı provada Tarık'ın onayladığı geçici alt alan (örnek `https://prova.kazuist.com:3000`), yayında
`https://kazuist.com:3000` (`:3000` konteyner portudur, dışarıdan 443 kullanılır). Diğer hizmetlere alan verilmez;
hiçbir hizmette `ports:` yoktur, PostgreSQL ve Valkey yalnız yığının iç ağındadır. "Connect to predefined network"
açılmaz (hizmet adları önek alabilir ve `postgres`, `valkey`, `worker-py` adları bozulur).

### Ortam değişkenleri

Değerler Coolify > kaynak > Environment Variables'a "Is Secret" işaretli girilir; yer tutucu yapıştırılmaz. `:?`
işaretli değişken boşken Coolify dağıtmaz. Rastgele değerler sunucuda üretilip doğrudan panele yapıştırılır; hiçbir
yere kaydedilmez, Kulular parola yöneticisine yazılır.

| Değişken | Zorunlu | Kaynak ya da üretim | Kullanan |
|---|---|---|---|
| `KAZUIST_IMAGE_TAG` | hayır (öntanım `main`) | main'de yeşil commit'in tam sha'sı; üretimde her zaman sha | hepsi |
| `KAZUIST_IMAGE_PREFIX` | hayır (öntanım `ghcr.io/tialkan/kazuist`) | değiştirilmez | hepsi |
| `KAZUIST_ENV` | evet | kapalı provada `staging`, yayın günü `production`. Tek değişken üç hizmete de gider; worker-py imajının öntanımı `production` olduğu için provada `staging` açıkça girilmelidir (dosyada `:?`, boşken dağıtım olmaz) | web, worker-node, worker-py |
| `KAZUIST_MODULLER` | hayır (öntanım boş) | on-yuz, PR 103 (`apps/web/src/app/(kabuk)/_kabuk/yayin.ts`); boş bırakılır, değer ve anlamı o dosyadan okunur | web |
| `APP_URL` | evet | `https://prova.kazuist.com` ya da `https://kazuist.com` (BETTER_AUTH_URL da bundan) | web, worker-node |
| `POSTGRES_PASSWORD` | evet | `openssl rand -hex 32` (yalnız onaltılık; URL'ye kaçışsız girer) | postgres ve hepsinin DATABASE_URL'si |
| `VALKEY_PASSWORD` | evet | `openssl rand -hex 32` | valkey, web |
| `BETTER_AUTH_SECRET` | evet | `openssl rand -base64 32` | web, worker-node |
| `BYOK_SIGNING_SECRET` | evet | `openssl rand -hex 32` | web |
| `PII_ENCRYPTION_KEY` | evet | `openssl rand -base64 32`; kaybı şifreli alanları okunamaz yapar | web |
| `KAZUIST_INTERNAL_TOKEN` | evet | `openssl rand -hex 32` | web, worker-py |
| `MAIL_SMTP_URL`, `MAIL_FROM` | yayın öncesi evet | e-posta sağlayıcısı (plan 14.6); gönderen `"Kazuist" <bildirim@kazuist.com>` | web, worker-node |
| `AUTH_TRUSTED_ORIGINS` | hayır | ek kökenler, virgülle | web |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | hayır | Google Cloud Console | web |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_IDENTIFIER` | hayır | Apple Developer | web |
| `ACCOUNT_PURGE_GRACE_DAYS` | hayır | boş = 14 | web |
| `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, `AI_DAILY_BUDGET_TRY` | hayır | platform YZ modu (ADR-0025); boşken yalnız BYOK | web (Anthropic worker-py de) |
| `KAZUIST_ARAMA_AGIRLIK`, `KAZUIST_EMBED_URL`, `KAZUIST_EMBED_MODEL`, `KAZUIST_EMBED_DIM`, `KAZUIST_EMBED_ESIK` | hayır | casuist; sorgu gömme servisi gelince | web |
| `YAZMA_YZ`, `PRATIK_ONIZLEME` | hayır | `PRATIK_ONIZLEME` yalnız kapalı provada, yayında boş | web |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_MERCHANT_ID`, `IYZICO_BASE_URL` | hayır | yayında boş (ödemesiz kip); canlı anahtar yalnız Tarık onayıyla | web, worker-node |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | hayır | Web Push | worker-node |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID` | hayır | iOS bildirimleri | worker-node |
| `KAZUIST_NER_BACKEND`, `KAZUIST_NER_THREADS`, `KAZUIST_NER_QUANTIZED` | hayır | model klasörü kurulunca (`dagitim.md`, "worker-py model birimleri") | worker-py |
| `KAZUIST_EMBED_BACKEND`, `KAZUIST_EMBED_THREADS`, `KAZUIST_EMBED_QUANTIZED` | hayır | ADR-0037 koşullarıyla; 16 GB x86'da `THREADS=4` | worker-py |
| `KAZUIST_SOURCE_*` (7), `OPENALEX_API_KEY`, `KAZUIST_CITATIONS_SCOPE` | hayır | kaynak onayı (docs/kaynaklar) ve veri-toplama | worker-py |

Dosyada sabit olan ve panele girilmeyenler: `DATABASE_URL`, `VALKEY_URL`, `BETTER_AUTH_URL` (APP_URL),
`TRUSTED_PROXY_COUNT=1`, `WORKER_PY_URL=http://worker-py:8001`, `KAZUIST_RAW_DIR=/data/raw-store`, model dizinleri,
`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`. `S3_*` gerekmez (hiçbir kod okumuyor; `/api/health` artık istemiyor).
`KAZUIST_POLL_SECONDS` dosyada yoktur: boş değer worker-py'yi düşürüyor, öntanım 5 saniye kullanılır. Yerelde ve testte kullanılan `KAZUIST_ARAMA_KAYNAGI`, `KAZUIST_FIKSTUR_URETIMDE`, `KAZUIST_LIVE_SMOKE` sunucuya hiç
girilmez.

### Bakım sayfası (FR-105)

`maintenance` hizmeti aynı dosyadadır ve konteyner adı `kazuist-maintenance`'tır. Servers > localhost > Proxy >
Dynamic Configurations: `infra/maintenance/traefik-dynamic.yml` içeriği eklenir, `HOST` yerine `web`'in alan adı
yazılır; `entryPoints` ve `certResolver` adları Proxy > Configuration'dan doğrulanır. Ad çözümü denetimi:

```bash
docker exec coolify-proxy wget -qO- http://kazuist-maintenance:8080/healthz    # ok
```

Coolify konteyner adını değiştirdiyse (`docker ps --format '{{.Names}}' | grep maintenance`) dinamik yapılandırmadaki
`url` gerçek adla güncellenir.

## 5. İlk dağıtım

1. `gh run list --branch main --workflow ci --limit 3`: son commit'te `publish` işi yeşil. Sha not edilir;
   `KAZUIST_IMAGE_TAG` olarak girilir.
2. Coolify > kaynak > Deploy. Sıra dosyadan gelir: postgres ve valkey sağlıklı, `migrate` çıkış 0, sonra web,
   worker-node, worker-py, maintenance. `migrate` başarısızsa dağıtım durur, çalışan sürüm değişmez.
3. Sunucuda doğrulama:

   ```bash
   docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'web|worker|postgres|valkey|maintenance'   # hepsi healthy
   docker logs $(docker ps -aq --filter label=kazuist.service=migrate | head -1) 2>&1 | tail -3    # "msg":"done"
   docker stats --no-stream --format '{{.Name}}\t{{.MemUsage}}'                                  # sınırlar görünür
   docker exec $(docker ps -q --filter label=kazuist.service=worker-py) \
     python -c "open('/data/raw-store/.yazma-denetimi','w').write('ok')" && ls -l /srv/kazuist/raw-store
   ```

4. Yedek kurulumu ve ilk geri yükleme testi: `yedek.md`, "Kurulum" ve "Geri yükleme testi". Test geçmeden kapalı
   prova kişisel veri olmadan bile tamamlanmış sayılmaz (ADR-0033 ön koşul 4).
5. Dış izleme: `izleme.md`.

## 6. Kapalı prova (KAZUIST_ENV=staging)

ADR-0033 madde 1: site herkese açık değildir, gerçek kişi verisi yoktur (anonim corpus, sentetik hesaplar, iyzico
sandbox ya da ödemesiz kip), prova bitince sentetik hesaplar silinir.

- Erişim: Hetzner Firewall 443 yalnız yönetici IP'leri. Adres Tarık'ın onayladığı geçici alt alandır (`dns-yedek.md`,
  "Kapalı prova kaydı"); DNS değişikliği onayla ve önceki kayıtlar yedeklendikten sonra.
- `noindex`: `KAZUIST_ENV=staging` iken uygulama her sayfada `noindex` verir ve robots kapalıdır
  (`apps/web/src/app/(seo)/_seo/ortam.ts`). Doğrulama: `curl -s https://<prova>/robots.txt` ve sayfa başlığında
  `noindex`.
- Kabul testleri: plan 14.9 ve siteyarat.md 20 (`dagitim.md`, "Dış kabul testleri"), yönetici IP'sinden.

## 7. Yayın günü (production)

Ön koşullar ADR-0033 "Yayının ön koşulları" bölümündedir (KVKK m.9, hukuki metin onayı, yayın kapıları, sunucu dışı
yedek ve geri yükleme kanıtı, DNS onayı). Hepsi sağlanmadan aşağıdakiler yapılmaz.

1. Anlık yedek: `systemctl start kazuist-backup.service && journalctl -u kazuist-backup -n 5`.
2. Sentetik prova hesapları ve sandbox kayıtları silinir (Tarık onayıyla; silinecek kimlikler önce listelenir).
3. DNS: `dns-yedek.md`, yedek alınır, Tarık onayıyla `kazuist.com` A kaydı sunucu IP'sine (DNS only).
4. Coolify: `web` alanı `https://kazuist.com:3000`; `APP_URL=https://kazuist.com`; `KAZUIST_ENV=production`;
   `PRATIK_ONIZLEME` boş; Deploy.
5. Hetzner Firewall: 443 herkese açılır.
6. Dış kabul testleri ve izleme yeniden; teslim raporu (siteyarat.md 23).

## Tarık'tan gerekenler

- Sunucu siparişi (adım 0) ve IP'nin `~/Desktop/kazuist-uretim.txt` dosyasına yazılması.
- GHCR okuma token'ı (imajlar özel kalırsa): https://github.com/settings/tokens > Generate new token > Generate new
  token (classic); Note `kazuist sunucu ghcr okuma`; Expiration 90 days; yalnız `read:packages`; Generate token.
  Token'ı yalnız Coolify > Servers > localhost > Registries > Log in ekranına yazın. Alternatif: paketleri herkese açık
  yapmak (https://github.com/tialkan?tab=packages > paket > Package settings > Change visibility > Public); depo zaten
  Apache-2.0 ile açık olduğundan imajlar gizli bilgi taşımaz, ama ADR-0033 madde 4 "özel kayıt" der; karar Tarık'ın.
- Storage Box ve yedek parolası: `yedek.md`, "Tarık'tan gerekenler".
- Geçici prova alt alanı ve yayın günü DNS onayı: `dns-yedek.md`.
