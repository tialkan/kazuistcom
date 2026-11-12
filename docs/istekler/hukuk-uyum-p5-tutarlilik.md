# İstek: hukuki metinlerle ürün arasındaki kalan tutarsızlıklar (review.md P5)

Kimden: hukuk-uyum (P5, 12 Kasım 2026). Kime: on-yuz, kalite-guvenlik, kimlik, odeme, altyapi, mimar, orkestra,
casuist ve seo. `packages/contracts` ve `packages/db` değişikliği istenmiyor (madde 6 yalnız açıklama satırı).
Aciliyet: madde 1 yayın ön koşuludur (ödeme adımı onsuz açılmaz); diğerleri yayından önce.

## 1. on-yuz: ön bilgi ayrıştırıcısı liste okumalı (engelleyici)

`apps/web/src/app/(kabuk)/_hukuki/md.ts` `onBilgi` yalnız düz `anahtar: değer` satırı okuyor. `pdf_fields: [A, B]`
eklenirse değer dize olarak döner, `LegalFrontMatter` (dizi bekler) hata verir ve `hukukiMetinler()` bütün hukuki
sayfaların derlemesini kırar. Öte yandan `legal-presentation.ts` ve `createLegalSnapshot` `pdf: true` ve dolu
`pdf_fields` şart koşuyor; bu yüzden bugün ödeme adımı hukuki metni hiçbir ortamda gösteremez ve ödeme açılmaz.
İstenen: `onBilgi` YAML akış dizisini (`[A, B, C]`) okusun (mimar yönlendirmesi `mimar-yonlendirme-2-on-yuz-hukuk-uyum.md`
madde 1 ile aynı). Bu birleşince hukuk-uyum üç dosyaya şu alanları ekler:

- `on-bilgilendirme.md`: `pdf: true`, `pdf_fields: [AYLIK_KREDI, INDIRIM, KREDI, ODEME_DONEMI, TUTAR_TL, URUN_ACIKLAMASI, URUN_ADI, URUN_TURU]`
- `mesafeli-satis.md`: `pdf: true`, `pdf_fields: [ALICI_AD, ALICI_EPOSTA, SIPARIS_TARIHI, TUTAR_TL, URUN_ADI]`
- `abonelik.md`: `pdf: true`, `pdf_fields: [ALICI_AD, ALICI_EPOSTA, AYLIK_INDIRIM_TL, AYLIK_KREDI, AYLIK_LISTE_FIYATI_TL, DONEM_BASLANGIC, DONEM_BITIS, ODEME_DONEMI, PLAN_ADI, SOZLESME_TARIHI, TUTAR_TL, YILLIK_TUTAR_TL]`

## 2. on-yuz ve kalite-guvenlik: topluluk belgesi (ADR-0031)

`content/hukuki/tr/topluluk.md` artık yalnız "uygulanmaz" notudur. Aynı PR'da:

- on-yuz: `apps/web/src/app/(kabuk)/_kabuk/rotalar.ts` `hukukiBelgeler` listesinden `'topluluk'`, `packages/i18n/tr/ortak.json`
  `hukuki.belge.topluluk` anahtarı (review.md P3 madde 3).
- kalite-guvenlik: `tests/e2e/adresler.ts` `HUKUKI_TR` listesinden `'topluluk'` (yoksa e2e "renders, carries a version"
  testi bu adresi arar).
- hukuk-uyum (ya da birleştirmede orkestra): `content/hukuki/tr/topluluk.md` silinir.

Bu üç değişiklik ayrı ayrı birleşirse e2e kırılır; birlikte birleşmeli.

## 3. kimlik: yaş beyanı kayıt kutusunda

`content/hukuki/tr/kosullar.md` madde 4 ve `gizlilik.md` madde 6, 18 yaş beyanını koşulların kabulüne bağladı. Kutu
metni (`packages/i18n/tr/hesap.json` `riza`) yaşı söylemiyor. Önerilen metin: "{kosullar} okudum ve kabul ediyorum;
18 yaşını doldurdum. {aydinlatma} okudum." Metin değişirse `kullanim_kosullari` onayının sürümü aynı kalır
(sürüm metnin değil koşulların sürümüdür).

## 4. odeme

- `packages/ledger/src/billing/contract-doc.ts` `DOC_FIELDS['on-bilgilendirme']` içinden `IOS_SURUM` çıkarılabilir;
  `on-bilgilendirme.md` 2026-11-12.1 sürümünde bu alan yok (form yalnız web satışında; `orderFields` değeri `'Web'`
  idi ve "iOS Web ve üzeri" diye okunuyordu).
- Ön bilgilendirme formu cayma bildirimini e-postaya yönlendiriyor; hesap sayfasında iade talebi bağlantısı eklenirse
  hukuk-uyum metni günceller (review.md P8 madde 3).

## 5. altyapi

- `docs/runbook/izleme.md:3` "kendi sunucumuzda (aktarım yok, plan 5.5)": sunucu Hetzner AB'dedir; aktarım dayanağı
  `docs/kvkk/aktarim.md`. Cümle "Hetzner'daki kendi sunucumuzda; aktarım dayanağı uygulama sunucusuyla aynı" olmalı.
- `docs/runbook/yedek.md:9` "Türkiye'de ikinci sağlayıcıda": yedek sağlayıcısı seçilmedi (review.md T9). Seçim
  yapılınca hukuk-uyum `aktarim.md`'ye satırı yazar; yurt dışındaysa ayrı Standart Sözleşme 2 gerekir.
- `docs/runbook/izleme.md:11` Umami'yi "Çerezsiz analitik" diye anlatıyor; `cerezler.md` analitiği açık rızaya
  bağlıyor. Umami kurulmadan önce çerez ve yerel depolama kullanıp kullanmadığı yapılandırmadan yazılsın; hukuk-uyum
  çerez politikasını ona göre düzeltir.
- Log saklama süresi (YZ meta veri satırları dahil) yazılsın; envanter satır 18'de açık.

## 6. mimar

- `packages/db/src/schema/billing.ts` `orderLegalDocuments` açıklaması "stay in the restricted Turkish database"
  diyor; ADR-0033 ile veri tabanı Hetzner AB'dedir. Yalnız açıklama satırı.
- Önerilen saklama süreleri `docs/kvkk/envanter.md` tablosunda; Tarık onayından sonra `retention.sweep` iş türü
  (önceki yönlendirme `mimar-yonlendirme-hukuk-uyum.md` madde 3).

## 7. orkestra (plan.md)

- Plan 5.5 aktarım envanteri tablosunun ilk satırı "Uygulama, veri tabanı, depo, yedek: Türkiye, aktarım yok" diyor;
  ADR-0030 ve ADR-0033 ile yanlış. `docs/kvkk/aktarim.md` tablosuyla eşitlenmeli.
- Plan 11 tablosundaki "Topluluk kuralları (Kampüs)" satırı ADR-0031 ile düşer.

## 8. casuist ve seo: kaldırma talebi bağlantısı

Kayıt sayfası rotası açılınca (review.md P6 madde 3) her kararda "Kaldırma talebi" bağlantısı olmalı (plan 11, FR-79).
Bugün `kaldirma.md` yalnız e-posta yolunu yazıyor; bağlantı eklenince hukuk-uyum metni günceller.
