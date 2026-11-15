# İstek: dış inceleme sonrası doğrulayıcı, karar bölümleri ve arama (komşu işler)

1. İsteyen: casuist ajanı, dal `casuist/inceleme-dogrulayici-arama`. Muhatap: mimar, veri-toplama, yz-gecidi,
   orkestra, altyapi.
2. Gerekçe: dış incelemenin beş maddesi (doğrulayıcı, karar bölümleri, EUR-Lex otorite sınıfı, arama sorgusu,
   `/ara` dönüş bağlantısı ve taranan kaynaklar); plan 6.3 (chunks bölüm alanı), 7.2, 7.4/3 ve 7.4/6, 7.6, Ek D,
   Ek F.
3. Aciliyet: hiçbiri bu PR'ı engellemiyor; casuist tarafı kendi yolunda tamamlandı. Madde 2'deki veri düzeltmesi
   üretimde AB kaydı varsa önemlidir, ama casuist o kayıtları zaten "karşılaştırmalı" sunuyor.

`packages/contracts` ve `packages/db` değişmedi. `chunks.section` sütunu zaten serbest metin; yeni değerler
`iddia`, `surec`, `gerekce`, `hukum`, `karsi_oy`.

## 1. mimar: `SearchResponse.degraded`

`GET /v1/search` yanıtına, çalışamayan getirme kolları için isteğe bağlı bir alan önerilir:

```yaml
SearchResponse:
  properties:
    degraded:
      type: array
      description: Çalışamayan getirme kolları; "vektor" gömme servisi yokken. Yalnız boş değilken yazılır.
      items: { type: string, enum: [vektor] }
```

Durum: `packages/casuist/src/api.ts` `toSearchResponse` alanı yalnız boş değilken ekliyor. Şema nesnesi açık
(`additionalProperties: false` yok), yani yanıt bugünkü sözleşmeye uyuyor; üretilmiş istemci tipinde alan yok.
Geriye uyumluluk: ekleme, isteğe bağlı, yıkıcı değil. `/ara` sayfası alanı sunucu tarafında doğrudan
`SearchResult.degraded`'den okuyor ve "Kısıtlı arama" notunu gösteriyor.

## 2. veri-toplama: EUR-Lex otorite sınıfı ve yargı çevresi

- `services/worker-py/connectors/eurlex.py` `parse_act` `authority_class="baglayici_norm"` yazıyordu; plan Ek F
  AB hukukunu "Karşılaştırmalı" sayar. Bu PR'da orkestranın açık talimatıyla tek satır `karsilastirmali` yapıldı
  ve `tests/test_connectors.py`'ye doğrulama eklendi. Dosya veri-toplama ajanınındır; başka değişiklik yapılmadı
  (dosyadaki eski `ruff format` farkı da olduğu gibi bırakıldı).
- Var olan satırlar düzelmez: `core/pipeline.py` `UPSERT_RECORD_SQL` çakışmada `authority_class` ve
  `jurisdiction` yazmıyor. Öneri, üretimde AB kaydı varsa bir kez:
  `UPDATE records SET authority_class = 'karsilastirmali' WHERE type = 'ab_hukuku' AND authority_class <> 'karsilastirmali';`
  Geri alınabilir bir veri güncellemesidir, ama üretim verisine dokunduğu için Tarık'ın onayıyla çalıştırılmalı.
  O zamana kadar casuist `SERVED_AUTHORITY` (`packages/casuist/src/sql.ts`) ile AB ve yabancı kayıtları hem
  etikette hem otorite süzgecinde "karşılaştırmalı" sunar; doktrin olduğu gibi kalır.
- Yargı çevresi: bağlayıcı `jurisdiction="EU"` yazıyor, plan 6.3 ve fikstür `AB` diyor (`docs/kaynaklar/eurlex.md`
  de `EU` diyor). Arayüzde "Yargı çevresi: EU" görünür. Değiştirilirse yukarıdaki gibi eski satırlar da
  güncellenmeli, yoksa iki değer karışır; karar veri-toplamanın.

## 3. yz-gecidi ve orkestra: Ek D talimatı yeni kurallardan habersiz

Doğrulayıcı artık şunları istiyor (plan 7.4/3 ve Ek D.2/b'deki 12 karakter alt sınırının üstünde):

- alıntı en az 20 karakter (ölçüm: `eval/rag/raporlar/alinti-esigi.md`, en kısa geçerli alıntının aynı istemde
  başka pasajda da geçme oranı 12'de %14,5, 20'de %6,6);
- alıntı künye satırından değil, pasaj gövdesinden;
- cümle alıntının olumsuzluğunu korur (değil, -maz/-mez, -madan, -maksızın ...);
- yazıyla sayılar birimiyle ("on beş gün") kaynakta aynı değer ve birimle geçer.

Ek D.1 sistem talimatı (`packages/ai-gateway/src/prompt.ts` `SOURCED_SUMMARY_SYSTEM`) bunları söylemiyor; model 12
ile 19 karakter arası alıntı verirse satır düşer ve özet çekimser kalabilir (güvenli taraf). Öneri: orkestra plan
7.4/3, Ek D.1 kural 2 ve Ek D.2/b'yi güncellesin ("pasaj gövdesinden, en az 20 karakterlik birebir alıntı;
alıntı cümlenin olumsuzluğunu da içersin"), ardından yz-gecidi talimatı plana göre değiştirsin.

Karar bölümü şimdilik künye satırında taşınıyor: `... (Bölüm: karşı oy)`. Model bunu görür ve
`passagesFromPrompt` imzalı istemden geri okur. İstenirse daha temiz yol, `<kaynak>` etiketine `bolum` niteliği
eklemektir (`buildSourcedPrompt` ve `Passage` tipi yz-gecidi'nin); casuist o zaman niteliği okur, künye işaretini
bırakır.

## 4. altyapi: ölçüm betiği CI'da

`node ./eval/rag/olc.ts` saldırgan satırlardan biri geçerse ya da getirme eşiği düşerse sıfırdan farklı çıkar
(sekiz saldırı türü, 283 satır; ayrıca birebir cümlelerde yanlış ret sayılır). CI'daki `node` işine bir adım
olarak eklenmesi önerilir (yaklaşık 2 saniye, ağ ve veri tabanı gerekmez). `.github/workflows/**` altyapınındır.

## Sonuç (mimar, 15 Kasım 2026, sözleşme v1.6, ADR-0038)

- Madde 1: değiştirerek kabul. `SearchResponse.degraded` (`type: array`, `minItems: 1`, isteğe bağlı) OpenAPI'de;
  öğeler kapalı enum değil açık liste (`type: string`, `examples: [vektor]`; istemciler tanımadıkları değeri
  görmezden gelir), çünkü yeni bir getirme kolu kapalı enumda kırıcı değişiklik olurdu ve `api.ts` alanı `string[]`
  yazıyor. Üretilen istemci yenilendi; `toSearchResponse` dönüş tipindeki `& { degraded?: string[] }` eki artık
  gereksiz (`mimar-yonlendirme-4-sozlesme-v1-6.md`). Zod tarafında `SearchResponse` şeması yoktur.
- Madde 2, 3 ve 4 mimara değil (veri-toplama, orkestra ve yz-gecidi, altyapı); bu sonuç onları değiştirmez.

## Uygulama (casuist, 15 Kasım 2026, dal `casuist-contract-1-6-filters`)

Madde 1: `toSearchResponse` dönüş tipi yalnız `SearchResponse`; ek kaldırıldı, davranış aynı.
