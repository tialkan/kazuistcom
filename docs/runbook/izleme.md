# İzleme

Kaynak: plan.md 14.7, siteyarat.md 19, webtasarim.md 150-154a, ADR-0033 ("dış erişilebilirlik denetimi aynı sunucuda
çalışmaz"). Bildirimler yalnız durum değişince gönderilir.

## Neyin nerede çalıştığı

| Araç | Yer | Neden |
|---|---|---|
| Dış uç izleme (HTTP, anahtar kelime, TLS süresi) | Sunucunun dışında: barındırılan bir izleme servisi ya da başka bir makinedeki Uptime Kuma | İzlenen sunucu kendi kesintisini bildiremez |
| Kalp atışı (heartbeat) monitörleri: yedek, disk | Aynı dış servis | Ping gelmezse de uyarır; sunucu tamamen giderse fark edilir |
| Coolify dağıtım bildirimleri | Coolify (sunucuda), e-posta | Başarısız dağıtım |
| Konteyner sağlığı | Docker healthcheck (`infra/docker-compose.prod.yml`) | Sağlıksız web Traefik'ten düşer, bakım sayfası döner |
| GlitchTip, Uptime Kuma, Umami | Bu sunucuda çalışmaz | Bellek bütçesi uygulamaya ayrıldı (`coolify.md`); hata izleme SDK'sı ve Umami betiği kodda henüz yok |

Dış servisi Tarık seçer. Gerekenler: 60 saniyelik HTTP denetimi ve anahtar kelime, TLS bitiş uyarısı, başarı ve hata
adresi ayrı olan kalp atışı monitörü (süre ve tolerans ayarlı), e-posta bildirimi, AB'de barındırma tercih edilir.
Servise yalnız adres ve durum gider; kişisel veri, istek gövdesi ve token gitmez. Seçilen servisin adı, konumu ve
sözleşmesi aktarım envanterine yazılır (hukuk-uyum; teknik veri olsa da kayıt tutulur).

## Monitörler

| Kontrol | Yöntem | Eşik |
|---|---|---|
| `https://kazuist.com/api/health` | HTTP 60 sn, anahtar kelime `"ok"` | 2 ardışık başarısızlık |
| `https://kazuist.com/api/version` | HTTP anahtar kelime, terfi sonrası elle | beklenen commit |
| `https://kazuist.com/` | HTTP 60 sn, 200 | 2 ardışık başarısızlık |
| TLS süresi | Dış servisin sertifika uyarısı | 14 gün |
| Alan adı süresi | Takvim | 24.02.2027'den 60 gün önce |
| Yedek | Kalp atışı: `KAZUIST_BACKUP_PING_OK_URL` her başarılı çalışmada, `..._FAIL_URL` hatada (`infra/backup/backup.sh`) | süre 6 saat, tolerans 2 saat |
| Disk, inode, yedek yaşı | Kalp atışı: `infra/backup/disk-check.sh` 5 dakikada bir; disk ya da inode %80, son başarılı yedek 8 saatten eski ise hata adresi | süre 5 dk, tolerans 10 dk |
| Dağıtım hataları | Coolify > Settings > Notifications > Email | her başarısızlık |
| Kaynak bağlayıcı sağlığı | worker-py logları (veri-toplama) | bağlayıcı başına |
| YZ harcaması | ai-gateway sayaçları | günlük tavanın %80'i |

`/api/health` yanıtları: 200 `{"status":"ok"}` her şey hazır; 200 `{"status":"degraded"}` PostgreSQL ve Valkey
hazır ama SMTP sağlayıcısına ulaşılamıyor (giriş ve doğrulama kodları gitmez; sonuç 5 dakika, hata 1 dakika önbellekte);
503 `{"status":"degraded"}` PostgreSQL ya da Valkey yok veya kritik ortam değişkeni eksik (eksik adlar yalnız web
logunda, `"at":"health"` satırında). Yanıtta bağımlılık ya da değişken adı yoktur. 200 degraded web'i trafikten
çıkarmaz (Traefik yalnız sağlıksız konteyneri düşürür); anahtar kelime `"ok"` olmadığı için monitör yine uyarır.

Kapalı provada 443 yalnız yönetici IP'lerine açık olduğu için dış HTTP monitörleri yayın günü açılır; kalp atışları
ilk günden çalışır (giden istek).

RAM ve yeniden başlama sayısı: `docker stats --no-stream`, `docker inspect -f '{{.RestartCount}}' <konteyner>`
haftalık elle; bellek sınırına çarpan konteyner `docker inspect -f '{{.State.OOMKilled}}'` ile görülür.
Valkey `noeviction` ile çalışır: 192 MB dolarsa yazmalar hata verir ve özet istekleri kapalı hata ile reddedilir (nonce ya
da sayaç sessizce silinmez). Haftalık elle: `docker exec $(docker ps -q --filter label=kazuist.service=valkey) sh -c
'valkey-cli -a "$VALKEY_PASSWORD" --no-auth-warning info memory' | grep -E 'used_memory_human|maxmemory_human'`;
kullanım %80'i geçerse `--maxmemory` ve `mem_limit` birlikte artırılır (`infra/docker-compose.prod.yml`).

## Kurulum

1. Dış serviste beş monitör: `/api/health`, `/`, TLS, yedek kalp atışı, disk kalp atışı.
2. Kalp atışı adreslerini `/etc/kazuist/backup.env` dosyasına yazın (`KAZUIST_BACKUP_PING_OK_URL`,
   `KAZUIST_BACKUP_PING_FAIL_URL`, `KAZUIST_DISK_PING_OK_URL`, `KAZUIST_DISK_PING_FAIL_URL`); adresler gizli tutulur,
   depoya girmez.
3. Deneme: `systemctl start kazuist-disk-check.service && journalctl -u kazuist-disk-check -n 3`; servis panelinde
   ping görünmeli. Hata yolunu denemek için bir kez `KAZUIST_DISK_LIMIT_PCT=1 /opt/kazuist/infra/backup/disk-check.sh`
   (uyarı gelmeli, sonra normal çalıştırma ile düzelir).

## Bakım takvimi

- Haftalık: başarısız dağıtım, yeniden başlama ve OOM kontrolü.
- Aylık: güvenlik güncellemeleri (`unattended-upgrades` logu), disk ve yedek kontrolü, `git -C /opt/kazuist pull`,
  bağımlılık taraması.
- Üç aylık: geri yükleme testi (`yedek.md`), API token ve erişim denetimi (GHCR okuma token'ının süresi).
- Yıllık: alan adı, sunucu, depolama ve sertifika yenileme.

## Disk dolunca

İlk bakılacak: `df -h /`, `docker system df`, `du -sh /srv/kazuist/* /var/lib/docker/volumes/*`. Güvenli temizlik:
`docker image prune -f`. Volume'lara dokunulmaz. Kalıcı çözüm disk büyütme ya da Hetzner Volume'dur; veri kaybı
riski olduğu için Tarık onayıyla ve öncesinde yedekle.
