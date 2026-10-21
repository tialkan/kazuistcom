# ADR-0022: Anonimleştirme altın seti için etiketleme yöntemi

- Tarih: 2026-10-20
- Karar kodu: yok (plan 6.7, 15.3/2; istek: docs/istekler/anonimlestirme-etiketleme-adr.md)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Plan 6.7 `eval/anon` için 200 kararlık katmanlı bir altın set ister; kararların %20'si iki kişi tarafından
etiketlenir ve Cohen kappa raporlanır. Plan 15.3/2 yayın kapısı bu setle ölçülür. Etiketlenen metin ham karar
metnidir; ADR-0011 gereği Türkiye dışına çıkamaz ve ikinci bir sistemde saklanması ek risk doğurur.

## Seçenekler

A. Yerel Label Studio Community Edition (HumanSignal). Lisans Apache-2.0 (GitHub API, 2026-10-20); son
sürüm 1.23.2, 2026-09-29. Span etiketleme, çoklu etiketleyici ve dışa aktarım hazırdır; ayrı veri tabanı ve
kullanıcı yönetimi gerektirir.

B. `/yonetim` altında anonimleştirme editör kuyruğunun bileşenleriyle basit etiketleme ekranı. Yeni sistem
yoktur, ham metin `records` tablosundan çıkmaz; geliştirme maliyeti ve yeni bir `gold_annotations` tablosu
(packages/db) gerekir.

## Karar (öneri)

Dalga 2 için A: Label Studio CE yalnız Türkiye'deki sunucuda, yalnız iç ağdan (VPN veya SSH tüneli), şifreli
diskte, ML backend ve bulut depolama bağlantıları kapalı, telemetri kapalı olarak çalışır. Görevler
anonimleştirme ajanının betiğiyle `records` tablosundan yüklenir; dışa aktarım `eval/anon/measure.py`
biçimine (`annotations_a`, `annotations_b`) dönüştürülür. Set tamamlanınca Label Studio'daki proje ve veri
silinir; kalıcı kopya yalnız `eval/anon` altındaki ofset tabanlı etiketlerdir (metin değil, kayıt kimliği ve
ofset).

Dalga 3 sonrasında editör kuyruğu ekranı olgunlaşınca B'ye geçiş yeniden değerlendirilir; geçişte
`gold_annotations` tablosu ayrı bir istek ve ADR ile eklenir.

## Gerekçe

A, Dalga 3 kapısının ön koşulu olan 200 kararlık seti en kısa sürede ve çift etiketleme desteğiyle üretir.
Ölçüm betiği araçtan bağımsız olduğu için sonraki geçiş ölçümü bozmaz.

## Sonuçlar

- Şema değişikliği yoktur (A).
- Altyapı ajanı Label Studio'nun kurulumunu Türkiye sunucusunda, iç ağdan erişimle yapar; imaj sürümü ve
  özetiyle sabitlenir. Kurulum öncesi resmî belgeden telemetri ve dış bağlantı ayarları doğrulanır.
- Etiketleyici erişimi Tarık'ın onayladığı kişilerle sınırlıdır; erişim kaydı tutulur.

## Durum

Önerildi, Tarık onayı bekliyor.
