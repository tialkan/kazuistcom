# Atıf ağı ölçüm raporu (Dalga 2)

Eşikler: yayın 0.9, kuyruk 0.5. Hedef eşik: kenar kesinliği %95 ve üstü (plan 15.3/4).

## Yayın kapısı (15.3/4)

| Ölçüt | Sonuç |
|---|---|
| 100 kararlık altın set, yayımlanan kenarlarda kesinlik >= %95 | ölçülmedi: altın set ve gerçek karar corpusu yok; geçmedi sayılır |
| Modelli (Haiku 5.5 Batch) çıkarım karşılaştırması | ölçülmedi: gerçek model çağrısı yapılmadı |

## ornek-7

| Tür | doğru | yanlış | kaçan | kesinlik | duyarlılık |
|---|---|---|---|---|---|
| karar | 8 | 0 | 0 | %100,0 | %100,0 |
| doktrin | 4 | 0 | 0 | %100,0 | %100,0 |

Alan hatası (mahkeme, daire, tarih): 0. Alt mahkeme sayısı uyumsuz belge: yok.
Yayına uygun kenar (karar: hedefi corpusta çözülmüş, doktrin: güven >= eşik): 4.

## sentetik

| Tür | doğru | yanlış | kaçan | kesinlik | duyarlılık |
|---|---|---|---|---|---|
| karar | 5 | 0 | 0 | %100,0 | %100,0 |
| doktrin | 2 | 0 | 0 | %100,0 | %100,0 |

Alan hatası (mahkeme, daire, tarih): 0. Alt mahkeme sayısı uyumsuz belge: yok.
Yayına uygun kenar (karar: hedefi corpusta çözülmüş, doktrin: güven >= eşik): 2.

## Sınırlar

- ornek-7 yalnız 7 karardır ve 8 karar atfı ile 4 doktrin atfı içerir; sonuç yayın kapısı kanıtı değildir.
- Gold etiketleri metin okunarak ve ham sayı taramasıyla elle çıkarıldı; çıkarıcının çıktısına bakılarak doğrulandı, bu yüzden bağımsız değildir.
- Hedef kayıtlar gerçek corpusta olmadığı için 'yayımlanan kenar kesinliği' ölçülemedi; ölçülen 'kenar kimliği kesinliği'dir.
- Yıl içermeyen eski numara biçimi (ör. 7803-9629 sayılı ilam) desteklenmez; bilinen kapsam dışıdır.

