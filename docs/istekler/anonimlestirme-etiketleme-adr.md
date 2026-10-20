# İstek: altın set etiketleme yöntemi için ADR (yerel Label Studio veya basit arayüz)

1. İsteyen: anonimlestirme ajanı, dal `dalga-1/anonimlestirme/temel`.
2. Gerekçe: plan 6.7 eval/anon 200 kararlık katmanlı set ister; %20'si çift etiketli olacak ve Cohen kappa raporlanacak. Plan 15.3/2 kapısı bu setle ölçülür. Etiketlenecek metin gerçek karar metnidir, dolayısıyla etiketleme aracı da Türkiye'deki sunucuda veya ekibin yerel makinesinde çalışmalı (ADR-0011, plan 5.5).
3. Önerilen değişiklik: mimar iki seçenekten birini ADR ile seçsin.

## Seçenek A: yerel Label Studio (Community Edition)

- Lisans: Apache-2.0 (Label Studio CE, HumanSignal). AGPL veya SSPL değil.
- Artıları: span etiketleme, çoklu etiketleyici ve görev atama hazır; JSON dışa aktarım `annotations_a`/`annotations_b` biçimine kolay dönüşür; stajyer eğitimi kısa.
- Eksileri: Docker veya ayrı Python ortamı ve kendi veri tabanı (SQLite veya PostgreSQL) gerektirir; kullanıcı yönetimi ayrı; ham metin ikinci bir sistemde saklanır, bu yüzden yalnız Türkiye'deki sunucuda, yalnız iç ağdan ve şifreli diskle çalıştırılmalı; ML backend ve bulut depolama bağlantıları kapalı tutulmalı.

## Seçenek B: /yonetim altında basit etiketleme arayüzü

- review_queue (anonymization) editör ekranıyla aynı bileşenler: metin, önerilen span'lar, ekle, sil, tür değiştir.
- Artıları: yeni sistem yok; kimlik, yetki ve denetim kaydı mevcut altyapıdan; ham metin records tablosundan çıkmaz.
- Eksileri: geliştirme maliyeti (tahmin: on-yuz ve anonimlestirme için birkaç gün); çift etiketleme ve uyuşmazlık çözümü ekranı ayrıca yazılmalı; altın set için yeni tablo gerekir (ör. `gold_annotations(record_id, annotator, spans jsonb, created_at)`), bu packages/db değişikliğidir.

## Öneri

Dalga 2 için Seçenek A (yerel Label Studio, Türkiye sunucusunda, iç ağdan erişim), Dalga 3 sonrasında editör kuyruğu ekranı olgunlaşınca Seçenek B'ye geçiş. Dışa aktarım biçimi `eval/anon/measure.py` içinde tanımlıdır; araç değişse de ölçüm betiği değişmez.

4. Geriye uyumluluk: Seçenek A şema değişikliği gerektirmez. Seçenek B yeni tablo ekler (yıkıcı değil).
5. Aciliyet: Dalga 2 başında karar gerekir; 200 kararlık setin etiketlenmesi Dalga 3 kapısının ön koşuludur.

## Ek not (sözleşme gözlemi, ayrı karar gerekebilir)

- `review_queue.decision` serbest metin. anon.run aynı kayıt yeniden işlendiğinde açık satırları `decision = 'superseded'` ile kapatıyor; mimar bu değeri izinli karar değerleri listesine almalı veya başka bir değer önermeli.
- Maskeli metin ayrı bir sütunda tutulmuyor; `anonymization_spans` ve `records.text` ile yeniden üretilir. Dizinleme (chunks) maskeli metinden üretilmeli; mimar bunun için `records` üzerinde ayrı sütun mu yoksa chunk üretiminde span uygulaması mı istendiğini netleştirmeli.
