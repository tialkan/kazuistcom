# Yedekleme ve geri yükleme

Kaynak: plan.md 14.7, siteyarat.md 18. Yedek alınmamış sistem tamamlanmış sayılmaz; başarılı yedek kaydı geri yüklenebilirlik kanıtı değildir.

## Kapsam

| Ne | Sıklık | Araç | Hedef |
|---|---|---|---|
| PostgreSQL tam yedek | Günlük 03:00 (Europe/Istanbul) | pgBackRest `backup --type=full` (pazar), `--type=diff` (diğer günler) | Türkiye'de ikinci sağlayıcıda S3 uyumlu depo |
| PostgreSQL WAL | Sürekli | `archive_mode=on`, `archive_command = 'pgbackrest --stanza=kazuist archive-push %p'` | Aynı depo |
| Nesne deposu (yüklemeler, ham arşiv) | Günlük | `rclone sync --backup-dir` | İkinci sağlayıcı, ayrı kova |
| Coolify yapılandırması | Günlük | Coolify'ın kendi yedeği (Settings > Backup) ve `/data/coolify/source/.env` şifreli kopyası | Aynı depo, ayrı önek |
| VPS anlık görüntüsü | Haftalık ve büyük değişiklik öncesi | Sağlayıcı paneli | Sağlayıcı |

pgBackRest seçimi: tam, fark ve WAL arşivini tek araçta yönetir, S3 hedefi ve istemci tarafı şifreleme (`repo1-cipher-type=aes-256-cbc`) destekler, MIT lisanslı. Sürüm ve ayar adları kurulum günü pgbackrest.org belgesinden doğrulanır.

## Saklama: 7 günlük, 4 haftalık, 6 aylık

- PostgreSQL: haftalık tam yedek (pazar) 4 adet; günlük fark yedekleri 7 gün; ayın ilk pazar yedeği ayrıca aylık depoya (`repo2`) kopyalanır, 6 adet. WAL, en eski saklanan tam yedeğe kadar tutulur (`repo1-retention-full=4`, `repo1-retention-diff=7`, `repo2-retention-full=6`).
- Nesne deposu: rclone günlük `--backup-dir` klasörleri 7 gün, haftalık 4, aylık 6; silme betiği yalnız yedek kovasında ve tarih önekine göre çalışır.
- Kova yaşam döngüsü kuralı varsa saklamayla çelişmeyecek şekilde ayarlanır.

## Şifreleme

- Aktarımda TLS (S3 HTTPS uç noktası).
- Depoda istemci tarafı şifreleme: pgBackRest `repo1-cipher-pass`, rclone `crypt` arka ucu. Anahtarlar Coolify secret değişkeninde ve Kulular parola yöneticisinde; depoya ve sohbete girmez.
- Yedek kovası erişim anahtarı yalnız yazma ve listeleme yetkili; silme yetkisi ayrı yönetici anahtarında.

## Elle yedek (migration veya büyük değişiklik öncesi)

1. VPS-2: `sudo -u postgres pgbackrest --stanza=kazuist --type=incr backup`
2. `pgbackrest --stanza=kazuist info` çıktısında yeni yedeğin zamanını not et.
3. Gerekirse sağlayıcı panelinden anlık görüntü.

## Geri yükleme testi tasarımı

Yayından önce bir kez, sonra üç ayda bir. Sonuç `docs/runbook/geri-yukleme-<tarih>.md` dosyasına yazılır.

1. Geçici hedef: ayrı küçük VPS veya VPS-2'de ayrı veri dizini ve port (5433), internete kapalı.
2. Son tam yedek ve WAL ile geri yükle: `pgbackrest --stanza=kazuist --pg1-path=/var/lib/postgresql/restore --type=time --target="<dün 23:00>" restore`.
3. PostgreSQL'i geçici hedefte aç; `pg_is_in_recovery()` false olana kadar bekle.
4. Doğrulama sorguları (çıktılar rapora):
   - Tablo sayısı ve şema sürümü: `SELECT count(*) FROM drizzle.__drizzle_migrations;`
   - Satır sayıları üretimle karşılaştırma (records, chunks, users, ledger_entries); fark yedek zamanından sonraki yazımlarla açıklanmalı.
   - Defter dengesi: `SELECT transaction_id FROM ledger_entries GROUP BY 1 HAVING sum(CASE WHEN side='borc' THEN credits ELSE -credits END) <> 0;` boş dönmeli.
   - Uzantılar ve dizinler: `infra/scripts/db-smoke.sql` geçici hedefte çalıştırılır (işlemi geri alır, veri bırakmaz).
   - Rastgele 20 kaydın içerik özetinin üretimle eşleşmesi.
5. Nesne deposu: rastgele 50 nesneyi geri indir, sağlama toplamını karşılaştır.
6. Süre ölç: geri yükleme süresi (RTO) ve kayıp aralığı (RPO, son WAL ile hedef zaman farkı). Hedef RTO 4 saat, RPO 15 dakika.
7. Geçici hedefi kapat; geri yüklenen veri kişisel veri içerdiği için disk güvenli biçimde silinir (Tarık onayıyla).

Başarısız geri yükleme testi yayın kapısını kapatır.

## Zamana nokta geri yükleme (olay anında)

`geri-alma.md`, "Veri tabanı geri alma". Her zaman ayrı hedefe geri yüklenir, doğrulanır, sonra geçilir; mevcut küme üzerine yazılmaz.

## İzleme

Yedek yaşı uyarısı: son başarılı tam veya fark yedeği 26 saatten eskiyse, son arşivlenen WAL 15 dakikadan eskiyse uyarı (`izleme.md`).
