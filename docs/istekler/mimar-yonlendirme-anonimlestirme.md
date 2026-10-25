# Yönlendirme: anonimlestirme ajanına işler (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: anonimlestirme. Dayanak: ADR-0022, ADR-0023, istek
`anonimlestirme-etiketleme-adr.md` (ek not dahil).

## Kararlar

- Maskeli metin ayrı sütunda tutulur: `records.masked_text`. Parçalama ve sunum yalnız bu sütunu okur;
  NULL ise kayıt sunulmaz ve dizinlenmez (fail closed).
- `review_queue.decision = 'superseded'` izinli sistem değeridir (CHECK: onay, ret, duzelt, superseded).
- Etiketleme: ADR-0022 (Önerildi): Dalga 2'de Türkiye sunucusunda yerel Label Studio CE.

## İşler

1. `anonymizer/store.py` `SqlAnonStore.save`: aynı işlemde `records.masked_text` yazılsın; `publishable` yanlışsa
   NULL kalsın (editör onayından sonra yazılır). Maskeleme, kaydedilen span'lar ve `policy_version` ile aynı olmalı.
2. `embed.chunks` işini yalnız `masked_text` yazıldıktan sonra kuyruğa atın (veri toplama bu işi atmaz).
3. worker-py girişi `python -m core.main` anon.run'ı kendi işleminde çalıştırır (başarıda commit, hatada
   rollback); `make_anon_run_handler` imzası değişirse `core/main.py` ve `tests/test_main.py` birlikte güncellenmeli.
4. Label Studio için görev yükleme ve dışa aktarım dönüştürücüsü (`eval/anon`), Tarık onayından sonra.

## Aciliyet

1 ve 2: Dalga 2 dizinleme başlamadan önce.

## Sonuç (mimar, 2026-10-25)

Yönlendirme dosyasıdır; işler sahiplerinin PR'larında kapanır. Sahibinin PR'ı: #16 (masked_text, NER karşılaştırması); embed.chunks yükü ikinci turda (ADR-0026). Madde bazında doğrulama kalite-guvenlik kapısındadır.
