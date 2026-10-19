# DNS yedeği

Kaynak: plan.md 14.3, siteyarat.md 11 ve 22, webtasarim.md 145 ve 149a. Alan adı: kazuist.com; kayıt kuruluşu Turkticaret.net; ad sunucuları Cloudflare; DNSSEC kapalı.

## Betik

`infra/scripts/dns-export [zone]` yalnız GET isteği yapar, Cloudflare'de hiçbir şeyi değiştirmez.

1. Token etkin mi (`GET /user/tokens/verify`).
2. Token yalnız bir bölge görüyor mu (birden fazlaysa uyarır).
3. Tüm kayıtlar sayfalı okunur, `docs/runbook/dns-yedek-<UTC tarih>.json` olarak yazılır (tür, ad, içerik, TTL, proxied, öncelik, yorum).
4. BIND biçimi dışa aktarma (`GET /zones/<id>/dns_records/export`) `dns-yedek-<tarih>.zone` olarak yazılır.

Gereken: `curl`, `jq`. Token dosyası `~/Desktop/kazuist-cloudflare-api.txt`, içeriği `CLOUDFLARE_API_TOKEN=...`. Token komut satırına ve çıktıya basılmaz (curl'e stdin yapılandırmasıyla verilir).

Durum: token dosyası henüz yok; betik çalıştırılmadı. Token gelince ilk çalıştırma DNS geçişinden önce yapılır ve çıktı commit'lenir (kayıtlar gizli değildir; token yoktur).

## Token (Tarık)

1. https://dash.cloudflare.com/profile/api-tokens adresini açın.
2. Create Token > Custom token > Get started.
3. Token name: `kazuist dns yedek (salt okunur)`.
4. Permissions: `Zone` / `Zone` / `Read` ve `Zone` / `DNS` / `Read`. Başka izin eklemeyin.
5. Zone Resources: `Include` / `Specific zone` / `kazuist.com`.
6. Client IP Address Filtering: boş bırakılabilir; sabit ofis IP'si varsa ekleyin.
7. TTL: bitiş tarihi olarak 90 gün sonrasını seçin.
8. Continue to summary > Create Token.
9. Token'ı `~/Desktop/kazuist-cloudflare-api.txt` dosyasına tek satır `CLOUDFLARE_API_TOKEN=<token>` olarak kaydedin; `chmod 600 ~/Desktop/kazuist-cloudflare-api.txt`. Sohbete yalnız "dosya hazır" yazın.

DNS kaydı oluşturma için ayrı ve geçici bir `DNS Edit` token'ı gerekir; o, geçiş günü Tarık onayıyla açılır ve iş bitince silinir.

## Geçiş kuralları

- Geçiş öncesi A ve CNAME kayıtlarının JSON yedeği alınır (bu betik).
- MX, SPF, DKIM, DMARC ve e-posta alt alanları (`mail`, `autoconfig`, `autodiscover`) değiştirilmez; DNS only kalır.
- `staging` ve uygulama kayıtları DNS only (K-04).
- Geri dönüş: yedekteki önceki değerler elle yazılır (`geri-alma.md`).
