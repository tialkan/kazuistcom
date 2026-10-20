# Meşru menfaat denge testi: yargı kararları corpus'u

TASLAK, Tarık onayı bekliyor. Sürüm: 2026-10-19 (taslak 1). Uyum garantisi vermez; hukukçu editör onayı gerekir (plan Ek E).

Dayanak: 6698 sayılı Kanun m.5/2-f (ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla
veri sorumlusunun meşru menfaati için zorunlu işleme; metin mevzuat.gov.tr'den okundu) ve m.4/2 ilkeleri.
Resmî metinlerin çoğaltılması FSEK m.31 [DOĞRULANACAK: FSEK güncel metninden madde içeriği].

## 1. İşleme faaliyeti

Resmî kaynaklarda yayımlanmış yargı ve kurum kararlarının (records, chunks, sources_raw) toplanması,
Ek E politikasıyla anonimleştirilmesi (anonymization_spans), aranabilir kılınması ve kaynaklı özetin
dayanağı olarak kullanılması. Kararlarda taraf, vekil, tanık, hâkim ve benzeri üçüncü kişilerin verileri bulunur.

## 2. Amaç testi (meşru menfaat)

- Hukuk öğrencisi, akademisyen ve kamunun yargı kararlarına erişimi; akademik araştırma ve hukuk eğitimi.
- Kaynak bağlama ile doğrulanabilir özet; kararın resmî kaynağına bağlantı.
- Menfaat gerçek ve güncel; resmî kaynaklar kararları zaten yayımlıyor.

## 3. Zorunluluk testi

- Amaç kişi verisi olmadan büyük ölçüde karşılanabilir: hukuki değer gerekçededir, kişide değil.
  Bu yüzden Ek E kişi verisini maskeler; arama, özet ve oyunlar anonim metin üzerinden yürür.
- Ham arşiv (sources_raw) yeniden anonimleştirme ve kaynak doğrulaması için tutulur; erişim yalnız
  işçi ve yetkili editörde. Süre [DOĞRULANACAK: veri-toplama ajanıyla, mümkün olan en kısa süre].
- Yüksek mahkeme üyesi adı yalnız resmî kaynak açık yayımlıyorsa korunur; adla arama, filtre ve profil yoktur.

## 4. Denge

| Etken | Değerlendirme |
|---|---|
| Verinin niteliği | m.6 verisi (sağlık, ceza mahkûmiyeti vb.) kararlarda bulunabilir: sıkı mod genelleştirir veya maskeler |
| Makul beklenti | Kişi, adıyla aranabilir bir arşiv beklemez: kişi adları hiçbir dizine ve öneri listesine girmez |
| Profilleme | Vekil ve avukat adları da maskelenir |
| Çocuklar | Sıkı mod: yaş, okul ve yer genelleştirilir |
| Güvenceler | Anonimleştirme Türkiye'de (ADR-0011); kalite seti eval/anon; politika değişince yeniden işleme ve fark raporu; kaldırma süreci (72 saat içinde geçici gizleme, KVKK m.13/2 en geç otuz gün) |
| Dış aktarım | Yalnız anonim metin yurt dışına gider (aktarim.md) |

## 5. Sonuç (taslak)

Güvenceler uygulandığı sürece işlemenin ilgili kişilerin temel hak ve özgürlüklerine zarar vermeden
yürütülebileceği değerlendirilmektedir. Değerlendirme, anonimleştirme kalite ölçümleri (eval/anon) ve
hukukçu editör onayı olmadan kesinleşmez; eşik geçilmezse corpus yayımlanmaz.

## 6. Gözden geçirme

Yılda bir ve Ek E her değiştiğinde yeniden yapılır.
