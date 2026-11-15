# İstek: editör ret biçimi `rejected = true` oldu; atıf çıkarıcısı ve atıf ağı okuması buna geçmeli

- İsteyen: kimlik. Dal: `kimlik/v1-5-atif-bildirim-iade`. Tarih: 14 Kasım 2026.
- Kime: atif-agi (`docs/istekler/mimar-yonlendirme-3-sozlesme-v1-5.md` atif-agi madde 1 ve 3 ile aynı iş; bu
  dosya kimlik tarafının artık yazdığını bildirir). Sözleşme ve şema değişmiyor.

## Kimlik bu dalda ne yazıyor

`POST /api/v1/admin/queues/citations/{itemId}/decision` (yeni uç yok, mevcut sözleşme yolu) ve
`/hesap/yonetim/atif-kuyrugu` editör ekranı, `review_queue` satırının `subject_id`'sindeki kenara:

- `onay`: `confirmed = true, rejected = false`
- `ret`: `rejected = true, confirmed = false`; `confidence` çıkarıcının değerinde kalır. Eski biçim
  (`confirmed = true, confidence = 0`) artık yazılmıyor.
- `payload.kind = 'karar'` ise `citation_edges`, `'doktrin'` ise `work_citations`. Kenar yalnız
  `from_record_id = payload.recordId` ise güncellenir. Kuyruk satırının kapanması ve kenar yazımı tek işlemdedir;
  aynı satıra ikinci karar 404 alır. `duzelt` bu kuyrukta 400'dür (kenar için tanımlı bir düzeltme yok).
- Kod: `apps/web/src/server/auth/citation-queue.ts`, `admin.ts` `decideCitation`; test
  `apps/web/src/server/auth/__tests__/atif-kuyrugu.test.ts`.

## atif-agi'den istenen (bu birleşmeden sonra açık kalan risk)

1. `services/worker-py/citations/store.py` bugün yalnız `confirmed = false` ile koruyor:
   - `UPSERT_EDGE_SQL` ve `UPSERT_WORK_CITATION_SQL` `WHERE ... confirmed = false` reddedilmiş satırı da günceller
     (güven yeniden yükselebilir); koşul `confirmed = false AND NOT rejected` olmalı.
   - `PRUNE_EDGES_SQL` ve `PRUNE_WORK_CITATIONS_SQL` reddedilmiş satırı siler; sonraki çıkarımda aday aynı kenarla
     yeniden kuyruğa girer. Koşul `confirmed = false AND NOT rejected` olmalı.
   - Upsert satır döndürmezse (`RETURNING` boş) kuyruk satırı yazılmamalı; bugün `subject_id` boş bir satır
     yazılıyor. Kimlik böyle bir satırı kapatır ve denetim kaydına `applied: false` yazar, kenara dokunmaz.
2. `apps/web/src/app/atif-agi/_sunucu/sql.ts` `KENAR_GORUNUR` ve doktrin sorgusu `NOT rejected` koşulunu almalı.
   Bugün kuyruktaki adayların güveni yayın eşiğinin altında olduğu için reddedilen kenar çizilmez; madde 1 kapanmadan
   yeniden çıkarım güveni eşiğe taşırsa çizilir.
3. Başlıktaki "until a rejected column exists" notu ve `sql.ts` 16-17. satırlardaki eski ret açıklaması kalkar.

casuist tarafı (`packages/casuist/src/sql.ts` `COUNTED_EDGE`) zaten `NOT e.rejected` ile sayıyor (#87).

## Aciliyet

Madde 1 yayından önce: editör reddi kalıcı olmazsa aynı aday her çıkarımda kuyruğa döner.
