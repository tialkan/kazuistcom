# Sözleşme değişiklik istekleri

`packages/contracts` ve `packages/db` yalnız mimar ajanı tarafından ve ADR ile değişir (plan 17.3/4).
Başka bir ajan bu yollarda değişiklik gerektiğinde dosyayı kendisi değiştirmez; bu klasöre bir istek yazar.

## Dosya adı

`docs/istekler/<ajan>-<konu>.md`, örnek: `odeme-kupon-alanlari.md`.

## İçerik

1. İsteyen ajan ve dal adı.
2. Gerekçe: hangi plan maddesi veya FR bunu gerektiriyor.
3. Önerilen değişiklik: uç, şema, tablo veya sütun; mümkünse OpenAPI veya Drizzle parçası.
4. Geriye uyumluluk: mevcut istemciler ve veriler nasıl etkilenir; migration yıkıcı mı.
5. Aciliyet: bu değişiklik olmadan ilerleyebilir mi.

## Süreç

1. Orkestra istekleri günde bir kez toplu olarak mimar ajanına işletir.
2. Mimar isteği değerlendirir; kabul ederse ADR yazar, sözleşme sürümünü artırır (OpenAPI `info.version`, yeni migration), istek dosyasının sonuna "Sonuç" bölümü ekler.
3. Yıkıcı migration Tarık'ın açık onayını gerektirir.
4. Reddedilen istek gerekçesiyle kapatılır.

## Yönlendirme dosyaları

Mimar, bir isteğin sözleşme dışında kalan ve başka bir ajanın yolundaki işlerini `mimar-yonlendirme-<ajan>.md`
dosyalarıyla sahibine yönlendirir. Bu dosyalar sözleşmeyi değiştirmez; orkestra ilgili ajana iş olarak verir.

## Karar tablosu: Dalga 1 (2026-10-20, sözleşme v1.1, ADR-0023)

Kararlar Tarık onayı bekleyen ADR'lere dayanır (ADR-0021, ADR-0022, ADR-0023: "Önerildi, Tarık onayı
bekliyor"). Ayrıntı her istek dosyasının sonundaki "Sonuç" bölümündedir.

| İstek | Karar | Gerekçe ve uygulama |
|---|---|---|
| altyapi-health-pingleri | Kabul | `/api/health` gerçek pg (`SELECT 1`) ve Valkey (`PING`, iovalkey 0.4.0, MIT) istemcilerine bağlandı; kayıt `src/instrumentation.ts`. Tek Valkey istemcisi `server/deps.ts`'dedir; kimliğin hız sınırlayıcısı ikinci istemci eklemeden bunu kullanır (yönlendirildi). Sağlık dosyaları altyapıya verildi. |
| altyapi-s3-yerel | Kabul | ADR-0021: yerel ve CI'da SeaweedFS (Apache-2.0); `.env.example` düzeltildi. Kova betiği altyapıda. |
| altyapi-worker-giris-noktalari | Kabul | worker-py `core/main.py` (LISTEN, yoklama, SIGTERM, 8000'de `/healthz`); worker-node `pnpm build` ile `dist/main.js`; `@kazuist/db/migrate` `runMigrations`. `uv.lock` depoda (orkestra ekledi). |
| anonimlestirme-etiketleme-adr | Değiştirerek kabul | ADR-0022 (Önerildi): Dalga 2'de Türkiye sunucusunda yerel Label Studio CE. Ek not: `superseded` izinli sistem kararı; maskeli metin `records.masked_text` sütununda (fail closed). |
| hukuk-uyum-consent-turleri | Kabul | `consent_kind`'e abonelik_sozlesmesi, yillik_taahhutname, yz_ucretsiz_katman; `ConsentContext` biçimi. |
| hukuk-uyum-kaldirma-talebi | Değiştirerek kabul | kind, target_type (record, kampus_post, kampus_file), target_id, 72 saat `hide_due_at`, yalnız kişisel veride 30 gün `due_at`, karar alanları; `hidden_at` records, kampus.posts ve kampus.files'ta. `recordId` gövdeden çıktı (v1 istemcisi yok), sütun dış anahtar olarak kaldı. |
| hukuk-uyum-kvkk-basvuru | Değiştirerek kabul | m.11'in dokuz bendi (`itiraz` m.11/1-g olarak korundu); `kvkk_requests` tablosu; oturumsuz başvuru ayrı uçta (`/v1/kvkk-requests/guest` ve `/verify`), Tebliğ m.5 alanları birincil kaynaktan doğrulandı. |
| hukuk-uyum-urun-tutarliligi | Yönlendirildi | Maddeler sahiplerine: kimlik (3, 4, 5, 10), odeme (2), on-yuz (8), altyapi (6, 9), hukuk-uyum (6), casuist ve ios (7), orkestra ve Tarık (1, 2, 10). Sözleşme payı: `account.purge` (3). |
| hukuk-uyum-yayin-kapisi | Kabul | Sözleşmede `LegalFrontMatter` ve kapı işlevleri; CI testi `content/hukuki`'yi tarar. Render ve derleme kapısı on-yuz'a yönlendirildi. |
| kimlik-bildirim-is-yuku | Değiştirerek kabul | `NotifyPayload`, bildirim türleri ve kanalları, `NotificationPrefsColumn` sözleşmede; push_subscriptions kanal ve ortam CHECK'i; roller migration ile. İYS alanı ve meslekler tablosu ertelendi. |
| kimlik-drizzle-tek-kopya | Kabul | Kök `pnpm-workspace.yaml` overrides ve `dedupePeerDependents`; apps/web `drizzle-orm` alır; tek anlık görüntü testi. `orm.ts` kaldırılabilir (doğrulandı), kaldırma kimlikte. |
| kimlik-iki-adim-tablosu | Kabul | `two_factors` (better-auth 1.7.11 alanlarıyla, verified ve kilit alanları dahil), `users.two_factor_enabled`, `sessions.auth_method`. |
| kimlik-kvkk-basvuru-tablosu | Değiştirerek kabul | Tablo hukuk-uyum isteğiyle birleşti. `account.purge` kabul; `account.export` ret (dışa aktarım eşzamanlı 200, sözleşme uygulamaya çekildi); edu doğrulaması 204. |
| odeme-abonelik-ve-siparis-alanlari | Değiştirerek kabul | Tüm sütun ve tablolar eklendi; iade tekilliği `(provider, refund_ref)` ile (istenen `created_at`'li dizin idempotency'yi kaldırırdı). Billing işleyicileri worker-node'da kayıtlı, PgBillingStore gelene kadar kapalı başarısız. |
| on-yuz-yonlendirme | Uygulandı, kapatıldı | Orkestra `next.config.ts`'e `statusCode: 301` yönlendirmesini ekledi; sözleşme değişikliği gerekmedi. |
