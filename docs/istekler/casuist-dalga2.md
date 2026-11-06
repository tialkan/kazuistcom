# İstek: Dalga 2 arama ve kaynaklı özet için birleştirme, sözleşme ve komşu ajan işleri

1. İsteyen: casuist ajanı, dal `codex/dalga2-casuist`.
2. Gerekçe: plan 7, 8.1, 13.1, 15.1; Ek C.1; Ek D.
3. Aciliyet: madde 1 birleştirme için zorunlu; diğerleri ilerlemeyi durdurmaz.

## 1. orkestra: kilit dosyası (birleştirmeden önce zorunlu)

`apps/web/package.json` bağımlılıklarına iki çalışma alanı paketi eklendi: `@kazuist/ai-gateway` ve
`@kazuist/casuist` (`workspace:*`). Üçüncü taraf bağımlılık yok, lisans değişmedi. Talimat gereği kök kilit dosyası
değiştirilmedi; `pnpm install --frozen-lockfile` bu yüzden CI'da düşer. `pnpm install` sonrası `pnpm-lock.yaml`
farkı yalnız şudur (importers / apps/web / dependencies):

```yaml
      '@kazuist/ai-gateway':
        specifier: workspace:*
        version: link:../../packages/ai-gateway
      '@kazuist/casuist':
        specifier: workspace:*
        version: link:../../packages/casuist
```

## 2. mimar: sözleşme önerileri (geriye uyumlu, yeni isteğe bağlı alanlar)

- `RecordSummary`: `sourceUrl` (FR-11/12 "Kaynağa git" için), `jurisdiction` (FR-11 "ülke"), `relevance` (0..1),
  `why` (`kimlik|norm|terim|anlam`, FR-11 "neden ilgili"). `/ara` sunucuda çizildiği için bunları iç türden okuyor;
  API istemcileri (iOS) için sözleşmede gerekli.
- `SearchResponse`: `counts` (türe göre sonuç sayısı, FR-09) ve `degraded` (çalışmayan getirme kolları; ör.
  embedding servisi yokken `vektor`).
- `VerifyResponse.savedId` için doğrulanmış özet tablosu (`saved_answers`: user_id, nonce özeti, satırlar,
  kaynak kimlikleri, created_at). Tablo olmadığı için `save: true` şimdilik `savedId: null` döner.
- FR-109 platform modu YZ izni: `yz_aktarim` yalnız BYOK aktarma metnini kapsıyor (content/hukuki acik-riza madde 3).
  Platform modunda maskeli sorunun OpenRouter üzerinden Anthropic'e gittiği arayüzde yazılı; ayrı bir onay türü
  (ör. `yz_platform`) ve metni gerekiyorsa hukuk-uyum ile birlikte eklenmeli.
- `records.decision_date` mevzuat kayıtlarında Resmî Gazete yayım tarihi olarak kullanılıyor (yaş etiketi, SRS 3.3).
  Alan adı karar tarihini çağrıştırıyor; anlam şemada yorumla belirtilmeli.
- HNSW: `chunks_embedding_hnsw_idx` varsayılan `m=16, ef_construction=64` ile duruyor. Sorgu tarafı
  `SET LOCAL hnsw.ef_search = 200` kullanıyor (sınır 100 aday). `m` ve `ef_construction` değeri eval/embed ölçümü
  ve gerçek corpus ile seçilip migration ile verilecek; şimdi değiştirilmedi.

## 3. yz-gecidi: yalnız doğrulanmış cümle ücreti

`createGateway` ücret kararını ham `cumle` satır sayısından veriyor; plan 4.5/3 doğrulanamayan özetin ücretsiz
olmasını istiyor. casuist tarafı `ValidatedChargeLedger` sarmalayıcısıyla (apps/web/src/app/ara/_sunucu/gecit.ts)
doğrulanmış cümle yoksa `consume` yerine `release` çağırıyor ve testle sınadı. Kalıcı çözüm: `RunInput`'a
`chargeable?: () => boolean` ya da doğrulanmış cümle sayısını alan bir kanca; `CostEvent.creditsCharged` da buna göre
yazılmalı (şimdi ölçüm olayında 2 görünebilir, defterde düşülmez).

## 4. altyapi

- CI gece işi (plan 15.1 "RAG ölçüm işleri"): `node eval/rag/olc.ts` (Node 26, ek bağımlılık yok); eşik geçmezse
  çıkış kodu 1. Rapor `eval/rag/raporlar/` altına `--yaz` ile yazılır.
- Ortam değişkenleri (`.env.example` mimarındır): `KAZUIST_ARAMA_KAYNAGI` (`fikstur` yalnız yerel),
  `KAZUIST_EMBED_URL`, `KAZUIST_EMBED_MODEL`, `KAZUIST_EMBED_DIM` (1024), `KAZUIST_EMBED_ESIK`,
  `KAZUIST_ARAMA_AGIRLIK` (yönetim paneli gelene kadar JSON ağırlık haritası). `KAZUIST_FIKSTUR_URETIMDE=1`
  yalnız yerel üretim derlemesinde ekran görüntüsü içindir; staging ve üretimde tanımlanmamalıdır.
- `/api/v1/answers` SSE: ters vekilde tamponlama kapalı olmalı (`X-Accel-Buffering: no` gönderiliyor).

## 5. veri-toplama

Canlı federasyon arayüzü `packages/casuist/src/search.ts` içindeki `LiveSource` (`search(maskedQuery, signal)`,
1,2 sn bütçe, gelen kayıtlar `liveOnly`). UYAP Emsal ve Yargıtay canlı bağdaştırıcıları bu arayüze göre yazılırsa
`/ara` "Canlı kaynak" bölümünü kendiliğinden gösterir. Canlı sonuçlar anonimleştirilmeden kayda dönüştürülmemeli.

## 6. anonimlestirme

Ad tespiti şimdilik kural tabanlı (`packages/casuist/src/answer/names.ts`: unvan ve yaygın ad kalıpları). NER
servisine Node'dan erişim (HTTP) açılırsa `NameRecognizer` ve doğrulayıcının `names` seçeneği ona bağlanır.

## 7. seo ve on-yuz

- Arama sonuç sayfaları (`/ara?q=`) indekslenmemeli (plan 13.2 yalnız kayıt sayfalarını sayar). Kök düzen şimdilik
  tüm siteyi `noindex` yapıyor; yayın kapısında sayfa düzeyi kural `/ara` için `noindex, follow` olmalı.
- Ana sayfa örnek soruları artık `/ara?q=` bağlantısı (`modulAcik('/ara')` doğru). Mevzuat ve karar kayıt sayfaları
  (`/mevzuat/...`, `/karar/...`) sahiplik tablosunda kimseye atanmadı; "Kaynağa git" şimdilik resmî kaynağa gider.

## 8. Arama geçmişi kararı (mimar-yonlendirme-casuist-kampus-seo madde 7)

Arama sorguları saklanmaz, hesapla ilişkilendirilmez ve loglanmaz; hata logu yalnız yol, hata sınıfı ve istek
kimliği yazar. Kaynaklı özette soru maskelenip sağlayıcıya gider ve kayda yazılmaz (gözlem olayı yalnız meta veri).
iOS App Privacy "Search History" cevabı buna göre "toplanmıyor" olabilir; kaydedilen kaynaklar (library_items)
ayrı bir veri türüdür.
