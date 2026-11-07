# İstek: `CitationGraph` sözleşmesine doktrin düğümleri ve özet

1. İsteyen: atif-agi ajanı, dal `codex/dalga2-atif-agi`.
2. Gerekçe: SRS FR-27, FR-28, FR-29 (özet kartları, eser düğümü, karar komşulukları). Bugünkü `CitationGraph`
   (`packages/contracts/openapi.yaml`) yalnız `nodes: RecordSummary[]` ve `edges: {from, to, kind}[]` taşır; eser
   düğümü, sayfa, karar corpusunda olmayan atıf ve özet yoktur.
3. Aciliyet: uçlar şimdi çalışıyor ve ek alanları geriye uyumlu biçimde döndürüyor (şemada `additionalProperties`
   kapalı değil). iOS ve dış istemciler için şemaya girmesi gerekir.

## Eklenecek isteğe bağlı alanlar (`getCitationNetwork` ve `getRecordNetwork` yanıtı)

```yaml
CitationGraph:
  properties:
    works:            # doktrin düğümleri; kitap ve makale baskıları tek düğümde
      type: array
      items: { $ref: '#/components/schemas/CitationWork' }
    workEdges:
      type: array
      items:
        type: object
        required: [from, work, sayfalar]
        properties:
          from: { type: string, format: uuid }   # karar
          work: { type: string }                 # CitationWork.id
          sayfalar: { type: array, items: { type: string } }
    externalCitations: # corpusta kaydı olmayan atıf yapılan kararlar (bağlantısız gösterilir)
      type: array
      items: { $ref: '#/components/schemas/ExternalCitation' }
    summary: { $ref: '#/components/schemas/CitationSummary' }
    meta:
      type: object
      properties:
        kaynak: { type: string, enum: [veritabani, fikstur] }
        doktrinVerisi: { type: boolean }
        kuyrukta: { type: integer }     # editör onayı bekleyen, çizilmeyen atıf sayısı
        yayinEsigi: { type: number }
        kesildi: { type: boolean }
CitationWork: { id, baslik, yazarlar[], tur: kitap|makale, yayin, basklar: [{yil, baski, yer, cilt}] }
ExternalCitation: { from, tur: yargi|aym|abad|aihm, mahkeme, daire, esasNo, kararNo, numara, tarih }
CitationSummary: { kararSayisi, eserSayisi, doktrinAtfiSayisi, kararAtfiSayisi, enCokAtifAlanlar: [{id, baslik, sayi}] }
```

Ayrıca: `RecordSummary.sourceUrl` (casuist isteğiyle aynı; "Kaynağa git"), `edges.kind` değerlerinin (`bozma`, `onama`,
`ayni_yonde`, `aksi_yonde`) çıkarıcıda henüz üretilmediği not edilmeli: şimdilik yalnız `atif` yazılır.
`topic` sorgu parametresi kayıt başlığında harf büyüklüğüne bakmadan sözcük arar (konu etiketi verisi yok); anlamı
şemada yazılmalıdır. `from` ve `to`, tarih yanında dört haneli yılı da kabul eder.
