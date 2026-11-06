# İstek: Kaydettiklerim uçları, sahiplik ve dışa aktarma biçimleri

1. İsteyen: casuist ajanı, dal `codex/dalga2-casuist`. Muhatap: orkestra (sahiplik), mimar (sözleşme), hukuk-uyum
   (dışa aktarma lisans notu).
2. Gerekçe: plan 10.2/4, 13.1 (`/kaydettiklerim`), SRS FR-23..25; orkestra görevi Kaydettiklerim'i bu işe verdi.
3. Aciliyet: sayfa ve uçlar bu istekler olmadan çalışır; maddeler sözleşmeyi ve sahiplik tablosunu gerçeğe uydurur.

## Durum

Sözleşmede uçlar vardı (`GET/POST /v1/library`, `DELETE /v1/library/{id}`, `GET /v1/library/export`); bu PR
onları sözleşmeye uygun kurdu: `apps/web/src/app/api/v1/library/**` (rota dosyaları) ve
`apps/web/src/app/kaydettiklerim/_sunucu/kutuphane.ts` (işleyiciler). `packages/contracts` ve `packages/db`
değişmedi.

## 1. orkestra: sahiplik tablosu

`docs/sahiplik.md` casuist satırına şu yollar eklenmeli (bu işte yazıldı):
`apps/web/src/app/kaydettiklerim/**`, `packages/i18n/{tr,en}/kaydettiklerim.json`,
`apps/web/src/app/api/v1/{search,records,norms,answers,library}/**` (not 3'teki modül uç kuralı gereği).

## 2. mimar: LibraryItem içinde kayıt özeti

`LibraryItem` yalnız `{id, recordId, note, createdAt}` taşıyor. iOS ve başka istemciler listeyi gösterebilmek için
her kayıt için ayrıca `GET /v1/records/{id}` çağırmak zorunda kalıyor (N+1). Öneri: isteğe bağlı
`record: RecordSummary` alanı (gizlenmiş kayıt listeden zaten düşer). Geriye uyumlu, yeni alan.

## 3. mimar ve hukuk-uyum: İSNAD 2, OSCOLA, Bluebook

`format=ris` ve `format=bibtex` üretiliyor. `isnad-dipnotlu`, `isnad-metinici`, `oscola`, `bluebook` şimdilik
400 ve açıklama döner; elle yazılmış yaklaşık bir biçim gerçek atıf kurallarını garanti etmediği için üretilmedi.
Plan 10.2/4 "CSL ile" diyor. Seçenekler:
- citeproc-js (CPAL-1.0 veya AGPL-1.0 çift lisans; CPAL ile kullanım atıf yükümlülüğü getirir, AGPL kullanılmaz):
  bağımlılık kararı ve ADR gerekir.
- İSNAD CSL stili Zotero deposunda CC BY-SA 3.0; stil dosyası kullanılırsa atıf zorunlu (plan 11 "CSL stillerinin
  CC BY-SA atfı").
Karar verilene kadar arayüz kullanıcıyı RIS veya BibTeX ile Zotero ya da EndNote'a yönlendirir. Sözleşmedeki
dışa aktarma cevabı `text/plain`; dosya adı `Content-Disposition` ile verilir.

## 4. kalite-guvenlik

`tests/e2e/adresler.ts` listesine `/ara` ve `/kaydettiklerim`; IDOR testi (başka kullanıcının öğesini silme 404)
birim testte var (`kutuphane.test.ts`).
