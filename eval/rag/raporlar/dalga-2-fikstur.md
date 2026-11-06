# Kaynaklı özet ölçümü, Dalga 2 (2026-11-07)

Set rag-50-2026-11-07; derlem fikstur-2026-11-07 (75 kayıt). Komut: `node eval/rag/olc.ts --yaz`.
Sorular: 36 cevaplı, 11 cevapsız (beklenen kaynağı olmayan tuzak dahil), 4 tuzak.

Gerçek corpus ve gerçek model olmadan ölçülemeyen her eşik "ölçülmedi" yazıldı ve geçti sayılmadı (CLAUDE.md bitti tanımı).

| Ölçüt | Eşik | Değer | Durum | Not |
|---|---|---|---|---|
| Uydurma kaynak (dizinde olmayan kimlik) | 0 | doğrulayıcı 0/36 saldırgan satırı geçirdi | ölçülmedi | Doğrulayıcı kuralı (a) dizinde olmayan kimliği hiçbir zaman göstermez; gerçek modelle uçtan uca ölçüm yapılmadı. |
| Desteksiz cümle oranı (insan değerlendirmesi) | %1 altı (200 soru) | yok | ölçülmedi | İnsan değerlendirmesi ve gerçek model çıktısı gerekir. |
| Cevapsız sorularda doğru çekimserlik | %90 ve üstü | yok | ölçülmedi | Model çıktısı gerekir; getirmenin cevapsız sorulardaki en üst ilgililiği aşağıda bilgi olarak verildi. |
| Beklenen kaynaklardan en az biri ilk 10'da | %85 ve üstü | %100.0 (36/36) | geçti | Yalnız 75 kayıtlık fikstür derleminde ve karakter üçlüsü vektörüyle; gerçek corpus ve embedding modeliyle yeniden ölçülmeli. |
| Arama p95 | 1,5 sn ve altı | 4.0 ms (p50 2.7 ms) | ölçülmedi | Bellek içi fikstür süresidir; PostgreSQL, embedding servisi ve 200 eşzamanlı istekle (k6) ölçülmedi. |
| İlk doğrulanmış cümle p95 | 3 sn ve altı | yok | ölçülmedi | Gerçek sağlayıcıyla akış ölçümü yapılmadı. |
| Kişi adı sızıntısı | 0 | doğrulayıcı 0/36 saldırgan satırı geçirdi | ölçülmedi | Kural tabanlı ad denetimi saldırgan satırları durdurdu; NER bağlanmadı ve gerçek modelle ölçülmedi. |

## Getirme

İlk 10'da kaçan sorular: yok.

## Doğrulayıcı saldırı satırları

Her cevaplı soru için en ilgili pasajdan birebir alıntılı bir satır ve dört saldırgan satır denendi.
Birebir alıntılı satır kabulü: 36/36. Saldırgan satırlardan gösterilen: uydurma kimlik 0,
sahte alıntı 0, dayanaksız sayı 0, kişi adı 0 (toplam 144 satır).

## Cevapsız sorularda getirmenin en üst sonucu

- u01: ilgililik 0.4 (ilgililik_orta)
- u02: ilgililik 0.306 (ilgililik_orta)
- u03: ilgililik 0.115 (ilgililik_arka_plan)
- u04: ilgililik 0.287 (ilgililik_arka_plan)
- u05: ilgililik 0.192 (ilgililik_arka_plan)
- u06: ilgililik 0.46 (ilgililik_orta)
- u07: ilgililik 0.345 (ilgililik_orta)
- u08: ilgililik 0.286 (ilgililik_arka_plan)
- u09: ilgililik 0.262 (ilgililik_arka_plan)
- u10: ilgililik 0.345 (ilgililik_orta)
- t03: ilgililik 0.569 (ilgililik_orta)

Etiketleme casuist ajanınındır; hukukçu editör teyidi bekliyor.
