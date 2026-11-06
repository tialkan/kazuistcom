# İstek: yazma modülü için sözleşme ve şema tamamlamaları

Kimden: yazma (dal codex/dalga2-yazma). Kime: mimar. Aciliyet: modül bu istekler olmadan çalışır; sözleşme ile gerçek davranışı hizalamak için gerekir. `packages/contracts` ve `packages/db` değişmedi.

## Uygulamanın sözleşmeden ayrıldığı yerler

1. `POST /v1/templates/rules`: gövdeye isteğe bağlı `kind` (`tez` | `makale`, varsayılan `tez`) eklenmeli. İş sonucu (`GET /v1/jobs/:id`, `result`) şu biçimde: `{templateRuleId: uuid|null, model: 'haiku'|'sonnet'|null, sonnetYedegi: boolean, dusenler: [{anahtar, neden}], uyarilar: ['taranmis_olabilir'|'metin_az'], institutionName}`. Hata olunca `status: failed` ve `error` kararlı bir kod (`sema`, `model`, `cok_buyuk`, ...). Yükleme dosyası sunucuda saklanmaz; iş satırında yalnız `{userId, kind}` var. İş web sürecinde `after()` ile tamamlanır (worker-node'da `rules.extract` işleyicisi yok).
2. Yeni uçlar: `GET` ve `DELETE /v1/templates/rules/:id` (çıkarılan kural kümesi, yalnız sahibi; silme kullanıcının hakkı), `POST /v1/templates/check` (multipart `file` + `rules`; .docx denetimi; yanıt `{kind, sections, summary, findings[]}`, dosya içeriği döndürmez), `GET`/`PUT /v1/writing-projects/ayarlar` (`{hitap: 'sen'|'siz'}`).
3. `POST /v1/templates/docx` uygulanmadı: şablon tarayıcıda üretiliyor (SRS 6.3 prototipi gibi; kurallar sunucuya gitmiyor). Uç isteğe bağlı sayılmalı ya da kaldırılmalı.
4. `RuleSet.rules[].evidence` yalnız metin; FR-92 için `{page, excerpt}` gerekir (`template_rule_evidence.page` var). Dergi kuralları ucu bugün `evidence` metnini veriyor, sayfa kaybolmuyor ama sözleşmede yok.
5. `POST /v1/abbreviations` yanıt öğesine `source` (`sozluk|metin|oneri|belirsiz`) ve `count` eklendi; çözülemeyenler `long: ""`. `useAi` kapalıyken yanıt başlığı `X-Yazma-Oneri: kapali`. Uç hesap ister.
6. `GET /v1/writing-projects/:id` yanıtı `createdOn` (YYYY-MM-DD) ve `recentLogs` (son 14 gün, `[{loggedOn, words}]`) ile genişledi. `docx-count` yalnız sayar; ilerleme kaydı istemcinin ayrı `progress` çağrısıdır.

## Şema

1. `profiles.kalemcik_hitap` (`sen` | `siz`, varsayılan `sen`): Kalemcik'in hitabı şimdilik `reminders` tablosunda kullanıcı düzeyinde `kind = 'hitap_siz'`, `project_id` boş satırla (`enabled` = siz) tutuluyor. Bu geçici; doğru yeri profildir.
2. `template_rules` saklama: kullanıcıya ait onaysız kural kümeleri 30 gün sonra `kalemcik.daily` ile siliniyor (kanıtlar cascade). Hesap silinince `user_id` `set null` oluyor ve satır 30 güne kadar kalıyor; `account.purge` bu satırları hemen silmeli (`DELETE FROM template_rules WHERE user_id = $1 AND approved = false`) ya da FK `cascade` olmalı. Kimlik ajanına yönlendirme: docs/istekler/yazma-bildirim-ve-hesap.md.
3. `journal_rule_versions.rules` biçimi `{tur: 'makale', degerler, kaynaklar, kanitlar}`; `review_queue` `journal-rules` kalemlerinde `payload.rules` aynı paket. Editör `onay` kararı verilince sürüm yayında sayılıyor (`approved_at` boş kalsa da); `approved_by/approved_at` doldurma işi kimlik'in kuyruk karar koduna eklenmeli ya da kabul edilmeli.
4. `JobType` `rules.extract` ve `docx.validate` var; ikisi de kuyruk işleyicisi olarak uygulanmadı (dosya depolama yok). Python docxcheck şimdi iç HTTP ucu (`/internal/docxcheck`) olarak çalışıyor.

## Geriye uyumluluk

Hepsi ekleme; mevcut istemci yok. Yıkıcı migration yok.
