# İstek: notify.send iş yükü ve rol tohumu

1. İsteyen: kimlik, dal `dalga-1/kimlik/better-auth`.
2. Gerekçe: plan 10.8 ve Ek C.3; Node ve Python üreticileri aynı yükü yazmalı. Roller plan 10.1 ve 10.9'da.
3. Önerilen değişiklikler:
   - packages/contracts'a `NotifyPayload` zod şeması: `{ type: teslim_hatirlatmasi | kalemcik | tam_metin_istegi | tam_metin_cevabi | takip | odeme | fesih_teyidi | mevzuat_degisikligi | kampanya, userId: uuid, refId?: string(100), channels?: (email | web_push | apns)[] }`, kapalı nesne. Bugün apps/worker-node/src/notify/types.ts içinde.
   - `notification_prefs` jsonb biçimi belgelensin: kanal başına `{ "<tür>": boolean }`.
   - `push_subscriptions.channel` için enum (`web_push`, `apns`) ve `environment` (`production`, `sandbox`).
   - Rol satırları migration ile tohumlansın: `kullanici`, `ogrenci_dogrulanmis`, `plus`, `akademisyen`, `editor`, `yonetici`. packages/db/src/seed.ts bugün `admin` ve `editor` yazıyor; `admin` plan adıyla `yonetici` olmalı. Geçici: apps/web `ensureRoles` ile eksik rolleri ON CONFLICT DO NOTHING ile ekliyor.
   - İYS kaydı için alan (ör. `consents.context.iys` veya ayrı tablo); şimdilik İYS denetleyicisi arayüz ve varsayılanı ret (ticari ileti gitmez).
   - Meslek listesi: plan 10.1/1 `content/meslekler.yaml` (icerik) ve yönetim tablosu; bugün apps/web/src/server/auth/professions.ts ve i18n hesap.json.
4. Geriye uyumluluk: ekleme.
5. Aciliyet: düşük; geçici çözümler belgelendi.
