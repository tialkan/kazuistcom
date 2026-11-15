# Yedekleme ve geri yükleme

Kaynak: plan.md 14.7, siteyarat.md 18, ADR-0033 ön koşul 4 ("yedek sunucu dışındadır ve geri yükleme yayından önce
bir kez denenmiştir; aynı sunucudaki yedek yedek sayılmaz"). Yedek alınmamış sistem tamamlanmış sayılmaz; başarılı
yedek kaydı geri yüklenebilirlik kanıtı değildir.

## Düzen

| Ne | Nasıl | Sıklık | Hedef |
|---|---|---|---|
| PostgreSQL | `pg_dump --format=custom --compress=0` konteyner içinde, `pg_restore --list` ile denetlenir, sonra restic | 6 saatte bir (03, 09, 15, 21, Europe/Istanbul) | restic deposu, etiket `postgres` |
| Roller | `pg_dumpall --globals-only --no-role-passwords` | aynı | aynı anlık görüntü |
| Ham arşiv | `/srv/kazuist/raw-store` (worker-py `/data/raw-store`) | aynı | etiket `raw-store` |
| Coolify yapılandırması | `/data/coolify/source/.env` (APP_KEY) ve `/data/coolify/backups` | aynı | etiket `coolify` |
| Valkey | yedeklenmez: BYOK nonce'ları, ücretsiz hak ve TL sayaçları, hız sınırları; her anahtarın süresi en çok bir gün. Yeniden başlatmada AOF (`valkeydata` birimi) korur; sunucu kaybında sayaçlar sıfırdan başlar | yok | yok |
| Model klasörleri | yedeklenmez: `eval/anon/export_ner.py` ve `eval/embed/hazirla.py` ile yeniden üretilir | yok | yok |

Betikler: `infra/backup/backup.sh` (yedek, saklama, haftalık prune ve kısmi veri denetimi),
`infra/backup/restore-test.sh` (geri yükleme testi), `infra/backup/disk-check.sh` (disk, inode ve yedek yaşı),
`infra/backup/systemd/` (zamanlayıcılar). restic resmî imajından çalışır (`restic/restic:0.19.1`, BSD-2-Clause, özet
`infra/backup/lib.sh` içinde sabit); sunucuda Docker dışında bir şey kurulmaz.

Hedefler: kurtarma noktası (RPO) en çok 6 saat; kurtarma süresi (RTO) yeni bir sunucuda 4 saat. Daha kısa RPO
gerekirse sürekli WAL arşivi (pgBackRest ya da WAL-G) ayrı bir işle eklenir; bugün yalnız mantıksal döküm vardır.

## Şifreleme ve konum

- restic istemci tarafında şifreler (depo anahtarı parola dosyasından türetilir; içerik AES-256 ve Poly1305 ile
  doğrulanır, restic tasarım belgesi). Depo sağlayıcısı düz veri görmez. Aktarım SFTP (SSH) ya da HTTPS üzerindedir.
- Parola dosyası `/etc/kazuist/restic-password` (root, 600) ve Kulular parola yöneticisi. Parola kaybolursa bütün
  yedekler okunamaz; sunucu kaybında geri yükleme yalnız parola yöneticisindeki kopyayla yapılır.
- Hedef AB'de olmalıdır (ADR-0030 madde 2): Hetzner Storage Box (Falkenstein ya da Helsinki) önerilir; alternatif
  S3 uyumlu bir kova (ör. Hetzner Object Storage, AB konumu).
- Yedekte kişisel veri vardır. Silinen hesapların verisi yedeklerde saklama süresi (en çok 6 ay) boyunca kalır; bu,
  aydınlatma metninde ve silme taleplerine verilen cevapta belirtilir (hukuk-uyum).
- Fidye ve sunucu ele geçirilmesine karşı: sunucudaki anahtar depoyu silebilir. Storage Box'ta otomatik anlık görüntü
  (snapshot) planı açılır; böylece sunucudan silinen yedek sağlayıcı tarafında bir süre geri alınabilir. Plan adı,
  adet ve süre sipariş günü Hetzner belgesinden okunur.

## Saklama

restic `forget --group-by host,tags --keep-last 4 --keep-daily 7 --keep-weekly 4 --keep-monthly 6` her çalışmada;
`prune` ve `check --read-data-subset=5%` pazar günleri. Yani son 24 saatin 4 yedeği, 7 günlük, 4 haftalık ve 6 aylık
yedek tutulur (siteyarat.md 18).

## Kurulum (sunucuda, root)

Ön koşul: `ilk-kurulum.md` adım 3 (`/opt/kazuist` kopyası) ve Storage Box (aşağıda Tarık adımları).

```bash
install -d -m 700 /etc/kazuist /etc/kazuist/ssh
# 1. Depo parolası: sunucuda üretilir, ekrana basılmaz; kopyası parola yöneticisine Tarık tarafından alınır.
openssl rand -base64 48 > /etc/kazuist/restic-password && chmod 600 /etc/kazuist/restic-password

# 2. Storage Box için SSH anahtarı ve yapılandırma (konteyner içinde /root/.ssh olarak bağlanır)
ssh-keygen -t ed25519 -N '' -C kazuist-backup -f /etc/kazuist/ssh/id_ed25519
cat >/etc/kazuist/ssh/config <<'EOF'
Host storagebox
  HostName <uXXXXX>.your-storagebox.de
  User <uXXXXX>
  Port 23
  IdentityFile ~/.ssh/id_ed25519
  UserKnownHostsFile ~/.ssh/known_hosts
  StrictHostKeyChecking yes
EOF
chmod 600 /etc/kazuist/ssh/config
# Anahtarı Storage Box'a ekleme: Storage Box parolasını Tarık terminale kendisi girer (Hetzner belgesi, install-ssh-key).
cat /etc/kazuist/ssh/id_ed25519.pub | ssh -p23 -o UserKnownHostsFile=/etc/kazuist/ssh/known_hosts <uXXXXX>@<uXXXXX>.your-storagebox.de install-ssh-key
# Parolasız giriş denetimi:
ssh -F /dev/null -p23 -i /etc/kazuist/ssh/id_ed25519 -o UserKnownHostsFile=/etc/kazuist/ssh/known_hosts <uXXXXX>@<uXXXXX>.your-storagebox.de ls

# 3. Ortam dosyası (adlar infra/backup/backup.env.example'da)
cp /opt/kazuist/infra/backup/backup.env.example /etc/kazuist/backup.env && chmod 600 /etc/kazuist/backup.env
#    RESTIC_REPOSITORY=sftp:storagebox:kazuist-restic ve izleme ping adresleri düzenlenir.

# 4. Depo oluşturma (bir kez) ve ilk yedek
/opt/kazuist/infra/backup/backup.sh init
/opt/kazuist/infra/backup/backup.sh
/opt/kazuist/infra/backup/backup.sh snapshots

# 5. Zamanlayıcılar
ln -sf /opt/kazuist/infra/backup/systemd/kazuist-backup.service /opt/kazuist/infra/backup/systemd/kazuist-backup.timer \
  /opt/kazuist/infra/backup/systemd/kazuist-disk-check.service /opt/kazuist/infra/backup/systemd/kazuist-disk-check.timer \
  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now kazuist-backup.timer kazuist-disk-check.timer
systemctl list-timers 'kazuist-*'
```

`/opt/kazuist` betikleri depodan günceller: `git -C /opt/kazuist pull --ff-only` (betik değiştiğinde ve ayda bir).

## Elle yedek (migration ya da büyük değişiklik öncesi)

```bash
systemctl start kazuist-backup.service
journalctl -u kazuist-backup.service -n 20 --no-pager     # son satır "msg":"done"
/opt/kazuist/infra/backup/backup.sh snapshots | tail -5
```

## Geri yükleme testi

Yayından önce bir kez (ADR-0033 ön koşul 4), sonra üç ayda bir ve her büyük şema değişikliğinden sonra. Sonuç
`docs/runbook/geri-yukleme-<YYYY-AA-GG>.md` dosyasına yazılır (yalnız sayılar ve süreler; kişisel veri yok).

```bash
KAZUIST_RESTORE_SMOKE_SQL=/opt/kazuist/infra/scripts/db-smoke.sql /opt/kazuist/infra/backup/restore-test.sh 2>&1 | tee /root/geri-yukleme.log
```

Betik şunları yapar ve her biri geçmezse sıfırdan farklı kodla çıkar:

1. Son `postgres` anlık görüntüsünü restic `--verify` ile geçici klasöre indirir, yedek anında yazılan `SHA256SUMS`
   ile karşılaştırır.
2. Çalışan PostgreSQL ile aynı imajdan, ağsız ve 2 GB sınırlı geçici bir konteyner açar; `pg_restore
   --exit-on-error --single-transaction` ile yükler.
3. Denetimler: migration sayısı (canlıyla karşılaştırılır), tablo sayısı, `vector` ve `pg_trgm` uzantıları, defter
   dengesi (dengesiz işlem sayısı 0), ana tabloların satır sayıları (canlıyla yan yana), `db-smoke.sql` (HNSW dizini,
   Türkçe arama yapılandırması, defter tetikleyicileri; işlem geri alınır).
4. Son `raw-store` anlık görüntüsünü `--verify` ile indirir, en çok 50 rastgele dosyanın sha256 özetini canlı klasörle
   karşılaştırır.
5. Süreleri yazar (`fetch_seconds`, `restore_seconds`, `total_seconds`) ve anlık görüntünün yaşını
   (`snapshot_age_seconds`, test anındaki RPO). Konteyneri ve indirilen her dosyayı, hata olsa da siler.

CI aynı betikleri her PR'da gerçek PostgreSQL ve yerel restic deposuyla koşar (`.github/workflows/ci.yml`, docker
işi, "Off-server backup and restore test"): işaret satırı yazılır, yedek alınır, geri yüklenen veritabanında işaretin
varlığı ve olmayan bir değerin testi düşürdüğü doğrulanır. Bu, betiğin kanıtıdır; sunucudaki ilk test yine ayrıca
yapılır ve sonucu yazılır.

Başarısız geri yükleme testi yayın kapısını kapatır.

## Felaket kurtarma (sunucu kaybı)

1. `ilk-kurulum.md` adım 0-5 ile yeni sunucu, Coolify ve ilk Deploy (KAZUIST_IMAGE_TAG son sağlıklı sha). migrate boş
   şemayı kurar. Sonra uygulamalar durdurulur:
   `for s in web worker-node worker-py; do docker stop $(docker ps -q --filter label=kazuist.service=$s); done`.
2. `/etc/kazuist` parola dosyası, SSH anahtarı ve `backup.env` parola yöneticisinden yeniden yazılır (anahtar yoksa
   yeni anahtar üretilir ve Storage Box'a eklenir).
3. Son anlık görüntüyü indir ve boş veritabanının yerine yükle (yeni sunucudaki boş veritabanı silinir; Tarık onayıyla).
   Komutlar ayrı bir `bash` alt kabuğunda çalıştırılır, çünkü `lib.sh` `set -e` açar:

   ```bash
   bash -c '
   . /opt/kazuist/infra/backup/lib.sh
   mkdir -p /var/tmp/kurtarma
   RESTIC_MOUNTS=(-v /var/tmp/kurtarma:/restore)
   restic_run restore latest --tag postgres --host kazuist --target /restore --verify
   (cd /var/tmp/kurtarma/backup/postgres && sha256sum -c SHA256SUMS)
   pg=$(docker ps -q --filter label=kazuist.service=postgres)
   docker exec "$pg" psql -U kazuist -d postgres -v ON_ERROR_STOP=1 \
     -c "DROP DATABASE kazuist WITH (FORCE)" -c "CREATE DATABASE kazuist OWNER kazuist"
   docker exec -i "$pg" pg_restore -U kazuist -d kazuist --no-owner --exit-on-error --single-transaction \
     < /var/tmp/kurtarma/backup/postgres/kazuist.dump
   RESTIC_MOUNTS=(-v /srv/kazuist:/restore)
   restic_run restore latest --tag raw-store --host kazuist --target /restore --verify
   cp -a /srv/kazuist/backup/raw-store/. /srv/kazuist/raw-store/ && chown -R 10001:10001 /srv/kazuist/raw-store
   rm -rf /var/tmp/kurtarma /srv/kazuist/backup
   '
   ```

4. Coolify > Redeploy (migrate yeni migration yoksa iş yapmaz; uygulamalar yeniden başlar), sonra `dagitim.md` doğrulamaları ve dış kabul testleri.
5. Süre ve kayıp aralığı olay kaydına yazılır.

## İzleme

`disk-check.sh` 5 dakikada bir son başarılı yedeğin yaşını (öntanım sınırı 8 saat) ve diski denetler;
`backup.sh` her başarıda ve hatada ayrı ping gönderir. Dış izleme servisi ping gelmeyince de uyarır (`izleme.md`).

## Tarık'tan gerekenler

1. Storage Box siparişi: https://console.hetzner.com > Storage Boxes > Create Storage Box; Location Falkenstein
   (FSN1) ya da Helsinki (HEL1); en küçük boyut (corpus ve döküm büyüdükçe büyütülür); "SSH support" açık; otomatik
   anlık görüntü planı açık. Ödeme Tarık'ındır.
2. Kullanıcı adını (`uXXXXX`) bana iletin (gizli değildir); Storage Box parolasını yalnız `install-ssh-key` adımında
   sunucu terminaline kendiniz girin.
3. `/etc/kazuist/restic-password` içeriğini sunucuda `cat` ile görüp Kulular parola yöneticisine kaydedin; sohbete
   yazmayın.
4. İlk geri yükleme testinin raporunu onaylayın.
