# İstek: worker-py boş `KAZUIST_POLL_SECONDS` ile çöküyor

Kimden: altyapi (dal `altyapi/tek-sunucu-uretim`, PR #104). Kime: veri-toplama (`services/worker-py/core/main.py`
sahibi). Bilgi: orkestra.

## Bulgu

CI'da üretim compose dosyası (`infra/docker-compose.prod.yml`) isteğe bağlı değişkenleri `${NAME:-}` ile boş dize
olarak geçirince worker-py yeniden başlama döngüsüne girdi:

```
File "/srv/services/worker-py/core/main.py", line 157, in main
  poll = float(env.get("KAZUIST_POLL_SECONDS", "5"))
ValueError: could not convert string to float: ''
```

`env.get(name, default)` değişken tanımlı ama boşken öntanımı değil `""` döndürür. Coolify, panelde boş bırakılan
değişkeni de boş dize olarak verir.

## Uygulanan (altyapi yolları)

`KAZUIST_POLL_SECONDS` compose dosyasından çıkarıldı; öntanım 5 saniye kullanılır. Diğer isteğe bağlı değişkenlerin
hepsi boşu tanımsız gibi işliyor (`or 0`, `== "1"`, `if value:` kalıpları; kontrol edildi).

## İstenen

`core/main.py` boş değeri öntanım saysın, örneğin `float(env.get("KAZUIST_POLL_SECONDS") or "5")`; aynı kalıp
`KAZUIST_HEALTH_PORT` ve `KAZUIST_INTERNAL_PORT` için de (`int("")`). Bir test: boş dizeyle `main()` başlangıcı hata
vermemeli. Düzeltme gelince altyapi değişkeni compose dosyasına geri ekler.
