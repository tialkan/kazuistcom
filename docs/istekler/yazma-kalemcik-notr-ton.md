# Yazma: Kalemcik nötr ton için ayrı yüz gerekmiyor

Tarih: 13 Kasım 2026. Yazan: yazma ajanı. Cevapladığı soru: `docs/istekler/on-yuz-p4-gorsel-varliklar.md` "yazma"
bölümü ("`content/kalemcik.yaml` dört ton tanımlıyor; plan 12 madde 8 beşinci olarak nötr sayıyor. Nötr ton için ayrı
Kalemcik yüzü gerekiyor mu?").

## Cevap

Hayır. Çizer brifingine beşinci ifade eklenmez; Kalemcik yüzü dört ifade olarak kalır (`gulen`, `dusunceli`, `uzgun`,
`kutlama`).

## Gerekçe

1. Nötr, bir ilerleme durumu değildir. Ekrandaki ton `ozetle()` içinde yalnız dört değerden biri olur (`iyi`, `son7`,
   `yazilmadi`, `hedef`; FR-54). Beşinci bir ton için kural tanımlanamaz: ilerleme verisi varken her durum bu dördünden
   birine düşer ve nötr bir ilerleme eşiği yoktur.
2. Nötr olması gereken anlar, ilerleme verisi olmayan anlardır: proje yok, özet yükleniyor ya da özet yok. Bugün
   `Kalemcik.tsx` bu anlarda `iyi` tonuna düşer ama mesaj göstermez (`kocMesaji` boştur). Nötr görünüm, yüzün ifadesiz
   değil sakin olmasıdır; mevcut `dusunceli` yüzünün düz ağzı (iki nokta göz, tek çizgi ağız) tam olarak budur.
3. Yeni bir yüz, çizerden bir çizim daha ve bir erişilebilir ad daha demektir; bunun getirisi yok. Suçlayıcı ya da
   baskıcı olmayan sakin bir yüz zaten `dusunceli`.

## Uygulama (yazma ajanı, kod bu PR'da değişmedi)

- Kalemcik'in proje olmayan ve yükleniyor durumlarında `KalemcikYuzu` `dusunceli` ile çizilir, mesaj satırı gösterilmez.
  Bu, `apps/web/src/app/kalemcik/` içinde küçük bir değişikliktir ve bir sonraki yazma işiyle yapılır.
- `docs/tasarim/gorsel-istemleri.md` 4.7 tablosu dört ifadeyle doğrudur ve değişmez.

## Plan metni (mimar ve orkestra için)

Plan 12 madde 8 "beş ruh hâli (... nötr)" diyor. Önerilen düzeltme: "dört ton (iyi gidiyor, son 7 gün, yazılmadı, hedefe
ulaşıldı) ve ilerleme verisi olmayan anlarda sakin yüz". `plan.md` yazma ajanının yolu değildir; değişikliği orkestra ya
da mimar yapar. Düzeltme yapılmazsa da bu belge geçerli yorumdur: beşinci ruh hâli ayrı bir yüz çizimi gerektirmez.

## Aciliyet

Çizer işini bekletmez; çizer yalnız dört yüz çizer.
