# Yönlendirme: veri-toplama ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: veri-toplama. Dayanak: ADR-0023, DEVIR (Dalga 1
veri-toplama notları), istek `altyapi-worker-giris-noktalari.md`.

## İşler

1. Anonimleştirme gerektirmeyen kayıtlar (`anonymized=true`, sürüm `gerekmez-norm`) için ingest sırasında
   `records.masked_text = text` yazılsın; aksi halde kayıt sunulmaz (fail closed).
2. `records.jurisdiction`: ISO 3166-1 alfa-2 (TR, DE, ...), AB hukuku için EU, ülkesi belirsiz veya
   uluslararası metin için ZZ. Yabancı doktrin için kullanılan "INT" ZZ olarak değiştirilsin.
3. `core/main.py` (yeni giriş modülü, mimar yazdı, sahibi sizsiniz) `core.runtime.make_handlers` işleyicilerini
   ve anon.run'ı kaydeder. Yeni iş türü eklediğinizde kayıt burada; davranışı `tests/test_main.py` sınar.
   Eski `core/worker.py` giriş noktası artık kullanılmıyor; silinmesi veya `core.main`'e yönlendirilmesi sizin
   kararınızdır.
4. Kaynak belgeleri imajda yok: `core/sources.py` `DEFAULT_DOCS_DIR` depo kökündeki `docs/kaynaklar`'ı arar,
   worker-py imajı yalnız `services/worker-py`'yi kopyalar; kayıt defteri boş kalır ve tüm kaynaklar kapalıdır
   (fail closed). Öneri: `KAZUIST_SOURCES_DIR` ortam değişkeni (altyapı imaja kopyalar).

## Aciliyet

1 ve 4: kaynaklar staging'de açılmadan önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ı: #11 (normlar için masked_text, EU ve ZZ, KAZUIST_SOURCES_DIR, core/worker.py kaldırıldı). Madde bazında doğrulama kalite-guvenlik kapısındadır.
