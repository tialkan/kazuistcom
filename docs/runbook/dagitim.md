# Dağıtım runbook'u

Kaynak: plan.md 14.3, 14.4, 14.8; siteyarat.md 9, 15. Coolify ayrıntıları için `coolify.md`.

## Akış

```text
PR -> CI yeşil (node, python, gitleaks, docker) -> main'e birleştirme
  -> GitHub Actions "deploy-staging" (sonraki adım, Coolify API token'ı gelince)
     1. migrate uygulaması: Coolify'da deploy, bitişini bekle (exit 0)
     2. web, worker-node, worker-py: Coolify'da deploy
     3. /api/version commit'i beklenen SHA mı
  -> üretim: elle terfi (Tarık onayı), aynı sıra
```

Kurallar:

- PR testleri geçmeden otomatik dağıtım yok. Aynı commit için ikinci dağıtım kuyruğu açılmaz.
- Migration ayrı bir Coolify uygulamasıdır (`kazuist-migrate`, `infra/docker/worker-node/Dockerfile`, hedef `migrate`). Web açılış komutunda `&&` ile migration zinciri yoktur (plan 14.4/3).
- Coolify'ın "Pre-deployment" komutu migration için kullanılmaz: belgeye göre eski konteynerde çalışır ve ilk dağıtımda atlanır (coolify.io/docs, Dockerfile build pack).
- Migration geriye dönük uyumlu yazılır (önce ekle, sonra kullan, en son kaldır). Yıkıcı migration Tarık onayıyla ve öncesinde anlık yedekle.
- Ortam değişkenleri Coolify'da "Production" bölümüne, secret olarak girilir; önizleme bölümüne değil. Yer tutucu değer yapıştırılmaz. Değişken eklenince yeniden yayım yapılır.

## İmajlar

| İmaj | Dockerfile | Port | Kullanıcı | Sağlık |
|---|---|---|---|---|
| web | `infra/docker/web/Dockerfile` | 3000 | node (1000) | `/api/health` (Dockerfile HEALTHCHECK) |
| worker-node | `infra/docker/worker-node/Dockerfile` (`dist/main.js`, tsx yok) | yok | node (1000) | süreç ayakta, SIGTERM ile temiz kapanış |
| migrate | aynı dosya, `--target migrate` | yok | node (1000) | exit kodu |
| worker-py | `infra/docker/worker-py/Dockerfile` | 8000 (konteyner içi) | app (10001) | `/healthz` (Dockerfile HEALTHCHECK) |
| bakım | `infra/maintenance/Dockerfile` | 8080 | nginx (101) | `/healthz` |

Derleme bağlamı her imajda depo köküdür. web için derleme argümanları: `GIT_COMMIT`, `BUILT_AT`, `APP_VERSION`. Coolify'da Advanced > Build > Source commit availability "Available during build" yapılır ve `GIT_COMMIT=$SOURCE_COMMIT` verilir.

## worker-py model birimleri

Kaynak: plan 6.4/2 ve 15.3/2, ADR-0026, ADR-0037 (embedding modeli, Tarık onayı bekliyor), istekler
`docs/istekler/mimar-yonlendirme-2-casuist-anonimlestirme-altyapi.md` ve `docs/istekler/altyapi-embed-model-birimi.md`.

- İmaj `ner-runtime` ekstrasını taşır (onnxruntime, tokenizers, numpy; torch, transformers ve gliner yok). Model
  dosyaları imaja ve depoya girmez; çalışma anında indirme yapılmaz (`HF_HUB_OFFLINE=1` ve `TRANSFORMERS_OFFLINE=1`
  imajda öntanımlı).
- Sunucuda iki klasör, konteynerde iki bağlama noktası; ikisi de yalnız okunur:

  | Sunucu (öneri) | Konteyner | Değişken (imaj öntanımı) | İçerik |
  |---|---|---|---|
  | `/srv/kazuist/models/ner` | `/models/ner` | `KAZUIST_NER_DIR=/models/ner` | anahtar başına klasör, `eval/anon/export_ner.py` çıktısı (ör. `akdeniz27/`: `model.onnx`, `tokenizer.json`, `config.json`, `kazuist_manifest.json`, lisans dosyaları) |
  | `/srv/kazuist/models/embed` | `/models/embed` | `KAZUIST_EMBED_DIR=/models/embed` | ADR-0037 onaylanınca `bge-m3/` (`altyapi-embed-model-birimi.md` madde 2) |

- Coolify: worker-py > Configuration > Persistent Storage > Add > Directory Mount; Destination Path `/models/ner`,
  kaynak olarak sunucu klasörü; ikinci bağlama `/models/embed` için aynı adımlar. Coolify belgesi
  (https://coolify.io/docs/knowledge-base/persistent-storage, 15 Kasım 2026'da okundu) dizin bağlamada yalnız okunur
  seçeneğinden söz etmiyor. Yalnız okunurluk sunucu izinleriyle sağlanır: klasörler root sahipli, dizinler 0755,
  dosyalar 0644; konteyner uid 10001 ile yalnız okur. Kurulum günü arayüzde yalnız okunur seçeneği görünürse o da açılır.
- Ortam değişkenleri (worker-py, Production): `KAZUIST_ENV=production` (imaj öntanımı da budur),
  `KAZUIST_NER_BACKEND=akdeniz27` (`eval/anon/raporlar/dalga-1-ner.md`), isteğe bağlı `KAZUIST_NER_THREADS`.
  Değişken verilip model ya da bağımlılık yoksa işçi başlamaz (logda `"msg":"startup failed"`).
- Güvenli kapanma (fail closed): `KAZUIST_ENV` `development` ya da `test` değilken `KAZUIST_NER_BACKEND` boşsa işçi başlar, fakat
  anon.run hiçbir kaydı yayımlamaz: `records.anonymized=false`, `masked_text` NULL, embed.chunks kuyruğa girmez,
  editör kuyruğunda `payload.blocked = "ner_unavailable"` satırı açılır ve logda
  `"msg":"anon.run held for review","reason":"ner_unavailable"` görünür. Bu satırı görürseniz modeli bağlayın,
  değişkeni verin, yeniden yayımlayın ve etkilenen kayıtlar için anon.run'ı yeniden kuyruğa alın. İmajı yerelde
  modelsiz denemek için `KAZUIST_ENV=development` açıkça verilir.
- Kurulum denetimi (her kopyalamadan sonra ve konteyner başlamadan önce):

  ```
  docker run --rm -v /srv/kazuist/models/ner:/models/ner:ro -e KAZUIST_NER_BACKEND=akdeniz27 <worker-py imajı> \
    python -m anonymizer.model_check
  ```

  Çıkış 0 ve `OK akdeniz27@99995f7` beklenir. Denetim manifestteki anahtarı ve revizyonu `anonymizer/ner.py`
  `CANDIDATES` ile, ONNX dosyalarının sha256 özetlerini manifestle karşılaştırır, modeli yükler ve sentetik bir
  cümledeki kişi adını bulmasını ister. Kayıt metni yazdırmaz. Embedding klasörü için
  `python -m nlp.model_check /models/embed/bge-m3 --quantized` (casuist, ADR-0037).
- Bellek: akdeniz27 işçi sürecinde tepe RSS yaklaşık 0,7 GB (Apple M4 ölçümü, `dalga-1-ner.md`); BGE-M3 int8 ile
  birlikte worker-py için 2,5 GB ayrılır, bellek sınırı konacaksa 3 GB (`altyapi-embed-model-birimi.md` madde 4).
  Hedef sunucunun CPU'sunda `eval/anon/compare_ner.py --threads <n>` ile yeniden ölçülür.

## Adımlar (elle dağıtım)

1. CI'ın ilgili commit'te yeşil olduğunu doğrula: `gh run list --branch main --limit 3`.
2. Veri tabanında migration varsa: VPS-2'de anlık yedek al (`yedek.md`, "Elle yedek").
3. Coolify > Projects > kazuist > staging > kazuist-migrate > Deploy. Logda `"msg":"done"` satırını gör. `"msg":"failed"` varsa dur; web dağıtılmaz, eski sürüm ayakta kalır.
4. web, worker-node, worker-py için Deploy. Coolify yeni konteyner sağlıklı olmadan trafiği çevirmez.
5. Doğrula:
   - `curl -s https://staging.kazuist.com/api/version` (Basic Auth ile) beklenen commit.
   - `curl -s -o /dev/null -w '%{http_code}' https://staging.kazuist.com/api/health` 200.
   - Uptime Kuma'da kırmızı yok; GlitchTip'te yeni hata dalgası yok.
6. Sorun varsa `geri-alma.md`.

## Dağıtım sırasında bakım sayfası

`infra/maintenance/traefik-dynamic.yml` Traefik'e eklenir; web 502/503/504 dönerse veya sağlıklı web konteyneri yoksa ham Traefik hatası yerine 503 ve bakım sayfası döner (FR-105). Ayrıntı `coolify.md`, "Bakım sayfası".

## Disk

Coolify > Servers > Docker Cleanup kullanılır; volume temizliği kapalı. Elle ölçüm: `df -h /`, `df -ih /`, `docker system df`. Güvenli temizlik: `docker builder prune -af`, `docker image prune -f`. `docker volume prune` çalıştırılmaz.
