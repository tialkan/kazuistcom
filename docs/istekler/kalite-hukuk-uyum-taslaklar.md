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

(hukuk-uyum dolduracak)
