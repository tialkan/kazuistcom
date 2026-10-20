# Anonimleştirme Dalga 1 ölçüm raporu (50 sentetik belge)

- Tarih: 2026-10-19
- Motor: `anon-0.1.0+ekE-2026.10.0+ner.none` (NER katmanı kapalı, yalnız kural katmanı)
- Set: `eval/anon/sentetik/` (50 belge, 4 tür: hukuk, ceza, aile, iş; tohum 20261019)
- Ham sonuç: `dalga-1-sentetik.json`; NER adayları: `dalga-1-ner-adaylari.json`
- Komut (services/worker-py içinden): `uv run python ../../eval/anon/measure.py --out ../../eval/anon/raporlar/dalga-1-sentetik.json`

## Önemli uyarı: sentetik set gerçek metnin yerine geçmez

Bu set, tanıyıcıları yazan ajan tarafından şablonla üretildi. Şablonlar ile kurallar aynı elden çıktığı için
sonuçlar iyimserdir ve yalnız hattın uçtan uca çalıştığını, sayaçların doğru işlediğini ve bilinen kalıpların
yakalandığını gösterir. 15.3/2 yayın kapısı için kanıt DEĞİLDİR. Kapı, 200 gerçek kararlık, mahkeme ve tür
bazında katmanlı, %20'si çift etiketli setle (plan 6.7) ölçülür. O ölçüm yapılana kadar kapı geçmedi sayılır.

## Sonuçlar (yakalama: altın span tamamen maskelendi; kesinlik: tahmin bir altın span'la kesişiyor)

| Varlık | Altın | Yakalanan | Yakalama | Tahmin | Kesinlik |
|---|---:|---:|---:|---:|---:|
| PERSON | 430 | 418 | 97,21% | 419 | 100% |
| TCKN | 38 | 38 | 100% | 38 | 100% |
| VKN | 12 | 12 | 100% | 12 | 100% |
| IBAN | 13 | 13 | 100% | 13 | 100% |
| CARD | 12 | 12 | 100% | 12 | 100% |
| PHONE | 25 | 25 | 100% | 25 | 100% |
| EMAIL | 25 | 25 | 100% | 25 | 100% |
| PLATE | 13 | 13 | 100% | 13 | 100% |
| ADDRESS | 25 | 25 | 100% | 25 | 100% |
| DOB | 26 | 26 | 100% | 26 | 100% |
| PARCEL | 13 | 13 | 100% | 13 | 100% |
| HEALTH | 13 | 13 | 100% | 13 | 100% |
| CRIMINAL | 13 | 13 | 100% | 13 | 100% |
| UNION | 12 | 12 | 100% | 12 | 100% |
| CHILD_AGE | 12 | 12 | 100% | 12 | 100% |
| SCHOOL | 12 | 12 | 100% | 12 | 100% |
| SOLE_PROPRIETOR | 12 | 12 | 100% | 12 | 100% |
| Mikro | 706 | 694 | 98,30% | | 100% |

15.3/2 eşikleriyle karşılaştırma (yalnız bilgi amaçlı): PERSON %97,21 < %99,5 (geçmedi); TCKN, IBAN, telefon,
e-posta %100; kesinlik %100.

Cohen kappa: hesaplanmadı. Sentetik sette çift etiket yok (`annotations_b` alanı yok); ikinci etiketleyiciyi
taklit etmek sahte bir uyum değeri üreteceği için bilinçli olarak yapılmadı. Betik kappa'yı destekliyor ve
birim testle doğrulandı.

## Kaçaklar

- PERSON 12 kaçak: aile belgelerindeki "Sosyal çalışma uzmanı <Ad Soyad>". "uzmanı" rol ipucu listesinde yok.
  Kural setine eklenmedi, çünkü setin içine göre ayar yapmak ölçümü daha da iyimser kılar; yerine NER katmanı
  bu tür ipucusuz adları yakalamalı.
- Set dışı elle denemelerde de kural katmanı ipucusuz adları kaçırıyor: "Olay günü <Ad Soyad> ile <Ad Soyad>
  kavga etmiştir", "sanığın annesi <Ad Soyad>", tamamı büyük harfli "müvekkil <AD SOYAD>". Bunlar gerçek
  kararlarda sık görülür; kişi adı eşiğine (%99,5) yalnız kural katmanıyla ulaşılamaz.

## NER adayları

| Aday | Hugging Face | Lisans (model kartı, 2026-10-19) | Durum |
|---|---|---|---|
| Hushmark BERTurk Span 112M | lokomotifai/hushmark-berturk-112m | Apache-2.0 | ölçülemedi: model yerelde yok |
| akdeniz27 | akdeniz27/bert-base-turkish-cased-ner | MIT | ölçülemedi: model yerelde yok |
| savasy | savasy/bert-base-turkish-ner-cased | model kartında lisans yok | ölçülemedi: model yerelde yok |
| GLiNER multi | urchade/gliner_multi-v2.1 | Apache-2.0 | ölçülemedi: model yerelde yok |

Notlar: `urchade/gliner_multi` (v1) cc-by-nc-4.0 olduğu için ticari üründe kullanılamaz; yalnız v2.1 aday.
savasy modelinin lisansı netleşmeden üretimde kullanılmamalı. Hushmark özel span başlığı ve kendi yükleyici
kodunu taşıyor (custom code); yerelde çalıştırmadan önce kod incelenmeli; model kartı yalnız sentetik veriyle
eğitildiğini ve gerçek metinde doğrulanmadığını söylüyor. Ağırlıklar bu oturumda indirilmedi; betik
(`eval/anon/compare_ner.py`) hazır, modeller `KAZUIST_NER_DIR/<aday>` altına konunca ONNX ile CPU'da ölçer.

## Sonraki adım

1. Dört adayı Türkiye'deki sunucuya veya yerel makineye indirip `compare_ner.py` ile ölçmek (lisans: savasy hariç).
2. 200 gerçek kararlık seti etiketlemek (yöntem için `docs/istekler/anonimlestirme-etiketleme-adr.md`).
3. Gerçek sette kaçak analizi; eşik ve ipucu listesinin gerçek veriyle ayarlanması (Dalga 3).
