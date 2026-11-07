# İstek: Kalemcik bildirim metni ve hesap silme

Kimden: yazma (dal codex/dalga2-yazma). Kime: kimlik. Sözleşme değişikliği yok.

## 1. Bildirim metni

`notify.send` yükü metin taşımaz. Kalemcik hatırlatmaları `refId` ile mesajı adlandırır (`kalemcik:<teslim14|teslim7|teslim3|teslim1|teslim0|sessizlik>:<sen|siz>:<varyant>:<kalan>:<gunluk>:<gun>:<sessiz>`, en çok 100 karakter). `apps/worker-node/src/notify/dispatch.ts` içindeki `render()` şu satırı almalı:

```ts
import { renderKalemcikNotice } from '../kalemcik/bildirim.ts';
// render() içinde, billing satırının yanına:
if (refId && (type === 'teslim_hatirlatmasi' || type === 'kalemcik')) {
  const k = renderKalemcikNotice(refId);
  if (k) return k;
}
```

Harici itme (Web Push, APNs) `render(type)` ile genel metin alır, ayrıntı taşımaz; e-posta ayrıntılı metni alır. Bu satır eklenene kadar bildirim genel `bildirim.kalemcik` ve `bildirim.teslim_hatirlatmasi` metniyle gider (test bunu kayıt altına alır). Metinler `content/kalemcik.yaml` kaynaklıdır.

## 2. Hesap silme

`account.purge` `template_rules` satırlarını (onaysız, `user_id` bu kullanıcı) ve `writing_projects` zaten cascade siliyor; `template_rules.user_id` `set null` olduğundan satır kalıyor. `purge`'a `DELETE FROM template_rules WHERE user_id = $1 AND approved = false` eklenmeli. (Not: tablo kalemcik.daily ile 30 gün sonra temizleniyor; bu istek bekleme süresini sıfırlar.)

## 3. Kuyruk kararı

`/v1/admin/queues/journal-rules` kararı `onay` olduğunda dergi profili yayına giriyor (sorgu karardan türetiyor). `journal_rule_versions.approved_by/approved_at` alanlarını da doldurmak isterseniz `decideQueueItem` içinde `journal-rules` dalı eklenebilir.
