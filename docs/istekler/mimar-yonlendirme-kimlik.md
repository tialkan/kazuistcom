# Yönlendirme: kimlik ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: kimlik. Dayanak: ADR-0023, istekler
`kimlik-iki-adim-tablosu.md`, `kimlik-kvkk-basvuru-tablosu.md`, `kimlik-bildirim-is-yuku.md`,
`kimlik-drizzle-tek-kopya.md`, `hukuk-uyum-kvkk-basvuru.md`, `hukuk-uyum-urun-tutarliligi.md` (madde 3, 4, 5, 10).
Sözleşme yolları (`packages/contracts`, `packages/db`) hazırdır; aşağıdakiler kimlik yollarındaki işlerdir.

## İşler

1. Drizzle tek kopya: `apps/web/package.json` artık `drizzle-orm@0.45.4` içerir ve kilit dosyasında tek
   anlık görüntü vardır. `apps/web/src/server/auth/orm.ts` dosyasını silin, içe aktarımları `drizzle-orm`,
   `drizzle-orm/node-postgres` ve `drizzle-orm/pg-core` yapın; `__tests__/harness.ts` içindeki göreli yolları
   `drizzle-orm/pglite` ve `drizzle-orm/pglite/migrator` yapın. Mimar bu değişikliği geçici olarak denedi:
   `pnpm --filter @kazuist/web typecheck` temiz, kimlik testleri 33/33 geçti.
2. Rol tohumu: roller migration 0003 ile gelir. `ensureRoles` kaldırılabilir; kalırsa zararsızdır.
3. İki adım: Better Auth two-factor eklentisini `schema.twoFactors` ve `users.twoFactorEnabled` ile açın;
   oturum oluşturma kancasında `sessions.authMethod` değerini `authMethods` listesinden yazın. Yönetici ikinci
   adımı `verifications` geçici çözümünden TOTP'ye taşıyın.
4. KVKK başvuruları: `audit_log` geçici kaydını `kvkk_requests` tablosuna taşıyın.
   - `POST /v1/kvkk-requests`: 201 ve `KvkkRequestReceipt` (`id`, `status`, `receivedAt`, `dueAt`).
   - `POST /v1/kvkk-requests/guest` (oturumsuz, IP başına hız sınırı, 202) ve `/guest/verify` (6 haneli kod;
     `verifications` içinde `kz:kvkk-guest:<id>` kimliği önerilir). Uyruk TR ise kimlik numarasının kontrol
     basamağı sunucuda denetlenir (`packages/ai-gateway` T.C. kimlik denetimi yeniden kullanılabilir).
   - Kimlik numarası `PII_ENCRYPTION_KEY` ile şifrelenip `identity_enc` sütununa yazılır; loglanmaz.
   - `requester_hash`: hesap varsa kullanıcı kimliğinin, yoksa iletişim e-postasının HMAC'i (consents ile aynı
     yöntem). `due_at` varsayılanı 30 gündür; `received_at` elle verilirse `kvkkDueAt` kullanın.
   - Yönetim kuyruğu adı `kvkk-requests`.
5. Hesap silme: `DELETE /v1/me` bir `account.purge` işi yazsın (`AccountPurgePayload`, `run_after` = silme
   anı + bekleme süresi; önerilen 14 gün, üst sınır 30 gün, kesin değer Tarık kararı) ve `jobId` olarak bu işin
   kimliğini dönsün. İşleyici `apps/worker-node/src/account/**` (yeni yol, kimliğe verildi); kayıt
   `apps/worker-node/src/handlers.ts` içinde orkestra tarafından yapılır.
6. `POST /v1/me/edu-verification` artık 204 döner (v1.1). Yönetici ikinci adım başlatma ucu da sahte
   `jobId` yerine 204 dönebilir (Better Auth yolu, sözleşme dışı).
7. Veri indirme: sözleşme uygulamanın davranışına çekildi (`?format=json|csv`, 200, `MeExport`); 429 eklendi.
8. Bildirim: `NotifyPayload`, `notificationTypes`, `notificationChannels` ve `NotificationPrefsColumn`
   `@kazuist/contracts` içinde. `apps/worker-node/src/notify/types.ts` yerel şemalarını bunlarla değiştirin.
   `push_subscriptions` için web_push satırında `environment` NULL, apns satırında production veya sandbox
   olmalıdır (CHECK).
9. OAuth belirteçleri (hukuk-uyum madde 4): Better Auth `account.encryptOAuthTokens: true` seçeneği
   (better-auth 1.7.11, `@better-auth/core` `init-options.d.mts`, varsayılan false) açılsın ya da giriş dışında
   gerekmiyorsa belirteçler saklanmasın; karar PR'da gerekçelendirilsin.
10. Bildirim içeriği (hukuk-uyum madde 5): APNs ve Web Push metinlerinde kişisel veri, karar özeti veya taslak
    içeriği olmadığını sınayan test (`render()` yalnız i18n sabitleri).
11. Yaş sınırı (hukuk-uyum madde 10): Tarık kararı beklenir; karar gelirse kayıtta yaş beyanı.
12. Hız sınırı: `ValkeyRateLimitStore` için `apps/web/src/server/deps.ts` `sharedValkey(VALKEY_URL)` kullanılsın
    (iovalkey `eval` sunar); ikinci bir Redis istemcisi eklenmez. Oturum bağlamı da `sharedPool` kullanabilir.
13. `consents.context` artık `ConsentContext` tipindedir (`channel`, `userAgent` mevcut yazımla uyumlu).

## Ertelenen

İYS alanı ve meslekler tablosu ayrı istekle (ADR-0023, Ertelenen).

## Aciliyet

1, 4, 5: yayın kapısından önce. 3: yönetim paneli açılmadan önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ı: #14 (TOTP, auth_method, kvkk_requests ve misafir akışı, account.purge, sözleşme bildirim türleri). Madde bazında doğrulama kalite-guvenlik kapısındadır.
