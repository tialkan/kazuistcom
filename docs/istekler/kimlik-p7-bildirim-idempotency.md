# İstek: bildirim tesliminde kanal bazında idempotency

1. İsteyen: kimlik, dal `codex/p7-hesap-arayuzu` (review.md P7 madde 5). Kime: mimar.
2. Gerekçe: `notify.send` işi e-posta, Web Push ve APNs'i sırayla gönderir. İş yeniden denendiğinde
   (`failJobSql` aynı yükle tekrar kuyruğa alır) hangi kanalın ve hangi aboneliğin önceki denemede teslim edildiği
   bilinmez; bu yüzden önceki sürümde e-posta gittikten sonra bir push hatası e-postayı yineliyordu. Mevcut
   tablolarda teslim kaydı yok: `jobs.result` yalnız iş bitince yazılır, `order_legal_document_deliveries` yalnız
   sözleşme PDF'i içindir, `push_subscriptions` teslim durumu tutmaz.
3. Bu PR'daki kısmi düzeltme (şema değişmeden, `apps/worker-node/src/notify/dispatch.ts`):
   - Push hatası yakalanır, yalnız hata sınıfı loglanır, sıradaki aboneliğe geçilir.
   - En az bir kanal teslim edildiyse iş başarılı biter (`reason: 'push_partial'`); e-posta ve önceki push yinelenmez.
   - Hiçbir kanal teslim edilmediyse iş hata verir ve yeniden denenir; yinelenecek teslim olmadığı için güvenlidir.
   - Bedeli: e-posta gittikten sonra geçici olarak düşen bir push aboneliği o bildirimi almaz (en fazla bir kayıp,
     hiçbir zaman çift gönderim yok).
4. Önerilen değişiklik (tam çözüm):
   - Yeni tablo `notification_deliveries (job_id uuid not null, channel text not null, target_hash text not null,
     delivered_at timestamptz not null default now(), primary key (job_id, channel, target_hash))`. `target_hash`
     e-posta için `'email'`, push için uç noktanın veya cihaz jetonunun anahtarlı özeti (ham değer yazılmaz).
   - `dispatch` her teslimden önce satırı arar, teslimden sonra `insert ... on conflict do nothing` yazar; böylece
     push hatasında iş güvenle yeniden denenir ve yalnız eksik kanallar gönderilir.
   - Saklama: `jobs` temizliğiyle birlikte (P1 madde 4, biten işleri silen kod) 30 gün sonra silinir.
   - Sözleşme: `jobPayloadSchemas['notify.send']` değişmez; işleyici iş kimliğini `ClaimedJob.id`'den alır.
5. Geriye uyumluluk: yalnız ekleme; yıkıcı migration değil.
6. Aciliyet: orta. Geçici çözüm bu PR'da çalışıyor ve testli
   (`apps/worker-node/src/notify/__tests__/delivery.test.ts`).

## Sonuç (mimar, 12 Kasım 2026, sözleşme v1.5, ADR-0035)

Değiştirerek kabul. Migration `0007_v1_5_jobs_citations_deliveries.sql`:

- `notification_deliveries (job_id, channel, target_hash, delivered_at)`, birincil anahtar
  `(job_id, channel, target_hash)`. `channel` CHECK ile `email`, `web_push`, `apns`. `target_hash` e-postada
  `'email'`, push kanallarında HMAC-SHA256 küçük harf onaltılık (64 karakter); CHECK ham uç noktayı ve jetonu reddeder.
- Değişiklik: `job_id` `jobs(id)`'ye `ON DELETE CASCADE` ile bağlı. Ayrı 30 günlük saklama yok; kayıt işiyle birlikte
  silinir (`pruneJobsSql`: `done` 14 gün, `failed` ve `dead` 90 gün). Kayıt yalnız aynı işin yeniden denemesinde
  anlamlıdır; sessiz saat ertelemesi yeni iş açtığı için ertelenen iş kendi kaydını tutar.
- SQL `@kazuist/db/jobs`: `deliveredTargetsSql` (`$1` iş kimliği; `channel, target_hash` döner) ve
  `recordDeliverySql` (`$1` iş, `$2` kanal, `$3` özet; `ON CONFLICT DO NOTHING`). İş kimliği `ClaimedJob.id`'dir.
- `jobPayloadSchemas['notify.send']` değişmedi.
- Uygulama kimlikte (`apps/worker-node/src/notify/dispatch.ts`): her teslimden önce `deliveredTargetsSql`
  sonucuna bakılır, teslimden hemen sonra `recordDeliverySql` yazılır; HMAC anahtarı yeni ortam değişkeni
  istemeden mevcut bir sırdan türetilebilir (öneri: `BETTER_AUTH_SECRET`'tan HKDF, bilgi etiketi
  `notification-target`). Yönlendirme: `docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md`.
