# pratik: diğer ajanlara ve orkestraya notlar

## orkestra

- `acikModuller` kümesine yalnız `'/pratik'` eklendi (`apps/web/src/app/(kabuk)/_kabuk/rotalar.ts`).
- Plan 13.1 yalnız `/pratik` ve `/pratik/hmgs` der. Eklenen yollar: `/pratik/bugun`, `/pratik/deste/[slug]`,
  `/pratik/hmgs/deneme`, `/pratik/editor` (noindex). Tabloya eklenmesi gerekir.
- API uçları `apps/web/src/app/api/v1/decks/**` altındadır (sözleşme yolu `/v1/decks`). Sahiplik tablosunda bu yol
  açıkça yazılı değil; sahiplik notu 3'e göre pratik modülünün sayılarak yazıldı. Yanlışsa taşınır.
- Üretimde `PRATIK_ONIZLEME` ortam değişkeni TANIMLANMAZ. Tanımlıysa (`1`) editör onayı bekleyen kartlar da
  öğrenciye görünür; yalnız staging ve geliştirme içindir.

## hukuk-uyum

- İlerleme, ayarlar ve deneme sonuçları tarayıcıda `localStorage` anahtarlarında durur (`kazuist.pratik.v1`,
  `kazuist.pratik.deneme.v1`); sunucuya gitmez, çerez değildir. Çerez politikası ve aydınlatma metni tablosuna
  "kullanıcının istediği hizmet için zorunlu yerel depolama" olarak eklenmesi gerekir.

## seo

- `/pratik/editor` noindex'tir. `/pratik/deste/*` ve `/pratik/hmgs` kart onayı gelene kadar ince içeriktir; site
  haritasına kartlar yayımlanana kadar eklenmesi önerilmez.

## kalite-guvenlik

- Tarayıcı kanıtı `apps/web/src/app/pratik/_kanit/oyna.mjs` ile üretilir (dört oyun, çalışma oturumu, deneme; yalnız
  klavye; 375/768/1440; axe). Sonuç `_kanit/ekran/dogrulama.json`. e2e listesine eklenebilir.

## Tarık (editör olarak) ve veri-toplama

- Kartların yayımlanması için hukukçu editör onayı gerekir (HMGS'de iki ayrı editör). Komutlar `content/desteler/README.md`.
- mevzuat.gov.tr tarayıcı olmayan istemcilere (KazuistBot dahil) yanıt vermiyor (zaman aşımı); yalnız tarayıcı
  kimliğiyle açılıyor. Bu PR'da bunu aşan bir otomasyon eklenmedi. Kartların kaynak doğrulaması `dogrula.ts`
  betiğiyle, tarayıcıdan kaydedilmiş sayfalar (`--yerel`) üzerinden yapılır. Mevzuat bağlayıcısı için resmî erişim
  (protokol ya da izin) docs/kaynaklar/mevzuat.md'deki Tarık onayına bağlıdır.
