# İstek: atıf ağı için şema eklemeleri (doktrin düğümleri ve editör kararı)

1. İsteyen: atif-agi ajanı, dal `codex/dalga2-atif-agi`.
2. Gerekçe: plan 6.5/3, 10.3, SRS FR-26..31 ve 9.4. `citation_edges` yalnız karar-karar kenarını taşır (`to_record_id`
   bir `records` satırıdır). Doktrin atfının hedefi bir eserdir; kitap ve makalelerin çoğu `records` satırı değildir.
3. Aciliyet: karar-karar kenarları bugünkü şemayla çalışır. Doktrin kenarları bu istek karşılanana kadar kapalıdır
   (`SqlCitationStore(doctrine=False)`, arayüzde "Doktrin atıfları henüz yüklenmedi" notu). Staging açılmadan önce gerekir.

## 1. Eklemeler (mimar, ADR ile, yalnız ekleme)

| Değişiklik | Biçim | Neden |
|---|---|---|
| `works.work_key` | `text`, benzersiz, null olabilir | Eser tekilleştirme anahtarı (ilk yazar soyadı ve başlık sözcükleri, baskı ve yıldan bağımsız). `services/worker-py/citations/works.py work_key()` |
| `work_citations` tablosu | `id uuid pk`, `from_record_id uuid not null references records(id) on delete cascade`, `work_id uuid not null references works(id)`, `pages jsonb not null default '[]'`, `confidence real not null`, `confirmed boolean not null default false`, `extractor text not null`, `created_at`; benzersiz `(from_record_id, work_id)`; dizin `work_id` | Karar başına eser başına tek kenar ve sayfa listesi. |
| `citation_edges.rejected` | `boolean not null default false` | Editör reddi. Şimdilik ret `confirmed = true, confidence = 0` ile saklanır (`citations/store.py` başlığı); sütun gelince sorgular `NOT rejected` olur. `work_citations` için de aynı. |
| `works.csl` kullanımı | mevcut `jsonb` | `{kind, venue, editions:[{year, edition, place, volume}]}` yazılır; sütun değişmez. |

Okuma sorgusu (`apps/web/src/app/atif-agi/_sunucu/sql.ts`): kenar görünür ise `(confirmed AND confidence > 0) OR confidence >= 0.90`.
Tablolar yoksa (`42P01`) arayüz doktrin verisini "yok" sayar, hata vermez.

## 2. Alan eşlemesi (karar çözümleme)

`citations/store.py` hedef kaydı `replace(esas_no, ' ', '') = <esas>` ve `replace(karar_no, ' ', '') = <karar>` ile arar.
AYM bireysel başvuru numarasının `records.esas_no` içinde `2014/18260` biçiminde tutulduğu varsayıldı; farklıysa
(ör. `officialRef`) `store.py FIND_NUMBER_SQL` güncellenir. ABAD ve AİHM numaraları için corpusta kayıt yok, hedef çözülmez.
Büyük corpusta `esas_no` üzerindeki trigram dizini `replace(...)` ile kullanılamaz; ayrı bir normalleştirilmiş sütun
(`esas_key`) ya da ifade dizini önerilir.

## 3. Kuyruk

`review_queue.queue = 'citations'`, `subject_type = 'citation_edge'`, `subject_id` kenar kimliği, `payload`:
`{recordId, kind: 'karar'|'doktrin', confidence, reasons[], context (maskeli metinden en çok 400 karakter), candidate}`.
`decision` değerleri mevcut check kısıtıyla uyumludur (`onay`, `ret`, `duzelt`, `superseded`). Editör ekranı (kimlik ajanı,
`api/v1/admin/**`) onayda `confirmed = true`, retde `confirmed = true, confidence = 0` yazmalıdır. Bu ekran yoktur;
kuyruk şimdilik yalnız dolar.
