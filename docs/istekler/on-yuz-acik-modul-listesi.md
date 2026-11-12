# İstek: "yakında" düzeneğinin artıklarını kaldırma

1. İsteyen: on-yuz, dal `codex/on-yuz-kabuk-oturum`. Kime: seo, icerik, orkestra.
2. Gerekçe: ADR-0033 ve review.md T2 kararıyla bütün modüller tek seferde açılır; kapalı modül yoktur. on-yuz bu
   dalda `ModulBagi`, `OrnekSoru`, `.modul-kapali` stilleri ve `ortak.json` `gezinme.yakinda` anahtarını sildi.
   `apps/web/src/app/(kabuk)/_kabuk/rotalar.ts` içindeki `acikModuller` ve `modulAcik` artık elle tutulan bir
   liste değildir; `moduller` dizisinden türetilir ve `@deprecated` işaretlidir. Yalnız aşağıdaki çağıranlar
   kaldığı için silinmedi; davranış değişmedi (altı modül zaten açıktı).
3. Yapılacaklar (her biri kendi sahibinde):
   - seo, `apps/web/src/app/(seo)/_seo/adresler.ts:4,61,62`: `acikModuller` yerine `moduller.map((m) => m.href)`;
     `modulAltSayfalari.filter((s) => modulAcik(s.modul))` süzgeci kaldırılır (her modül açık).
   - icerik, `apps/web/src/app/rehberler/_bilesen/metin.ts:2,21,24`: `baglantiAcik` ve `aramaAcik` her zaman
     doğrudur; işlevler ve çağrıları sadeleşir. `rehberler.test.ts:6,181,182` ve `sayfalar.test.tsx:5,43,68,69`
     içindeki `modulAcik` ve `acikModuller` denetimleri `moduller` ile ya da doğrudan bağlantı varlığıyla yazılır.
   - orkestra, `apps/web/test/seo.test.ts:4,211-212`: döngü `moduller` üzerinden kurulur.
   - orkestra, kök `review.md:67-69` ve P3 madde 1: "yakında düzeneği Faz 1'de gerekecek" notu artık geçersiz.
4. Bu üç değişiklik birleşince on-yuz `acikModuller` ve `modulAcik` dışa aktarımlarını siler.
5. Kabuk oturumu (docs/istekler/kimlik-p7-kabuk-oturum.md) aynı dalda karşılandı: `Kabuk` isteğe bağlı
   `oturum?: KabukOturumu | null` alır; verilmezse Hedefim alanı oturumu kendisi okur. Kök layout değişmeden
   çalışır; layout oturumu başka bir amaçla zaten okursa `<Kabuk oturum={...}>` ile verebilir.
6. Aciliyet: düşük; derleme ve davranış etkilenmiyor.
