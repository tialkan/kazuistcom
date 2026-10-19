# Geri alma runbook'u

Kaynak: siteyarat.md 22, plan.md 14.3. Her değişiklikten önce geri dönüş noktası yazılır; geri almadan sonra sağlık ve veri bütünlüğü yeniden test edilir.

| Alan | Geri dönüş noktası | Nasıl |
|---|---|---|
| Uygulama | Son sağlıklı commit ve imaj | Coolify > uygulama > Deployments > önceki başarılı dağıtım > Redeploy; ya da main'de `git revert` ve normal dağıtım |
| Veri tabanı | Migration öncesi anlık yedek ve WAL | Önce ileri düzeltme (yeni migration); olmazsa zamana nokta geri yükleme (`yedek.md`) |
| DNS | `docs/runbook/dns-yedek-<tarih>.json` | Önceki değerleri Cloudflare'de elle yaz (Tarık onayıyla); MX, SPF, DKIM, DMARC'a dokunulmaz |
| Cloudflare ayarı | Değişiklik öncesi API cevabı | Aynı değeri geri yaz |
| Coolify | Eski sağlıklı dağıtım, yapılandırma yedeği | Redeploy; yapılandırma `yedek.md` |
| Sunucu | Büyük yükseltme öncesi anlık görüntü | Sağlayıcı panelinden geri dön |

## Uygulama geri alma (en sık)

1. Belirti: `/api/health` 503, hata dalgası, Uptime Kuma uyarısı.
2. Coolify > Projects > kazuist > <ortam> > web > Deployments: son başarılı dağıtımı bul, Redeploy.
3. worker-node ve worker-py aynı commit'e döner (iş kuyruğu sözleşmesi uyumu).
4. Migration geri alınmaz. Migration'lar geriye dönük uyumlu olduğu için eski kod yeni şemada çalışır. Uyumsuzsa dur ve veri tabanı bölümüne geç.
5. Doğrula: `/api/version` eski commit'i gösteriyor, `/api/health` 200, son 15 dakikada GlitchTip'te yeni hata yok.
6. Sorunlu commit için main'de `git revert` PR'ı aç; CI yeşil olunca normal dağıtım.

## Veri tabanı geri alma

Yalnız Tarık onayıyla; veri kaybı riski var.

1. Uygulamayı bakım sayfasına al (web'i durdur; Traefik yedek yönlendiricisi 503 bakım sayfası verir).
2. Hedef zamanı belirle (sorunlu migration'dan hemen önce).
3. `yedek.md`, "Zamana nokta geri yükleme" adımlarıyla AYRI bir hedefe geri yükle; doğrula.
4. Doğrulanmış hedefe geçiş: `DATABASE_URL` değişir, uygulama yeniden yayımlanır. Eski küme silinmez, en az 7 gün saklanır.
5. Defter tutarlılığı: her `ledger_transactions` için borç ve alacak toplamı eşit (sorgu `yedek.md`, geri yükleme testi).
