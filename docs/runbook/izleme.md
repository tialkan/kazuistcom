# İzleme

Kaynak: plan.md 14.7, siteyarat.md 19, webtasarim.md 150-154a. Tüm araçlar kendi sunucumuzda (aktarım yok, plan 5.5). Bildirimler yalnız durum değişince gönderilir.

## Araçlar

| Araç | Görev | Kurulum |
|---|---|---|
| GlitchTip | Hata izleme (Sentry uyumlu SDK) | Coolify > Service > GlitchTip şablonu, VPS-1, alan `glitchtip.kazuist.com` (yalnız yönetici IP'leri) |
| Uptime Kuma | Dışarıdan uç kontrolü, TLS süresi, push monitörleri | Coolify şablonu, alan `durum.kazuist.com` (panel yönetici IP'leri) |
| Umami | Çerezsiz analitik; yalnız anlamlı olaylar | Coolify şablonu; KVKK kapısı WebKVKKrobot ile |

İmaj sürümleri kurulum günü şablondan okunur ve buraya yazılır. Hata olaylarında kişisel veri ve istem içeriği gönderilmez (SDK `beforeSend` ile süzülür; ilgili ajanların işi).

## Monitörler

| Kontrol | Yöntem | Eşik |
|---|---|---|
| `/api/health` | Uptime Kuma HTTP, 60 sn | 2 ardışık başarısızlık |
| `/api/version` | HTTP anahtar kelime, dağıtım sonrası | beklenen commit |
| HTTP kodları ve süre | Uptime Kuma, Traefik erişim logu | 5xx oranı %1, p95 2 sn |
| TLS süresi | Uptime Kuma sertifika uyarısı | 14 gün |
| Alan adı süresi | Takvim | 24.02.2027'den 60 gün önce |
| Disk ve inode | Push monitör: cron betiği `df` | %80 |
| RAM ve swap | Push monitör | RAM %90, swap kullanımı 15 dk |
| Restart sayısı | `docker inspect -f '{{.RestartCount}}'` push | 1 saatte 3 |
| Yedek yaşı | pgBackRest `info --output=json` push | tam veya fark 26 saat, WAL 15 dk |
| Dağıtım hataları | Coolify bildirimleri (Settings > Notifications, e-posta) | her başarısızlık |
| Kaynak bağlayıcı sağlığı | worker-py metrikleri (veri-toplama) | bağlayıcı başına |
| YZ harcaması | ai-gateway sayaçları | günlük tavanın %80'i |

## Disk %80 push betiği (VPS-1 ve VPS-2)

`/etc/cron.d/kazuist-disk` her 5 dakikada `df --output=pcent,ipcent /` okur; ikisi de 80'in altındaysa Uptime Kuma push URL'sine `status=up`, değilse `status=down&msg=disk` gönderir. Push URL Uptime Kuma'dan alınır ve sunucuda `/etc/kazuist/push.env` dosyasında (600) durur; depoya girmez.

## Yedek yaşı push betiği (VPS-2)

`pgbackrest --stanza=kazuist info --output=json` içinden son yedeğin `timestamp.stop` değeri ve `archive.max` okunur; sınır aşılırsa push `down`. Betik ve cron dosyası kurulum PR'ında `infra/scripts/` altına eklenir.

## Bakım takvimi

- Haftalık: başarısız dağıtım ve restart kontrolü.
- Aylık: güvenlik güncellemeleri, disk ve yedek kontrolü, bağımlılık taraması.
- Üç aylık: geri yükleme testi (`yedek.md`), API token ve erişim denetimi.
- Yıllık: alan adı, sunucu, depolama ve sertifika yenileme.

## Disk dolunca

İlk bakılacak: `df -h /`, `docker system df`. Güvenli temizlik: `docker builder prune -af`, `docker image prune -f`. Volume'lara dokunulmaz.
