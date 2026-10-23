# İstek: hukuki taslakları onaya hazır hale getirmek

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: hukuk-uyum. Kaynak: docs/kalite/dalga-1.md
O-04 (orta), kapı maddesi 9. Aciliyet: Dalga 1 sonu Tarık onay noktası (plan 17.4) ve 1E erken geçiş.

## Gözlenen

1. `content/hukuki/README.md`: "`[DOĞRULANACAK: ...]` işaretleri onaydan önce kapatılır." Açık işaret 24:
   aydinlatma 1 (RG tarih ve sayı), abonelik 1, gizlilik 2, basvuru 2, cerezler 4, kosullar 5,
   mesafeli-satis 2, iade-ve-kredi 2, yapay-zeka 1, topluluk 1, on-bilgilendirme 2, en/ai 1. Bunlardan 3'ü
   Tarık kararı (gizlilik ve kosullar yaş sınırı, kosullar süre); diğerleri birincil kaynakla (mevzuat.gov.tr,
   kvkk.gov.tr, eur-lex, yok.gov.tr) kapatılabilir.
2. Künye 2026-10-20'de onaylandı (docs/kararlar.md: MERSİS, Ankara Ticaret Sicili, adres; kaynak mevcut
   sitenin /tr/hakkinda sayfası; `apps/web/src/app/(kabuk)/_kabuk/kunye.ts` `dogrulandi: true`). Metinlerde
   hâlâ yer tutucu: `uyari.md` {{TAM_UNVAN}}, {{MERSIS}}, {{SICIL}}, {{ADRES}}, {{VERGI_DAIRESI}}, {{VKN}},
   {{KEP}}, {{TELEFON}}; `aydinlatma.md`, `on-bilgilendirme.md`, `mesafeli-satis.md`, `abonelik.md`
   {{MERSIS}}, {{ADRES}}. Onaylanmayan alanlar (VKN, vergi dairesi, KEP, telefon) Tarık'a tek listede sorulmalı.
3. `cerezler.md:23` "[DOĞRULANACAK: kimlik ajanından]" için ölçüm: üretim derlemesinde oturum çerezi adı
   `kazuist.session_token` ön ekli (Better Auth `cookiePrefix: 'kazuist'`, üretimde `__Secure-` ön eki),
   HttpOnly, SameSite=Lax, Path=/, üretimde Secure; ömür 30 gün (`auth.ts` `expiresIn`). Analitik çerezi yok.

## İstenen

Birincil kaynakla kapatılabilen işaretlerin kapatılması, onaylı künyenin işlenmesi, Tarık'a kalan kararların
tek listesi (alan adı, metin ve satır ile).

## Doğrulama

`grep -c "DOĞRULANACAK" content/hukuki/*/*.md` yalnız Tarık kararı kalanları göstermeli; `uyari.md`'de künye
yer tutucusu kalmamalı.

## Sonuç

hukuk-uyum, dal dalga-1/hukuk-uyum/kapi, 2026-10-22.

- Künye işlendi: unvan, MERSİS 0591095454600001, Ankara Ticaret Sicili 550123, adres, iletişim
  kulularteknoloji@gmail.com. Yer tutucu kalanlar (Tarık): content/hukuki/tr/uyari.md {{VERGI_DAIRESI}}, {{VKN}},
  {{KEP}}, {{TELEFON}}; aynı alanlar en/notice.md, tr/on-bilgilendirme.md (KEP, TELEFON), tr/basvuru.md (KEP).
- [DOĞRULANACAK]: 24'ten 7'ye indi. Birincil kaynakla kapananlar: Aydınlatma ve Başvuru Tebliğleri (RG 10/3/2018,
  30356; Başvuru Tebliği m.5), 6502 m.48, 52, 68, 73, 73/A, Mesafeli Yön. m.12 (2022 değişikliği) ve m.20/1, TBK m.115,
  FSEK m.31 ve ek m.8, Anthropic saklama süreleri, Gemini koşulları, oturum çerezi (bu isteğin 3. maddesi).
  Varsayılan kararlarla kapananlar: yaş sınırı 18 ve yaş beyanı, abonelikte ilk dönem 14 gün tam iade, hesap silme
  14 gün bekleme. Kalanlar (kaynağıyla): cerezler 2 (Kurum rehberi tarihi yalnız ikincil kaynakta; tercih çerezi
  henüz uygulanmadı), gizlilik 1 (VUK ve TTK süreleri, mali müşavir), iade-ve-kredi 1 (2015 sonrası değişiklik
  taraması), on-bilgilendirme 1 (Tüketici Bilgi Sistemi adresi), yapay-zeka 1 (AB YZ Tüzüğü, eur-lex yanıt vermedi),
  topluluk 1 (YÖK Yönergesi resmî metni yok.gov.tr'de bulunamadı).
- Tarık'a kalan kararlar: kosullar.md madde 10 değişiklik bildirim süresi (30 gün varsayılan); ADR-0024 yıllık iade
  formülü.
