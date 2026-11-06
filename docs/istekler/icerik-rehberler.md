# icerik: Rehberler modülü istekleri

İsteyen: icerik ajanı, dal `codex/dalga2-rehberler`. Hiçbir istek bu PR'ı bloklamaz.

## 1. MDX yerine JSON (karar notu, bağımlılık yok)

Plan 10.4 "MDX'e aktarılır" der. Yeni bağımlılık (`@next/mdx` ve `@mdx-js/*`) eklenmedi, çünkü içerik yapılandırılmıştır
(adım kimliği, ipucu, dayanak, kontrol maddesi etiketi) ve ilerleme bu kimliklere bağlanır. İçerik
`content/rehberler/*.json` içindedir ve `content/desteler` ile aynı kalıpla derleme zamanında zod ile doğrulanır.
FR-38 (panelden düzenleme, 1.1) için JSON yönetim panelinde MDX'ten daha kolay düzenlenir. MDX istenirse: `@next/mdx`
(MIT), `@mdx-js/loader` ve `@mdx-js/react` (MIT) gerekir; `apps/web/package.json` ve `next.config.ts` orkestradadır.

## 2. FR-34: ilerlemenin sunucuda saklanması (mimar, kimlik)

Giriş yapmış kullanıcıda makale ve tez ilerlemesi sunucuda tutulmalı. Şimdi ilerleme `localStorage` anahtarı
`kazuist.rehber.v1` altında, biçimi `{ makale: string[], tez: string[], kontrol: string[] }` (adım kimlikleri `m01..m12`,
`t01..t12`, kontrol `k01..k14`). Gerekenler:
- `guide_progress` tablosu: `user_id`, `guide` (`makale` | `tez` | `kontrol`), `done_ids` (text[]), `updated_at`;
  `(user_id, guide)` birincil anahtar.
- `GET /api/v1/guide-progress` ve `PUT /api/v1/guide-progress/{guide}` (zod, oturum zorunlu, kimlik listesi içerik
  kimlikleriyle sınırlı, en fazla 100 kimlik).
- Çakışma: iki cihazda işaretler birleşim (union) ile birleşsin; işaret kaldırma son yazma kazanır.
Aciliyet: düşük. Rehberler bu olmadan çalışır; işaretler yalnız bu tarayıcıda kalır ve sayfa bunu söyler.

## 3. Kaynak arama bağlantısı (casuist)

Makale ve tez adımlarında "Mevzuatı arayın", "Kararları arayın", "Makaleleri arayın" düğmeleri `kaynakTuru` alanıyla
tanımlı. `/ara` açık modüller kümesine girdiğinde düğme `/ara` adresine bağlanır; şimdi küme dışında olduğu için
düğme çizilmiyor. `/ara` kaynak türü filtresini sorgu parametresiyle alırsa (ör. `?tur=mevzuat`) `AdimListesi.tsx`
içindeki `href="/ara"` o parametreyle güncellenir. Parametre adını casuist yazar.

## 4. Diğer sahiplerden

- yazma: `/yazma` açılınca makale 2. adım ve tez 9. adım "Yazma zamanı: şablon" bağlantısı kendiliğinden görünür
  (`rotalar.ts` `acikModuller`).
- seo: rehber sayfalarına Article yapılandırılmış verisi, canonical, site haritası parçası ve `lastModified`
  (içerik dosyalarındaki `guncelleme` alanı gerçek değişiklik tarihidir). Kök `layout.tsx` hâlâ `noindex` verir; rehberler
  indekslenecekse seo ajanı sayfa düzeyinde açar.
- on-yuz: `en` dizini kaldırılacağı için bu modül yalnız `packages/i18n/tr/rehberler.json` taşır. Mevcut
  `packages/i18n/test/parity.test.ts` `en` dosya eşliğini istediği için `rehberler.json` yüzünden iki test kırılır;
  `en` kaldırılınca düzelir (orkestra talimatı: test değiştirilmedi).

## 5. WebCLAIMrobot listesi: zamana bağlı ifadeler

Rehber metinlerinde "henüz", "günümüzde", "şu an" ve yıl kalıplı ifade yoktur (taranıp temizlendi). Zamana bağlı
kalan ifadeler kaynak ve sürüm bilgisidir; sayfa içeriği değiştiğinde yeniden doğrulanmalı:

| Dosya | İfade | Kaynak ve kontrol |
|---|---|---|
| `zotero-endnote.json` | "Windows'ta Word 2010-2024 ve Office 365, Mac'te Word 2016-2024 ve Office 365" | zotero.org/support/system_requirements, son güncelleme 2026-08-26 |
| `zotero-endnote.json` | "EndNote 2025" sekmesi, menü adları | docs.endnote.com 2025 belgeleri |
| `zotero-endnote.json` | 300 MB ücretsiz Zotero Storage | zotero.org/support/sync |
| `zotero-endnote.json` | "İSNAD Atıf Sistemi 2. Edisyon (dipnotlu)" stil adı | CSL stil dosyası, güncelleme 2022-05-31 |
| `zotero-endnote.json` | Ankara Üniversitesi stili | CSL stil dosyası, güncelleme 2025-09-08 |
| `etik.json` | "YÖK Genel Kurulunun 28/8/2025 tarihli kararıyla değişik metin" | yok.gov.tr yönerge PDF'i, m. 4/1 |
| `tez.json` | Edinburgh planlayıcısı "Ocak 2024", Volokh 5. baskı 2016, Dunleavy 2003, Silvia 2. baskı 2019, Hutchinson ve Duncan 2012 | kaynak listesindeki künyeler |
| Tüm kaynak kayıtları | `okuma: 2026-11-07` | yeniden okunduğunda güncellenir |

## 6. Doğrulanamayan ve erişilemeyen

- Hutchinson ve Duncan: Deakin Law Review sayfası (ojs.deakin.edu.au) bir doğrulama kodu (CAPTCHA) istedi; aşılmaya
  çalışılmadı. Künye ve özet City Research Online kaydından alındı, tam metin okunmadı.
- Volokh, Dunleavy, Silvia: kitaplar okunmadı; dayanak notları ikincil kaynaklardan (kütüphane rehberi, katalog,
  yazım merkezi incelemesi) alındı ve sayfada "ikincil" diye işaretli. Sayfa numarası yalnız Volokh için (s. 10) var.
- Edinburgh "Dissertations and research projects" sayfası artık academic-skills.ed.ac.uk ana sayfasına yönlendiriyor;
  dayanak olarak yerine planlayıcı PDF'inin kendisi kullanıldı.
- EndNote sistem gereksinimleri sayfası (docs.endnote.com) 404 verdi; EndNote'ta İSNAD stilinin bulunup bulunmadığı
  resmî belgeden doğrulanamadı ve sayfada "doğrulanamadı" diye yazıldı.
- "Hukuk Atlası: Makale ve Tez Yazım Rehberi" Word belgesi depoda yok; içerik ondan aktarılmadı (Tarık'tan istek,
  raporda).
