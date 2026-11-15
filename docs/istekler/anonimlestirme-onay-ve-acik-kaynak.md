# İstek: anonimleştirme onayının tetiklenmesi, açık kaynak üye adlarının dizin dışında tutulması

1. İsteyen: anonimlestirme ajanı, dal `anonimlestirme/acik-kaynak-onay`. Muhataplar: kimlik (madde 3), casuist
   (madde 4), seçenekli veri-toplama (madde 5). Bilgi: veri-toplama (madde 6). Sözleşme, şema ve migration
   değişikliği istenmez.

2. Gerekçe ve bu dalda yapılan:
   - Plan 6.4/6 ("kuyruk boşalmadan kayıt yayımlanmaz"), FR-79 ve FR-108 (PR #111, `ek_maskeleme` sonrası yeniden
     gösterme). Yönetim paneli `anonymization` kuyruğundaki `onay`'ı yalnız `review_queue.decision`'a yazar
     (`apps/web/src/server/auth/admin.ts`: diğer kuyruklar "only record the decision, their module owners apply it
     from review_queue"). Bugüne kadar bunu uygulayan yoktu; incelemeye düşen kaydın `masked_text`'i hep NULL kalıyordu.
   - Bu dalda `anon.run` onayı uygular: kaydın aynı `anonymizationVersion` için en son karar verilmiş anonimleştirme
     kalemi `onay` ise ve o kalem yeni çalıştırmanın bütün inceleme öğelerini (`charStart`, `charEnd`, `entity`,
     `mask`) içeriyorsa sonuç yayımlanır: `masked_text` yazılır, `anonymized = true`, `embed.chunks` (`embed:<id>`)
     kuyruğa girer, incelenen spanlara `reviewed_by` ve `reviewed_at` yazılır, yeni kalem açılmaz. Sonra verilen `ret`
     veya `duzelt` onayı geçersiz kılar (`superseded` sistem yazısıdır, sayılmaz). `payload.blocked`
     (`ner_unavailable`) taşıyan kalemin onayı hiçbir zaman yayımlatmaz; model ile yeniden çalıştırma gerekir.
     `jobs.result` biçimi değişmedi.
   - `python -m anonymizer.approvals` (`DATABASE_URL`): onaylanmış, engelsiz, sürümü kaydın güncel sürümüyle aynı,
     açık kalemi olmayan ve `masked_text`'i NULL kayıtlar için `anon.run` kuyruğa koyar (`anon:<id>`, ingest ile aynı
     anahtar; kuyrukta veya çalışan iş varsa ekleme yutulur). Karardan sonra `failed` veya `dead` olmuş `anon.run`
     varsa kaydı tekrar koymaz. Çıktı yalnız `{"queued": n}`.
   - Plan Ek E: `policy.yaml` `open_sources` artık kayda `records.source_key` ad alanı (`aym:`) veya mahkeme adının
     eşdeğerleriyle ("Anayasa Mahkemesi", büyük harf, nokta ve boşluk farkları) bağlanır. AYM kararlarında kararın
     kendi kurul satırlarında (başlıktaki "Başkan :", "Üyeler :" ve altındaki ad satırları; imza bloğu) adı geçen
     üyeler `masked_text`'te açık kalır. Raportör, ilk derece hâkimi, cümle içinde "Başkanı" veya "üyesi" ile anılan
     kişi, taraf ve vekil maskeli kalır; kurulda adı geçen biri başka yerde taraf rolüyle anılıyorsa her yerde maskelenir.

3. İstenen (kimlik, `apps/web/src/server/auth/admin.ts` `decideQueueItem`): `queue === 'anonymization'`,
   `item.subjectType === 'record'` ve `decision === 'onay'` iken, kalemi kapatan güncelleme ile aynı işlemde:

   ```sql
   INSERT INTO jobs (type, payload, dedupe_key)
   VALUES ('anon.run'::job_type, jsonb_build_object('recordId', $1::text), 'anon:' || $1::text)
   ON CONFLICT (type, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running') DO NOTHING
   ```

   (`$1 = item.subjectId`). `ret` için iş eklenmez. `duzelt`: anonimleştirici `patch.changes`'ı henüz uygulamaz; karar
   kaydedilir, kayıt yayımlanmaz (onayı geçersiz kılar), iş eklemek gerekmez. PR #111'in `decideRelease` koşulu
   ("en yeni `anon.run` `done`, `masked_text` dolu, açık kalem yok") bu akışla sağlanır: onay, iş, yayın, sonra
   yeniden gösterme onayı. Test: onaydan sonra `jobs`'ta `anon:<id>` anahtarlı tek `anon.run` satırı; ikinci onay
   denemesi `not_found` (kalem kapalı).

4. İstenen (casuist, `services/worker-py/nlp/job.py`): Ek E'nin aynı satırı ve genel kuralları kişi adıyla aramayı,
   arama dizinini ve kaynaklı özette kişi adını yasaklar (FR-21, FR-80). Açık kaynak üye adları artık `masked_text`'te
   olduğu için `chunks.text` (dolayısıyla `chunks.tsv`, embedding ve özete giden bağlam) bu adları taşır. Parçaların
   metni `anonymizer.public_names.index_text(masked_text)` ile üretilmeli: kurul satırlarında açık kalan adları ve
   metnin başka yerlerindeki anılmalarını `[Üye n]` yapar, açık ad yoksa metni aynen döndürür (her kayda uygulanabilir,
   saf fonksiyon, log yok). `char_start` ve `char_end` `masked_text`'e göre tutuluyorsa: önce `masked_text` bölünür,
   sonra her parçanın metnine `index_text` uygulanır (ofsetler değişmez, parça metni biraz farklı olur), ya da tercih
   edilen başka bir eşleme; karar casuist'in. Bu yapılana kadar AYM kaynağı açılmamalı (kaynak bugün
   `tarik_onayi: bekliyor`).

5. Seçenekli (veri-toplama, `services/worker-py/core/main.py`): `WorkerLoop` turuna birkaç dakikada bir
   `anonymizer.approvals.queue_approved(cur)` çağrısı (kendi bağlantısında, autocommit). Kimlik tetikleyicisi gelince
   güvenlik ağıdır; gelmezse tek otomatik yol. Alternatif: işletimde zamanlanmış `python -m anonymizer.approvals`.

6. Bilgi (veri-toplama): `docs/kaynaklar/aym.md` "Yüksek mahkeme üyesi adları (Başkan, Üyeler, Raportör) ... eşleşme
   sağlanmaz" notu eskidi. Eşleşme mahkeme adıyla ve `aym:` ad alanıyla kuruluyor; Başkan, Başkanvekili ve Üyeler
   açık, Raportör Ek E'deki "yüksek mahkeme üyesi" sayılmadığı için `[Raportör]` ile maskeli.
   `docs/istekler/veri-toplama-ingest-payloadlari.md` madde 4 bu dalda karşılandı.

7. Geriye uyumluluk: yalnız ekleme. `anonymizationVersion` `anon-0.4.0+ekE-2026.11.0+ner.<aday>` olur (plan 6.4/7
   gereği yeniden işleme ve fark raporu); kural katmanı ölçümü sentetik ve zor sette değişmedi
   (`eval/anon/raporlar/anon-0.4.0-{sentetik,zor}.json`).

8. Aciliyet: madde 3, incelemeye düşen her kayıt ve PR #111 akışı için gerekli; o gelene kadar
   `python -m anonymizer.approvals` elle çalıştırılabilir. Madde 4, AYM kaynağı açılmadan önce.
