# İstek: dar çekirdekli ilk yayının kayda geçirilmesi

Kimden: on-yuz (dal on-yuz/dar-cekirdek-yayin). Kime: mimar, altyapi, pratik, yazma, atif-agi, kimlik.

Tarık'ın kararı (orkestra aktardı, 15 Kasım 2026): ilk yayın dar çekirdektir; Ara ve kaynaklı özet, Kaydettiklerim,
Yazma (şablon ve kısaltma), Rehberler ve /tespit. Onaylı içeriği olmayan modül üretimde gösterilmez. Karar tek
dosyadadır: `apps/web/src/app/(kabuk)/_kabuk/yayin.ts`.

## mimar

- ADR-0033 "her modül yayında açılır" diyor; bu karar onu daraltıyor. Yeni bir ADR ile kayda geçirilmesi gerekir
  (gerekçe: onaylı içerik yok; geri dönüş: `KAZUIST_MODULLER` ya da `ertelenenModuller` listesinden çıkarma).
- `.env.example` içine şu satır eklenmeli (değer boş bırakılır):
  `KAZUIST_MODULLER=` ve açıklaması: "Üretimde ertelenen modüllerden açılacaklar, virgülle: pratik,kalemcik,atif-agi
  ya da hepsi. Üretim dışında her modül zaten açıktır."

## altyapi

- Üretimde `KAZUIST_MODULLER` tanımlanmaz; varsayılan dar çekirdektir. Kural güvenli tarafta kapanır:
  `NODE_ENV=production` olan her derlemede, `KAZUIST_ENV` `development` ya da `test` değilse üç modül gizlenir
  (`KAZUIST_ENV` unutulsa da). Web imajında `KAZUIST_ENV` şu an tanımlı değil; SEO açılışı için zaten
  `KAZUIST_ENV=production` gerekir (ADR-0023), runbook'a web için de yazılmalı.
- Yerel üretim derlemesinde ertelenen modülleri görmek için `KAZUIST_ENV=development` verilir (ör. pratik ve atıf
  ağı `_kanit` betikleri).

## pratik, yazma (kalemcik), atif-agi

- `apps/web/src/app/{pratik,kalemcik,atif-agi}/layout.tsx` eklendi: üretimde modül kapalıyken `notFound()`.
  `yazma/page.tsx` Kalemcik kartını yalnız modül görünürken gösterir. API uçları (`/api/v1/decks`,
  `/api/v1/citation-network`, `/api/v1/records/[id]/network`, `/api/v1/writing-projects`) açık kaldı; kapatılması
  istenirse aynı `modulGorunur()` ile yapılabilir.
- Pratik açılırken: `KAZUIST_MODULLER=pratik` ve `apps/web/public/llms.txt` satırı geri eklenir
  (`apps/web/test/seo.test.ts` gizli modül bağlantısını yakalar).

## kimlik

- `notify/dispatch.ts` ve `billing/notice-text.ts`: `/hesap/cuzdan` sayfası yok; ödeme ve fesih bildirimleri `/hesap`
  adresine yönlendirildi. Cüzdan sayfası yapılırsa yol geri alınır; `apps/web/test/baglantilar.test.ts` kırık iç
  bağlantıyı yakalar.
- Kalemcik bildirimleri `/kalemcik` adresine gider. Üretimde proje yalnız `/kalemcik` sayfasından oluşturulduğu için
  bu bildirim oluşmaz; modül açılınca bağlantı çalışır.
