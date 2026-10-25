# ADR-0023: Sözleşme v1.1: Dalga 1 istekleri

- Tarih: 2026-10-20
- Karar kodu: yok (plan 17.3/4; istekler: docs/istekler/, karar tablosu docs/istekler/README.md)
- Durum: Kabul edildi (2026-10-25, kullanıcı onayı)

## Bağlam

Dalga 1 ajanları 15 istek yazdı. Kabul edilenler sözleşmeyi (OpenAPI, zod, veri tabanı şeması, iş kuyruğu)
değiştirir. Sözleşme v1 (contracts-v1 etiketi) hiçbir ortamda yayımlanmadı ve onu kullanan bir istemci yok
(iOS Dalga 2'de başlar); bu yüzden v1.1 iki istemci açısından uyumsuz değişikliği (aşağıda "Uyumsuz") içerir.
v1.1 etiketinden sonra katı anlamsal sürümleme uygulanır.

## Karar

### Sürüm

`packages/contracts` 1.1.0: `openapi.yaml info.version`, `package.json version` ve `CONTRACT_VERSION` testle
eşit tutulur. `packages/db` 1.1.0, yeni migration `0003_wave1_requests.sql`. Mevcut migration'lar
değişmedi; 0003 yalnız ekler (sütun, tablo, enum değeri, dizin, CHECK, rol satırı). Hiçbir sütun ve satır
silinmez. 0003, v1 verisi olan bir veri tabanında da sınanır (packages/db/test/migration-0003.test.ts).

### Kimlik

- İki adım: Better Auth two-factor eklentisi için `users.two_factor_enabled` ve `two_factors` (alanlar
  better-auth 1.7.11 `dist/plugins/two-factor/schema.mjs` dosyasından: secret, backup_codes, verified,
  failed_verification_count, locked_until). Gizli anahtar ve yedek kodlar Better Auth tarafından şifreli
  yazılır. Kullanıcı başına tek satır.
- `sessions.auth_method`: oturumun nasıl açıldığı (`authMethods`: passkey, password, email_otp, google,
  apple); yönetim paneli passkey ister (plan 5.6/2).
- Roller migration ile tohumlanır: kullanici, ogrenci_dogrulanmis, plus, akademisyen, editor, yonetici
  (`ON CONFLICT DO NOTHING`). Örnek veri betiği artık rol yazmaz; `admin` adı kullanılmaz.
- Drizzle tek kopya: kök `pnpm-workspace.yaml` `overrides: drizzle-orm: 0.45.4` ve
  `dedupePeerDependents: true`; apps/web `drizzle-orm` bağımlılığını doğrudan alır. Kilit dosyasında tek
  drizzle-orm anlık görüntüsü olduğu testle korunur. `apps/web/src/server/auth/orm.ts` kaldırılabilir
  (doğrudan `drizzle-orm` içe aktarımıyla tip denetimi ve kimlik testleri geçti); kaldırma kimlik ajanının
  işidir.

### KVKK başvuruları (KVKK m.11, m.13; Tebliğ m.5)

- `kvkkRequestKinds` m.11/1'in dokuz bendini sırasıyla karşılar: islenip_islenmedigi (a), bilgi (b),
  amac (c), aktarim_bilgisi (ç), duzeltme (d), silme (e), ucuncu_kisilere_bildirim (f), itiraz (g),
  zarar_giderimi (ğ). `itiraz` v1'den korunur ve m.11/1-g anlamındadır. Madde metni
  mevzuat.gov.tr'deki 6698 sayılı Kanun PDF'inden doğrulandı (2026-10-20).
- Tablo `kvkk_requests`: başvuran (hesap varsa user_id, yoksa ad, uyruk, şifreli kimlik numarası, adres),
  iletişim, ilişki, tür, açıklama, cevap kanalı (eposta, posta; m.13/3), durum, `received_at`, `due_at`
  (`received_at` + 30 gün; m.13/2), karar alanları. Hesap silinince user_id NULL olur, `requester_hash` kalır.
- Oturumsuz başvuru: `POST /v1/kvkk-requests/guest` (security yok, IP hız sınırı, 202) ve
  `POST /v1/kvkk-requests/guest/verify` (e-postaya giden 6 haneli kod). Zorunlu alanlar Veri Sorumlusuna
  Başvuru Usul ve Esasları Hakkında Tebliğ m.5'ten (RG 10.03.2018, 30356; resmigazete.gov.tr özgün metni,
  2026-10-20): ad soyad, T.C. kimlik numarası veya yabancılar için uyruk ve pasaport ya da kimlik numarası,
  tebligata esas adres, varsa e-posta ve telefon, talep konusu. Başvuru tarihi Tebliğ'e göre başvurunun
  ulaştığı tarihtir; bu yüzden süre e-posta doğrulamasından değil gönderimden başlar. Tebliğ'in sonraki
  değişikliklerinin kontrolü hukuk-uyum ajanındadır.
- Kimlik numarası uygulama düzeyinde şifrelenir (`PII_ENCRYPTION_KEY`), açık metin saklanmaz.
- Yönetim kuyruğu `kvkk-requests` eklendi.

### Hesap silme ve veri indirme

- İş türü `account.purge` (payload `{ userId }`). `DELETE /v1/me` 202 `JobRef` döndürür; `jobId` bu işin
  kimliğidir. İş, silme anından bekleme süresi sonra çalışır. Önerilen bekleme 14 gün (yanlışlıkla silmeye
  karşı geri alma penceresi), üst sınır 30 gün (m.13/2); kesin değer Tarık kararıdır. Rıza ve denetim kaydı
  yalnız özetle kalır (ON DELETE SET NULL); mali kayıtların saklanması hukuk-uyum'un imha politikasına göre.
- `GET /v1/me/export` (Uyumsuz): v1'deki 202 `JobRef` yerine uygulamanın davranışı sözleşme oldu:
  `?format=json|csv`, 200, ek olarak indirilen dosya (`MeExport` veya CSV). Kullanıcı başına veri küçük;
  eşzamanlı indirme yeterli. `account.export` iş türü reddedildi; ölçüm gerektirirse ayrı istekle eklenir.
- `POST /v1/me/edu-verification` (Uyumsuz): v1'deki sahte `jobId` yerine 204. Gönderim eşzamanlıdır,
  sorgulanacak iş yoktur.

### Rıza

`consent_kind` değerlerine abonelik_sozlesmesi, yillik_taahhutname, yz_ucretsiz_katman eklendi. `consents.context`
biçimi `ConsentContext` (sunucu yazar; productCode, orderId, subscriptionId, provider, channel, userAgent).
Metin sürümü `consents.version` sütunudur ve hukuki metnin ön bilgisindeki `version` alanıdır. İYS kaydı
alanı ertelendi: İYS entegrasyonu seçilince ayrı istekle; o zamana kadar ticari ileti gitmez (kimlik
denetleyicisinin varsayılanı ret).

### Kaldırma talepleri (FR-79, FR-108)

- `takedown_requests`: kind (kisisel_veri, telif, guncellik), target_type (record, kampus_post,
  kampus_file), target_id, requester_name, rights_info, hide_due_at (alındıktan 72 saat sonra), due_at
  (yalnız kisisel_veri için 30 gün), hidden_at, decision (kalici_kaldirma, ek_maskeleme, ret),
  decision_reason, updated_at. v1 satırlarında target_id record_id'den doldurulur; record_id kayıt hedefleri
  için dış anahtar olarak kalır (CHECK ile target_id'ye eşit).
- `records.hidden_at`, `kampus.posts.hidden_at`, `kampus.files.hidden_at`: geçici gizleme; arama, sayfa,
  akış ve site haritası bu satırları göstermez.
- `POST /v1/takedown-requests` gövdesi (Uyumsuz): `recordId` yerine `kind`, `targetType`, `targetId`.
- Süre hesapları `takedownDeadlines` ve `kvkkDueAt` ile sözleşmede tek yerdedir.

### Anonimleştirme

- `records.masked_text`: sunulabilir metin. anon.run geçerli politikanın maskelerini uygulayıp aynı işlemde
  yazar; anonimleştirme gerektirmeyen kayıtlarda (norm) metnin kopyasıdır. API, parçalama (embed.chunks) ve
  dışa aktarım yalnız bu sütunu okur; masked_text NULL olan kayıt sunulmaz ve dizinlenmez (fail closed).
  Ham `records.text` dışarı çıkmaz.
- `review_queue.decision` izinli değerler: onay, ret, duzelt (editör) ve superseded (yalnız sistem; anon.run
  yeniden işlediğinde açık satırları kapatır). CHECK ile korunur.
- Etiketleme yöntemi ayrı karardır: ADR-0022.

### Ödeme

- `orders`: checkout_token (tekil), provider_payment_id, paid_at.
- `subscriptions`: price_kurus, last_payment_id, first_failure_at, failed_retries, failed_order_ref,
  pending_price_kurus, pending_price_effective_at.
- `payments`: kind (odeme, iade), subscription_id, refund_ref; order_id NULL olabilir (yenileme
  tahsilatı), ama sipariş ya da abonelikten biri zorunlu. Tekillik: tahsilat için (provider,
  provider_payment_id) yalnız kind = odeme; iade için (provider, refund_ref). Eski tam dizin, yerine geçen
  kısmi dizin kurulduktan sonra düşürülür; mevcut satırlar için güvence aynıdır. İstekteki
  `(provider, provider_payment_id, kind, created_at)` önerisi iadelerde idempotency'yi kaldırdığı için
  seçilmedi.
- Yeni tablolar: `coupon_redemptions` (kullanıcı ve kupon başına tek), `notices` (bildirim zamanlaması,
  (user_id, kind, ref) tekil). `ledger_transactions.wallet_id` (cüzdan hareket listesi).

### İş kuyruğu ve bildirim

- `jobPayloadSchemas`: notify.send (`NotifyPayload`), account.purge, anon.run, billing.reconcile,
  billing.monthly_grant. Node ve Python üreticileri bu şemaları kullanır.
- `notificationTypes`, `notificationChannels`, `NotificationPrefsColumn` (`{ "<tür>": boolean }`)
  sözleşmede. `/v1/notifications/preferences` yalnız bilinen türleri kabul eder.
- `push_subscriptions`: kanal web_push ya da apns; environment yalnız apns için ve production ya da sandbox
  (CHECK).
- worker-node ve worker-py giriş noktaları: LISTEN jobs_<tür> ile uyanma, yoklama yedeği, kilidi bayatlamış
  işi kuyruğa geri koyma, SIGTERM ile elindeki işi bitirip durma. worker-py `python -m core.main` 8000'de
  `/healthz` sunar. worker-node `pnpm build` ile `dist/main.js` üretir.

### Sağlık ucu

`/api/health` gerçek istemcilere bağlandı: `SELECT 1` (paylaşılan pg.Pool, en çok 10) ve Valkey `PING`
(iovalkey 0.4.0, MIT). Kayıt `src/instrumentation.ts` `register()` içinde, yalnız Node.js çalışma
ortamında; istemciler ilk yoklamada bağlanır.

### Hukuki metin yayın kapısı

`LegalFrontMatter`, `legalPublishBlockers`, `legalRenderMode`, `legalBuildProblems` sözleşmede. Kural:
`status: yayinda` olmayan ya da gövdesinde `{{...}}` veya `[DOĞRULANACAK` bulunan metin üretimde
gösterilmez (404); staging'de noindex ve taslak bandıyla gösterilir. `yayinda` işaretli metinde açık
işaret kalırsa CI testi (packages/contracts/test/legal.test.ts) ve üretim derlemesi düşer. Uygulama on-yuz,
uçtan uca test kalite-guvenlik işidir.

### Kayıt yetki alanı (records.jurisdiction)

ISO 3166-1 alfa-2 ülke kodu (TR, DE, ...); AB hukuku için EU (ISO'da istisnai olarak ayrılmış); ülkesi
belirsiz ya da uluslararası metin için ZZ (ISO kullanıcı atamalı kod). Veri toplama ajanının kullandığı
"INT" ZZ'ye çevrilir.

### Ertelenen ve reddedilen

- `account.export`: reddedildi (eşzamanlı indirme).
- İYS alanı, meslekler tablosu (`/v1/admin/professions` için), `gold_annotations`, saklama süreleri için
  periyodik imha işi (`retention.sweep`): ertelendi. İmha işi, hukuk-uyum'un imha politikası süreleri
  onaylandıktan sonra eklenir; süreler tahmin edilmez.

## Sonuçlar

- Sahip ajanların işleri `docs/istekler/mimar-yonlendirme-<ajan>.md` dosyalarındadır.
- `docs/sahiplik.md`: sağlık bağlantısı dosyaları altyapıya, `apps/worker-node/src/account/**` ve
  kimliğin `/api/v1` yolları kimliğe, ödeme `/api/v1` yolları ödemeye açıkça verildi.

## Durum

Kabul edildi (2026-10-25, kullanıcı onayı).
