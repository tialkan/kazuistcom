# Hibrit getirme ölçümü, Dalga 2 (2026-11-14)

Komut: `node eval/embed/hibrit.ts <vektör klasörü> --yaz` (vektörler `eval/embed/olc.py --vektor` ile).
Derlem fikstur-2026-11-07; packages/casuist `search()` bellek arka ucuyla, ilk 10 sonuç. Vektör kolu
tam metin koluyla RRF (k=60) üzerinden birleşir; ilgililik ve sıralama üretimdeki kodla aynıdır.
Son sütun: cevapsız sorularda ilk sonucun "Yüksek ilgililik" etiketi alma sayısı (düşük olmalı).

| Satır | Sentetik isabet@1 | Sentetik isabet@10 | Sentetik nDCG@10 | rag-50 isabet@1 | rag-50 isabet@10 | rag-50 nDCG@10 | Cevapsızda Yüksek |
|---|---|---|---|---|---|---|---|
| vektörsüz (tam metin ve kimlik) | %48.3 | %80.0 | 0.610 | %92.3 | %100.0 | 0.965 | 1/11 |
| karakter üçlüsü (fikstür, eşik 0,3) | %50.0 | %80.0 | 0.589 | %92.3 | %100.0 | 0.968 | 0/11 |
| bge-m3.fp32 metin | %61.7 | %93.3 | 0.745 | %94.9 | %100.0 | 0.978 | 1/11 |
| bge-m3.fp32 baslik+metin | %65.0 | %91.7 | 0.749 | %97.4 | %100.0 | 0.987 | 1/11 |
| bge-m3.int8 metin | %63.3 | %91.7 | 0.748 | %92.3 | %100.0 | 0.968 | 1/11 |
| bge-m3.int8 baslik+metin | %63.3 | %91.7 | 0.750 | %97.4 | %100.0 | 0.987 | 1/11 |
| multilingual-e5-large.fp32 metin | %65.0 | %88.3 | 0.744 | %89.7 | %100.0 | 0.955 | 11/11 |
| multilingual-e5-large.fp32 baslik+metin | %63.3 | %88.3 | 0.739 | %97.4 | %100.0 | 0.987 | 11/11 |
| multilingual-e5-large.int8 metin | %61.7 | %90.0 | 0.737 | %89.7 | %100.0 | 0.952 | 11/11 |
| multilingual-e5-large.int8 baslik+metin | %61.7 | %88.3 | 0.733 | %97.4 | %100.0 | 0.987 | 11/11 |
| qwen3-embedding-0.6b.fp32 metin | %48.3 | %86.7 | 0.648 | %89.7 | %100.0 | 0.959 | 1/11 |
| qwen3-embedding-0.6b.fp32 baslik+metin | %51.7 | %90.0 | 0.668 | %94.9 | %100.0 | 0.978 | 0/11 |
| qwen3-embedding-0.6b.int8 metin | %48.3 | %85.0 | 0.650 | %92.3 | %100.0 | 0.968 | 1/11 |
| qwen3-embedding-0.6b.int8 baslik+metin | %46.7 | %85.0 | 0.637 | %94.9 | %100.0 | 0.978 | 0/11 |

Ayrıntı (kaçan sorular): dalga-2-hibrit.json.
