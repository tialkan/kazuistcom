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

## Token olmadan: panelden elle (Tarık)

Cloudflare API token'ı şimdilik yok; aynı yedek ve staging kaydı panelden şöyle yapılır.

### DNS yedeği

1. https://dash.cloudflare.com adresine girin, hesabı ve `kazuist.com` bölgesini seçin.
2. Sol menü DNS > Records.
3. Kayıt listesinin üstündeki "Import and Export" düğmesi > Export. İnen BIND dosyasını
   `docs/runbook/dns-yedek-<YYYY-AA-GG>.zone` adıyla bana iletin (kayıtlar gizli değildir).
4. Aynı sayfanın ekran görüntüsünü (Proxy status sütunu görünür olacak şekilde) ekleyin; dosyada proxied bilgisi yoktur.

### staging kaydı (VPS-1 IP'si belli olunca, onayınızla)

1. DNS > Records > Add record.
2. Type `A`, Name `staging`, IPv4 address `<VPS-1 IP>`, Proxy status kapalı (gri bulut, "DNS only"), TTL Auto.
3. Save. MX, SPF, DKIM, DMARC ve e-posta kayıtlarına dokunmayın.
4. Doğrulama (ajan yapar): `dig +short staging.kazuist.com @1.1.1.1` VPS-1 IP'sini döndürmeli.
5. Geri alma: aynı kaydı Delete; önceki durum yedek dosyasındadır.
