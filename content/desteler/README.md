# content/desteler

Pratik modülünün kart desteleri. Her dosya bir destedir (`<slug>.json`); şema `apps/web/src/app/pratik/_alan/kart.ts`.
Yeni bir deste dosyası `apps/web/src/app/pratik/_veri/desteler.ts` içine de eklenir (test eksiği yakalar).

## Kurallar

- Sorular özgündür. ÖSYM soruları kopyalanmaz, fotoğraflanmaz, uyarlanmaz.
- Her kart en az bir birincil kaynağa bağlıdır: kanun adı, madde ve kanun metninden birebir alıntı. Madde numarası,
  tarih ve kurum tahmin edilmez.
- Durum saklanmaz, hesaplanır: kaynağı birebir doğrulanmamış kart `taslak`; doğrulanmış ama gereken onayı almamış
  kart `onay_bekliyor`; yalnız doğrulanmış ve gereken editör onaylı kart `yayinda` olur (HMGS kartlarında iki farklı
  editör, diğerlerinde bir). Yazar kendi kartını onaylayamaz. Soru, yanıt ya da kaynak değişirse `surum` artar ve eski
  onaylar geçersiz olur.
- Yayında olmayan kart öğrenciye gösterilmez.

## Komutlar (Node 24 ve üstü, bağımlılıksız)

```
node content/desteler/dogrula.ts --yerel <klasor>      alıntıları kaynak sayfayla birebir karşılaştırır
node content/desteler/dogrula.ts --isaretle --yerel <klasor>   geçenlere dogrulamaTarihi ve maddeOzeti yazar
node content/desteler/dogrula.ts --goster 2709 125     bir maddenin metnini gösterir
node content/desteler/onayla.ts --liste                onay bekleyen kartlar
node content/desteler/onayla.ts --kart anayasa-hukuku.001 --editor "Ad Soyad"
```

`--yerel` klasöründe sayfalar `<kanunNo>.html` adıyla durur (tarayıcıdan "farklı kaydet"). anayasa.gov.tr sayfaları
doğrudan indirilebilir; mevzuat.gov.tr tarayıcı olmayan istemcilere yanıt vermez. Madde metni yayımlanmış hâlinden
değişirse `maddeOzeti` tutmaz ve betik kartı başarısız sayar: değişiklik, kartın yeniden incelenmesi demektir.

## Mevcut durum (7 Kasım 2026)

7 destede 59 kart ve 61 kaynak denetimi var, hepsi geçti; hiçbiri editör onayı almadı. Anayasa (anayasa.gov.tr, güncel metin) ve
Türk Medeni Kanunu (mevzuat.gov.tr) kaynaklıdır. Diğer 13 HMGS alanının destesi yoktur; kaynak metinleri doğrulanamadığı
için kart yazılmadı. Hukuk felsefesi ve sosyolojisi ile Türk hukuk tarihi alanlarında kanun metni kaynağı olmadığından
bu çerçeve (kanun alıntısı) bu alanlara uymaz; editörlerle kaynak türü ayrıca kararlaştırılmalıdır.
