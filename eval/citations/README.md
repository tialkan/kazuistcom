# eval/citations

Atıf ağı ölçümü (plan 6.7, 15.3/4). Çalıştırma:

```sh
cd services/worker-py
uv run python ../../eval/citations/olc.py          # özeti yazdırır
uv run python ../../eval/citations/olc.py --yaz    # raporlar/dalga-2.json ve .md yazar
```

## Kümeler

| Küme | Boyut | Durum |
|---|---|---|
| `altin/ornek-7.json` | 7 gerçek Yargıtay kararı (`packages/casuist/fixtures`), 8 karar atfı, 4 doktrin atfı | Elle etiketli; yayın kapısı değildir |
| `altin/sentetik.json` | 4 sentetik metin | Kalıp kapsamı; gerçek karar alıntısı değildir |
| `altin/set-100.json` | 100 karar | YOK. Gerçek karar corpusu (staging) ve etiketleme gerekir. Bu set olmadan 15.3/4 "ölçülmedi" ve geçmedi sayılır |

## 100 kararlık seti etiketleme biçimi

`ornek-7.json` ile aynı: karar başına `karar_atiflari[]` (`kind`, `esas`+`karar` ya da `number`, `court`, `chamber`,
`date`), `doktrin_atiflari[]` (`yazar` soyadı, `baslik`, `yil`, `sayfa`) ve `alt_mahkeme_anmalari` (dosya geçmişi,
kenar sayılmaz). Etiketleme metni okuyan iki kişiyle yapılır, uyum (Cohen kappa) raporlanır; çıkarıcının çıktısına
bakılarak etiketlenmez. Yayımlanan kenar kesinliği, hedefi corpusta çözülmüş kenarlar üzerinden hesaplanmalıdır
(`olc.py` şimdi "kenar kimliği kesinliği"ni ölçer, çünkü hedef kayıtlar corpusta yoktur).

## Ölçülmeyenler

- Yayımlanan kenar kesinliği (15.3/4): ölçülmedi.
- Haiku 5.5 Batch çıkarımı ile kural tabanlının karşılaştırması: gerçek model çağrısı yapılmadı, ölçülmedi.
- Editör kuyruğu boşalma süresi: kuyruk arayüzü yok, ölçülmedi.
