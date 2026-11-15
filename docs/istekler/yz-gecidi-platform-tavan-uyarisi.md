# İstek: platform harcama tavanı aşıldığında personele bildirim (yz-gecidi)

1. İsteyen: yz-gecidi, dal `yz-gecidi/platform-yz-yapilandirma`.

2. Gerekçe: plan 8.7/2 "genel günlük platform harcama tavanı (TL); aşılırsa ücretsiz hak ve kredili platform çağrısı
   durur, BYOK sürer, yöneticiye uyarı". Tavan ve durdurma çalışıyor; uyarı bugün yalnız log satırı:
   `apps/web/src/app/ara/_sunucu/gecit.ts` `platformCapAlert` `@kazuist/log` `logEvent` ile stderr'e tek JSON satırı yazar
   (`{"at":"gecit","level":"error","event":"platform_tavan","trigger":"crossed"|"refused","day":"YYYY-MM-DD",
   "spendTl":..,"capTl":..}`). `trigger: "crossed"` günde bir kez ve bütün örnekler arasında tek çağrıda çıkar
   (Valkey `INCRBYFLOAT` sonucu tavanı ilk geçen çağrı); `refused` her süreçte günde bir kez. Personele e-posta veya
   push gitmesi için bir kuyruk işi gerekiyor ve bugünkü sözleşme buna izin vermiyor:
   - `NotifyPayload.type` (`packages/contracts/src/jobs.ts`) kullanıcı bildirim türleriyle sınırlı
     (`teslim_hatirlatmasi` ... `kampanya`); işletme uyarısı türü yok.
   - `NotifyPayload.userId` tek kullanıcıya gider ve tercihler (`notification_prefs`) kullanıcı başınadır; "personel"
     alıcı kümesi (rol) sözleşmede tanımlı değil.

3. Önerilen değişiklik (mimarın seçimine bırakılır, ikisinden biri):
   - A. Yeni iş türü `ops.alert`, yükü `z.strictObject({ kind: z.enum(['platform_tavan']), day: z.iso.date(),
     spendKurus: z.int().nonnegative(), capKurus: z.int().positive() })`, tekilleştirme anahtarı `ops:<kind>:<day>`.
     Tüketici (kimlik `apps/worker-node/src/notify/**`) alıcıları rol tablosundan (yönetici) okur, metni i18n'den
     kurar; içerik, kullanıcı ve IP yoktur.
   - B. `NotificationType`'a `yonetici_uyarisi` eklenir ve üretici her yönetici için ayrı `notify.send` koyar
     (`refId: platform_tavan:<day>`). Tercih sütunları için varsayılan açık olmalı.
   Üretici tarafı hazır: `buildSummaryDeps({ onPlatformCap })` ikinci bir alıcı alır; kayıt tek satırdır
   (`trigger === 'crossed'` olduğunda kuyruğa koy).

4. Geriye uyumluluk: yeni iş türü veya enum değeri eklenir; mevcut yükler ve tüketiciler etkilenmez, migration
   yıkıcı değildir (A için `job_type` enum'una değer eklenir).

5. Aciliyet: düşük-orta. Tavan ve durdurma bildirim olmadan da çalışır; log satırı izleme servisine bağlanırsa
   (`docs/runbook/izleme.md`, altyapi) uyarı bu istek beklenmeden alınabilir.
