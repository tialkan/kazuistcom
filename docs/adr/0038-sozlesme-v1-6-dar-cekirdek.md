# ADR-0038: Sözleşme v1.6 (yeni kaynak iş yükleri, edu.tr tekilliği, arama ve özet alanları) ve dar çekirdekli ilk yayın

- Tarih: 2026-11-15
- Karar kodu: yok (plan 17.3/4; plan 6.1, 8.1, 8.5, 10.1/3)
- İstekler: `docs/istekler/veri-toplama-ingest-payloadlari.md`, `docs/istekler/kimlik-edu-tekil.md`,
  `docs/istekler/casuist-arama-kalitesi.md` (madde 1), `docs/istekler/yz-gecidi-soru-denetim-karakteri.md`,
  `docs/istekler/yz-gecidi-byok.md`, `docs/istekler/anonimlestirme-ner-zorunlu.md`,
  `docs/istekler/on-yuz-dar-cekirdek-yayin.md`
- Durum: Önerildi (15 Kasım 2026). Sözleşme ve şema kısmı yalnız ekler, yıkıcı adım yoktur. Dar çekirdek kararı
  (Karar madde 8) Tarık'ındır; orkestra 15 Kasım 2026'da mimara aktardı. Bu ADR o kararı kayda geçirir; metnin
  Tarık tarafından onaylanması beklenir.
- İlgili kararlar: ADR-0012 (veri edinimi), ADR-0023 (iş kuyruğu sözleşmesi), ADR-0033 (tek seferde yayın; madde 5
  bu ADR ile daralır), ADR-0035 (sözleşme v1.5, iş yükü doğrulaması), ADR-0036 (kaldırıcı adım, yazılmadı),
  ADR-0037 (embedding modeli)

## Bağlam

15 Kasım 2026'ya kadar yedi istek birikti:

1. veri-toplama AYM, Yargıtay ve Danıştay bağlayıcılarını, liste sayfasından belge işi üreten keşif işlerini ve bir
   toplama zamanlayıcısını yazdı (PR #105). Kuyruk tüketicisi (`core/jobs.py`, sözleşme `IngestFetchPayload`) yeni yük
   biçimlerini tanımadığı için bu işleri `invalid payload` diye gömüyordu; zamanlayıcı onları `contract_pending` diye
   atlıyordu. Plan 6.1 Yargıtay ve Danıştay için "toplu çekme için protokol başvurusu" der; başvuru yapılmadı ve
   `protocol_status` enum'unda bu durumun karşılığı yoktu.
2. kimlik, aynı edu.tr posta kutusunun birden çok hesapta doğrulanabildiğini buldu (günlük ücretsiz özet 2'den 5'e
   çıkar, plan 4 ve 10.1/3); kodla kapattı ve veri tabanı güvencesi istedi.
3. casuist arama yanıtına isteğe bağlı `degraded` alanını yazıyor; alan sözleşmede yoktu.
4. yz-gecidi, kaynaklı özet sorusundaki denetim karakterlerini uç kodunda reddediyor; kural sözleşmede yoktu.
5. yz-gecidi, BYOK istemci modunda `POST /v1/answers/prepare` gövdesinin arama süzgeçlerini taşımadığını yazdı.
6. anonimleştirme ve on-yuz `.env.example` satırları istedi (`KAZUIST_ENV`, `KAZUIST_NER_BACKEND`,
   `KAZUIST_MODULLER`); zamanlayıcının değişkenleri de belgelenmemişti.
7. on-yuz, Tarık'ın dar çekirdekli ilk yayın kararının ADR-0033'ü daralttığını ve kayda geçmesi gerektiğini yazdı.

## Karar

### 1. Sürüm

`packages/contracts` ve `packages/db` 1.6.0 (`openapi.yaml` `info.version`, `CONTRACT_VERSION`, iki
`package.json`). Migration `0008_v1_6_edu_claims_protocol_status.sql` yalnız ekler: bir enum değeri, iki fonksiyon,
bir tablo, iki dizin, bir tetikleyici ve bir geri doldurma. `edu_verifications` satırları yalnız okunur. Önceki
migration'lar değişmedi.

ADR-0035 ve `docs/istekler/README.md` kaldırıcı adım B için "ADR-0036, migration 0008" diyordu. 0008 numarası bu ek
migration'a geçti; kaldırıcı adım ADR-0036 numarasını korur, migration'ı o gün sıradaki boş numarayı alır.

### 2. `ingest.fetch` yeni yük biçimleri (veri-toplama isteği, değiştirerek kabul)

`IngestFetchPayload` artık `z.union`'dır, çünkü beş kaynağın bir liste ve bir belge biçimi vardır ve `source` tek
başına ayırıcı değildir. Hepsi `strictObject`; yükler yalnız kimlik taşır (numara, tarih, birim adı, kamuya açık sayfa
adresi), taraf adı ya da karar metni taşımaz. Eklenen biçimler:

- `kvkk` ve `rekabet` liste sayfası: `{source, page}`; mevcut `{source, url}` biçimleri korunur.
- `aym` liste sayfası `{source, kararTipi, page}` ve tek karar `{source, kararTipi, id}`; `kararTipi`
  `BireyselBasvuru` ya da `NormDenetimi` (`aymDecisionTypes`).
- `yargitay` ve `danistay` (`courtSources`) liste sayfası `{source, unit, year, page}` ve tek karar
  `{source, id, unit, esas, karar, date}`.
- Sayfa 1 ile 10.000 arası tam sayı (`INGEST_MAX_PAGE`, `core/discovery.py` `MAX_PAGE` ile aynı), yıl 1900 ile 2100,
  birim adı 1 ile 100 karakter, Yargıtay ve Danıştay belge kimliği 1 ile 20 ASCII rakam, tarih `z.iso.date()`.

İstekten iki sapma, ikisi de üreticinin gerçekte yazdığı biçime göre:

- AYM kimliği `z.uuid()` değil `z.guid()` ile denetlenir. Kararlar bankasının kimlikleri 8-4-4-4-12 onaltılık
  dizgedir ama RFC 9562 UUID değildir: `services/worker-py/tests/fixtures/aym/bb-liste.json` içindeki
  `817f0b47-acf1-0404-...` kimliğinde sürüm hanesi 0, varyant hanesi 3'tür. `z.uuid()` bu kimlikleri reddeder; istekteki
  biçim kabul edilseydi AYM belge işlerinin bir kısmı gömülürdü.
- Esas ve karar numarası `connectors/judicial.py` `case_number` ile aynı biçimdedir: `2024/817`, `2019/1-123` ve
  sonda isteğe bağlı `/<rakam>`; en çok 50 karakter; yalnız ASCII rakam (`[0-9]`; Python'da `\d` Unicode rakamları da
  eşlerdi). İstekteki desen sondaki parçayı kabul etmiyordu; bağlayıcı o numaraları listeden okuyup kuyruğa yazar.
  `core/discovery.py` `_CASE_NO` hâlâ dar biçimdedir; uyumu veri-toplama yapar (yönlendirme).

Python tarafı (`services/worker-py/core/jobs.py` `_ingest_fetch`) aynı biçimleri bağımlılıksız denetler; iki taraf
`packages/contracts/test/fixtures/job-payloads.json` ortak fikstürüyle sınanır (10 yeni geçerli, 21 yeni geçersiz
örnek). `services/worker-py/tests/test_jobs.py` sözcük listelerini (`aymDecisionTypes`, `courtSources`,
`INGEST_MAX_PAGE`) sözleşme dosyasıyla karşılaştırır.

Sonuç: zamanlayıcı (`core/scheduler.py`) ek değişiklik olmadan bu işleri kuyruğa almaya başlar; `contract_pending`
düzeneği ileride eklenecek biçimler için kalır. Kuyruğa alma yine anahtara, kesiciye, gece penceresine ve üretimde
kaynak onayına (`tarik_onayi: onaylandi`) bağlıdır; üç yeni kaynak bugün `tarik_onayi: bekliyor`dur, yani üretimde
hiçbir şey çalışmaz.

### 3. `protocol_status` değeri `gerekli_yapilmadi`

Enum'a `gerekli_yapilmadi` eklendi (sona; `ALTER TYPE ... ADD VALUE`). İstek `gerekli` adını önermişti. Seçilen ad,
`docs/kaynaklar/<kaynak>.md` dosyalarındaki `protokol_durumu: gerekli_yapilmadi` ile aynı sözcüktür; böylece
`core/sources.py` değeri eşlemesiz kayda yazabilir ve başvuru yapıldığında `basvuruldu`'ya geçişte anlam karışmaz.
Kayıtlar, veri-toplama `RECORD_PROTOCOL_STATUSES` listesine değeri ekleyene kadar bugünkü gibi `gerekmez` ile yazılır
(yönlendirme). Değer sözleşmede (`openapi.yaml`) görünmez; `protocol_status` bugün yalnız veri tabanındadır.

### 4. edu.tr posta kutusu başına tek hesap (kimlik isteği, A seçeneği tetikleyiciyle)

- `edu_mailbox(text)` SQL fonksiyonu (IMMUTABLE): kırpar, küçültür, sondaki noktaları ve yerel kısımdaki `+etiket`i
  atar. Kimliğin `normalizeEduEmail` kuralı ve onun SQL biçimiyle aynıdır.
- `edu_claims (email birincil anahtar, user_id, verified_at)`: posta kutusu başına tek satır; CHECK yalnız
  `edu_mailbox` biçimindeki adresi kabul eder. `verified_at`, sahibin o posta kutusu için en yeni doğrulamasıdır.
- Tablo yalnız `edu_verifications_claim` tetikleyicisiyle (`edu_claims_sync`) yazılır. `edu_verifications`'ta
  doğrulanmış olan ya da doğrulanan bir satır, posta kutusunu kendi hesabına alır; posta kutusu başka hesaptaysa deyim
  SQLSTATE 23505 (`unique_violation`, kısıt `edu_claims_pkey`) ile düşer ve mesajda adres yoktur. Sahibin o posta
  kutusundaki son doğrulanmış satırı silinince ya da `verified_at`'i boşaltılınca talep kalkar. Tetikleyici yalnız
  `user_id`, `email` ve `verified_at` değişikliklerinde çalışır (`attempts` güncellemesi çalıştırmaz).
- Bu yüzden kural kimlik kodunu değil, `edu_verifications`'a yazan her yazıcıyı (yönetici aracı, betik, ileride iOS
  ucu) bağlar. İstekteki A seçeneğinde talebi kimlik kodu yazacaktı; o zaman talep yazmayan bir yazıcı kuralı yine
  atlayabilirdi. Birincil anahtar yalıtım düzeyinden bağımsız çalışır; kimliğin danışma kilidi gereksiz olmaz ama
  artık tek güvence değildir.
- `users`'a yabancı anahtar yoktur, bilerek: talep `edu_verifications` satırlarını izler; `account.purge` o satırları
  siler (`purgeSteps`), bir `users` silmesi onlara cascade eder ve tetikleyici talebi kaldırır. `users`'a bağlı yeni bir
  yabancı anahtar, `purge.ts`'e ikinci bir silme adımı ve `purge-integration.test.ts`'in "her users yabancı anahtarı
  işlenir" denetiminde yeni bir satır gerektirirdi; yasal saklamada `users` satırı mezar taşı olarak kaldığında da
  adres tabloda kalırdı.
- `edu_verifications_user_idx (user_id)`: tetikleyici ve `account.purge` satırları kullanıcıya göre arar.
- Seçilmeyenler: B (ifade üzerinde kısmi tekil dizin) yıllık yenilemede aynı kullanıcının ikinci doğrulanmış satırını
  da reddeder ya da `(ifade, user_id)` ile iki kullanıcıyı ayırmaz; tek başına yetmez (istekteki gerekçe). `btree_gist`
  ile dışlama kısıtı (`EXCLUDE USING gist (edu_mailbox(email) WITH =, user_id WITH <>) WHERE verified_at IS NOT
  NULL`) tablo eklemeden aynı güvenceyi verirdi, ama yeni bir uzantı ister ve PGlite kuran her test düzeneğine (bugün
  19 dosya, altı sahip) uzantı yüklemesi eklenmesi gerekirdi.
- Geri doldurma (istek madde 4): her posta kutusunu en eski doğrulaması olan hesap alır; talebin tarihi o hesabın en
  yeni doğrulamasıdır. Aynı posta kutusunu sonradan doğrulamış diğer hesapların satırları ve `profiles.edu_verified`
  değerleri değişmez (karar Tarık'ın); migration onların sayısını adres içermeyen bir `WARNING` ile yazar. Liste
  (yalnız kimlikler):

  ```sql
  select distinct v.user_id, c.user_id as claimed_by
  from edu_verifications v join edu_claims c on c.email = edu_mailbox(v.email) and c.user_id <> v.user_id
  where v.verified_at is not null;
  ```

  Bugün üretim yoktur; geri doldurma yerel ve CI verisinde çalışır, sonucu boştur.
- Bilinen sınırlar: posta kutusu sahibinin satırları silinince talep, aynı posta kutusunda satırı kalan eski bir hesaba
  devredilmez (yukarıdaki listede kalan hesaplar); bu durumda o hesap bir sonraki yenilemede talebi alabilir.
  `lower()` ASCII dışı harflerde veri tabanı harmanlamasına bağlıdır; edu.tr adresleri pratikte ASCII'dir.
- Uç (`/v1/me/edu-verification`) ve sözleşme değişmedi. Kimlik `claimedByOther` denetimini `edu_claims` üzerinden
  sadeleştirir ve 23505'i `hata.eduKullanimda`'ya eşler (yönlendirme).

### 5. `SearchResponse.degraded` (casuist isteği madde 1, değiştirerek kabul)

`GET /v1/search` yanıtına isteğe bağlı `degraded` dizisi (`minItems: 1`; yalnız boş değilken yazılır). Bilinen değer
`vektor`dur (gömme servisi ya da modeli yok). İstekten sapma: öğeler `enum: [vektor]` değil, açık liste (`type:
string`, `examples: [vektor]`); istemciler tanımadıkları değeri görmezden gelir. Gerekçe: bu bir yanıt alanıdır ve
ileride başka bir getirme kolu (ör. canlı federasyon) eklendiğinde kapalı enum her istemci için kırıcı değişiklik
olurdu; ayrıca `packages/casuist/src/api.ts` alanı `string[]` olarak yazıyor ve kapalı enum o dosyayı derlemede
kırardı. Zod tarafında `SearchResponse` şeması yoktur, değişiklik yalnız OpenAPI'dedir; üretilen istemci tipi artık
alanı bilir.

### 6. Kaynaklı özet sorusunda denetim karakteri (yz-gecidi isteği, kabul)

`QuestionText` (`AnswerRequest.q` ve `PrepareRequest.q`): 3 ile 1000 karakter ve C0 denetim karakterleri (sekme,
satır sonu ve satır başı hariç) ile DEL yok. OpenAPI'de ortak `QuestionText` şeması
`pattern: '^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$'` taşır; zod deseni (`QUESTION_TEXT_PATTERN`) aynıdır ve
test ikisini her denetim karakterinde karşılaştırır. Uçlar bu soruları zaten 400 ile reddediyordu; kablo davranışı
değişmez. `SearchQuery.q`'ya kural eklenmedi: arama sorgusu iç ayırıcı kullanmaz ve kural bugün kabul edilen sorguları
reddeden bir davranış değişikliği olurdu.

### 7. BYOK hazırlıkta arama süzgeçleri (yz-gecidi isteği madde 1, kabul)

`AnswerFilters` (tür, tarih aralığı, mahkeme) zod ve OpenAPI'de tek şemadır; `AnswerRequest.filters` ve yeni
`PrepareRequest.filters` onu kullanır. Alan isteğe bağlıdır; mevcut istemciler etkilenmez.

### 8. Dar çekirdekli ilk yayın (ADR-0033 madde 5'in daraltılması)

Tarık'ın kararı (orkestra aktardı, 15 Kasım 2026): ilk yayın dar çekirdektir. Üretimde açık olanlar: Ara ve kaynaklı
özet, Kaydettiklerim, Yazma (şablon ve kısaltma), Rehberler ve `/tespit`. Onaylı içeriği olmayan modül üretimde
gösterilmez; bugün ertelenen üç modül:

- Pratik: hiçbir kartın editör onayı yok (`content/desteler`, plan 10.6); üretim 0 kart sunar.
- Kalemcik: onaylı mesaj seti yok ve çekirdeğin parçası değil.
- Atıf ağı: üretim verisi yok (yalnız örnek ağ).

Uygulama tek dosyadadır: `apps/web/src/app/(kabuk)/_kabuk/yayin.ts` (on-yuz, PR #103). Üretimde ertelenen modül sekme
çubuğundan, alt bilgiden, ana sayfadan ve site haritasından çıkar; altındaki her sayfa 404 döner. Kural güvenli tarafta
kapanır: `NODE_ENV=production` olan her derleme, `KAZUIST_ENV` `development` ya da `test` demedikçe üretim sayılır.

- Geri dönüş: modülün içeriği onaylanınca `KAZUIST_MODULLER` ile (virgülle `pratik`, `kalemcik`, `atif-agi` ya da
  `hepsi`; istek anında okunur, yeniden derleme gerekmez) ya da kalıcı olarak `ertelenenModuller` listesinden
  çıkararak; `apps/web/public/llms.txt` satırı geri eklenir.
- ADR-0033 madde 5 ("1.0 modüllerinin hepsi aynı gün açılır") bu ADR ile daralır: yayın yine tek seferdir ve fazlara
  bölünmez, ama kapsamı dar çekirdektir; ertelenen modüller sonradan, içerik onayıyla ve bir yayın olayı gerektirmeden
  açılır. ADR-0033'ün diğer maddeleri ve "Yayının ön koşulları" bölümü değişmez. Dar çekirdek de hesap ve kaydı ilk
  günden açtığı için KVKK m.9 ön koşulu (ADR-0033 ön koşul 1) aynen geçerlidir.
- API uçları (`/api/v1/decks`, `/api/v1/citation-network`, `/api/v1/records/{id}/network`,
  `/api/v1/writing-projects`) sözleşmede ve çalışır durumda kalır; sözleşmede değişiklik yoktur. Kapatılmaları
  istenirse sahipleri aynı `modulGorunur()` ile yapar.
- review.md P3 madde 1'deki "yakında" düzeni geri gelmez: ertelenen modül gösterilmez, 404 döner.

### 9. Ortam değişkenleri

`.env.example` (değer yok): `KAZUIST_ENV` açıklamasına worker-py anonimleştiricinin development ve test dışında NER
istemesi, imaj öntanımının `production` olması ve web'de ertelenen modüllerin gizlenmesi; `KAZUIST_NER_BACKEND`
açıklamasına "development dışında boşsa işçi başlar ama hiçbir şey yayımlamaz"; yeni `KAZUIST_MODULLER`; zamanlayıcı
için `KAZUIST_SCHEDULER`, `KAZUIST_SCHEDULER_DRY_RUN`, `KAZUIST_SCHEDULE_TICK_SECONDS`; kaynak anahtarları
`KAZUIST_SOURCE_AYM`, `KAZUIST_SOURCE_YARGITAY`, `KAZUIST_SOURCE_DANISTAY`.

### 10. Sahiplik

`docs/sahiplik.md`: `packages/i18n/tr/byok.json` yz-gecidi'nin; `services/worker-py/tests` altındaki bağlayıcı,
çekirdek, keşif, zamanlayıcı testleri ve fikstürleri veri-toplama'nın. Var olan satırların kapsadığı yeni yollar
(`hesap/yz-anahtari`, `ai-gateway/src/byok`, AYM, Yargıtay ve Danıştay bağlayıcıları, `core` zamanlayıcısı) tarihli
notla teyit edildi; `apps/web/src/server/security-headers.ts` orkestranındır.

## Geri uyumluluk

- Veri: migration 0008 yalnız ekler. `ALTER TYPE ... ADD VALUE` işlem içinde çalışır (PostgreSQL 12+); değer aynı
  işlemde kullanılmaz. Tetikleyici, mevcut doğrulanmış satırlara dokunmaz; yalnız bundan sonraki yazımları denetler.
- İş kuyruğu: eski yükler aynı biçimde geçerlidir; yeni biçimler yalnız ekler. worker-node `ingest.fetch` tüketmez.
- API: bütün eklemeler geriye uyumludur. `degraded` ve `filters` isteğe bağlıdır; `QuestionText` deseni uçların
  zaten uyguladığı kuraldır. Üretilen istemcide `AnswerRequest.filters` artık adlandırılmış `AnswerFilters`
  şemasına başvurur (aynı biçim). iOS istemcisi henüz üretilmedi.

## Uygulama (bu PR) ve sahip işleri

- Mimar yolları: `packages/contracts/**`, `packages/db/**`, `services/worker-py/core/jobs.py`,
  `services/worker-py/tests/test_jobs.py`, `.env.example`, bu ADR, `docs/adr/README.md`, `docs/sahiplik.md`,
  `docs/istekler/README.md` ve istek sonuçları.
- Tek dokunuş başka yolda: `services/worker-py/tests/test_scheduler.py` içindeki
  `test_unknown_payload_shapes_wait_for_the_contract_but_known_ones_run` testi bu sözleşmeden önceki durumu
  sınıyordu; v1.6 ile bütün gece işlerinin sözleşmeye uyduğunu sınayan teste çevrildi.
- Taban: PR #105 (veri-toplama), #103 (on-yuz), #106, #107, #108 ve #104 birleştikten sonraki main; yeni yükleri üreten kod #105'tedir.
- Yönlendirme: `docs/istekler/mimar-yonlendirme-4-sozlesme-v1-6.md`.

## Doğrulama

PGlite (PostgreSQL 18 wasm) üzerinde v1.5 verisi olan bir veri tabanında migration 0008: geri doldurma (en eski
kazanır, satır değişmez, rapor sorgusu), başka hesabın doğrulaması 23505 ve adressiz mesaj, sahibin yenilemesi, son
satırla talebin kalkması, kullanıcı silmesinde cascade, CHECK, enum sırası ve yeni değerin yazılması. Sözleşme
testleri zod ile OpenAPI desenini her denetim karakterinde karşılaştırır. Komutlar ve sonuçlar PR açıklamasında ve
DEVIR.md'dedir.

## Sonuçlar

- Yeni kaynakların işleri kuyruktan çalışabilir; üretimde çalışmaları yine kaynak onayına bağlıdır.
- Bir edu.tr posta kutusu, hangi yazıcıdan gelirse gelsin, aynı anda yalnız bir hesapta doğrulanmış olabilir.
- İstemciler arama yanıtındaki kısıtlı aramayı, BYOK süzgeçlerini ve soru kuralını sözleşmeden okur.
- İlk yayın dar çekirdektir; ertelenen modüller içerik onayıyla, yayın olayı olmadan açılır.
- Açık: ADR-0036 (kaldırıcı adım, Tarık onayı), bu ADR'nin ve ADR-0033'ün Tarık onayı.
