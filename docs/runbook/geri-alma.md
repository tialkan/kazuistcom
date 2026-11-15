# Geri alma runbook'u

Kaynak: siteyarat.md 22, plan.md 14.3, ADR-0033. Her değişiklikten önce geri dönüş noktası yazılır; geri almadan sonra
sağlık ve veri bütünlüğü yeniden test edilir.

| Alan | Geri dönüş noktası | Nasıl |
|---|---|---|
| Uygulama | Önceki `KAZUIST_IMAGE_TAG` (sha) | Coolify > kaynak > Environment Variables > eski sha > Deploy; ya da main'de `git revert` ve normal terfi |
| Veri tabanı | Migration öncesi elle yedek (restic `postgres` anlık görüntüsü) | Önce ileri düzeltme (yeni migration); olmazsa geri yükleme (aşağıda) |
| Ham arşiv | restic `raw-store` anlık görüntüsü | `yedek.md`, "Felaket kurtarma" adım 3'ün raw-store kısmı |
| DNS | `docs/runbook/dns-yedek-<tarih>.json` ve `.zone` | Önceki değerleri Cloudflare'de elle yaz (Tarık onayıyla); MX, SPF, DKIM, DMARC'a dokunulmaz |
| Cloudflare ayarı | Değişiklik öncesi API cevabı | Aynı değeri geri yaz |
| Coolify yapılandırması | restic `coolify` anlık görüntüsü (`source/.env`, `backups/`) | Coolify belgesindeki geri yükleme adımları, APP_KEY bu dosyadan |
| Hetzner Firewall | Değişiklik öncesi kural listesi (ekran görüntüsü ya da `hcloud firewall describe`) | Aynı kuralları geri yaz |
| Sunucu | Büyük yükseltme öncesi Hetzner anlık görüntüsü | Hetzner Console > Server > Snapshots > Rebuild (Tarık onayıyla; disk üzerine yazar) |

## Uygulama geri alma (en sık)

1. Belirti: `/api/health` 503, hata dalgası, dış izleme uyarısı, `migrate` sonrası bozulma.
2. Coolify > kaynak > Environment Variables > `KAZUIST_IMAGE_TAG`: önceki sha (`dagitim.md` adım 3'te not edilen) >
   Save > Deploy. Bütün uygulama imajları aynı etiketten gelir; web ve işçiler birlikte döner (iş kuyruğu sözleşmesi
   uyumu).
3. Migration geri alınmaz. Migration'lar geriye dönük uyumlu olduğu için eski kod yeni şemada çalışır; eski
   `migrate` imajı yeni migration'ı bilmediği için iş yapmadan çıkar. Uyumsuzsa dur ve veri tabanı bölümüne geç.
4. Doğrula: `/api/version` eski commit'i gösteriyor, `/api/health` 200, son 15 dakikada worker loglarında
   `"msg":"failed"` dalgası yok.
5. Sorunlu commit için main'de `git revert` PR'ı aç; CI yeşil olunca normal terfi.

## Veri tabanı geri alma

Yalnız Tarık onayıyla; geri yükleme anından sonraki yazımlar kaybolur.

1. Uygulamaları durdur (bakım sayfası devreye girer):
   `for s in web worker-node worker-py; do docker stop $(docker ps -q --filter label=kazuist.service=$s); done`.
2. Son sağlıklı anlık görüntüyü seç: `/opt/kazuist/infra/backup/backup.sh snapshots` (etiket `postgres`, sorunlu
   migration'dan hemen önceki).
3. Önce ayrı hedefte doğrula: `/opt/kazuist/infra/backup/restore-test.sh <snapshot-id>` geçmeli.
4. Mevcut veritabanını silmeden yedekle: `systemctl start kazuist-backup.service` (sorunlu durumun kopyası en az 7
   gün saklanır; saklama kuralı bunu zaten tutar).
5. Geri yükle: `yedek.md`, "Felaket kurtarma" adım 3'teki komutlar, `latest` yerine seçilen anlık görüntü kimliğiyle.
6. Coolify > Redeploy (önceki sha ile), sonra doğrula: `/api/health` 200; defter dengesi
   (`restore-test.sh` çıktısındaki sorgu canlıda da 0 döner).
