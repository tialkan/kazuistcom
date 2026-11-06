# pratik: FSRS motoru ve ts-fsrs kararı

Plan 10.6/2 "FSRS (ts-fsrs)" der. Bu PR'da zamanlayıcı bağımlılıksız yazıldı
(`apps/web/src/app/pratik/_alan/fsrs.ts`) ve ts-fsrs 6.0.0 ile karşılaştırıldı.

## Neden bağımlılık eklenmedi

- ts-fsrs 6.0.0 (MIT, github.com/open-spaced-repetition/ts-fsrs) `@open-spaced-repetition/srs-kit`'e bağlıdır ve eski
  arayüzünü kullanımdan kaldırılmış olarak işaretler; arayüz yüzeyi büyük, bizim ihtiyacımız tek bir hesap.
- Kök kilit dosyası ve `apps/web/package.json` orkestranındır; yeni bağımlılık paralel PR'larda kilit çatışması
  üretir.
- Algoritma FSRS-6'nın kamuya açık formülleridir (open-spaced-repetition "The Algorithm", 21 ağırlık, varsayılan
  bozunma 0,1542). Formüller ts-fsrs'in `fsrs-6` modülüyle satır satır karşılaştırıldı.

## Doğrulama

`referans/uret-fsrs-referans.mjs` ts-fsrs 6.0.0'ın "uzun vadeli" zamanlayıcısıyla (`enable_short_term: false`,
bulanıklık kapalı) 8 senaryo, her biri 14 tekrar üretir; çıktı `referans/fsrs-referans.json`'dur. `fsrs.test.ts` her
adımda aralığı, vadeyi, kararlılığı ve zorluğu sekiz ondalığa kadar karşılaştırır (hedef hatırlama 0,90 ve 0,85).
Referansı yenilemek için betiğin başındaki komutlar kullanılır; test tutmazsa fark algoritmadadır.

## Bilinçli farklar

- Bulanıklık (fuzz) kapalı: aynı geçmiş aynı takvimi verir, testlenebilir ve açıklanabilir.
- Gün sınırı Türkiye takvim günüdür (UTC+3), ts-fsrs'in UTC günü değil. Referans testi UTC kaydırmasıyla çalışır.
- Dakika düzeyi öğrenme adımı yok: ilk puandan sonra kart Gözden geçirme durumundadır, "Tekrar" en az bir gün sonrasına
  planlanır ve oturum içinde bir kez daha sorulur.

## Orkestraya

ts-fsrs'e geçilmek istenirse tek yer `fsrs.ts`'tir (`onizle` ve `incele`); `fsrs-referans.json` testi geçişin
eşdeğerliğini kanıtlar. Lisans: ts-fsrs MIT, AGPL veya SSPL yoktur.
