# Dağıtım runbook'u

Kaynak: plan.md 14.3, 14.4, 14.8, 14.9; siteyarat.md 9, 15, 20; ADR-0033 (tek sunucu, sunucuda derleme yok, elle
terfi). Kaynağın yapısı `coolify.md`'de, ilk kurulum `ilk-kurulum.md`'dedir.

## Akış

```text
PR -> CI: node, python, gitleaks, docker (imajlar yalnız derlenir ve test edilir, itilmez)
   -> main'e birleştirme
   -> CI main: aynı dört iş, sonra "publish": linux/amd64 imajları GHCR'ye, etiket <sha> ve main
   -> elle terfi (Tarık onayı): Coolify'da KAZUIST_IMAGE_TAG=<sha>, Deploy
        postgres ve valkey sağlıklı -> migrate çıkış 0 -> web, worker-node, worker-py, maintenance
   -> /api/version commit'i <sha>, /api/health 200, dış kabul testleri
```

Kurallar:

- Sunucuda derleme yapılmaz; Coolify yalnız GHCR'den imaj çeker. Testten geçmemiş commit'in imajı yoktur (`publish`
  dört işe bağlıdır).
- Üretimde etiket her zaman tam sha'dır. Aynı sha için ikinci dağıtım açılmaz.
- Migration `migrate` hizmetidir (`infra/docker/worker-node/Dockerfile`, hedef `migrate`); web ve işçiler
  `service_completed_successfully` ile ona bağlıdır. Başarısız migration dağıtımı durdurur, çalışan sürüm değişmez.
  Web açılışında `&&` zinciri yoktur (plan 14.4/3); Coolify "Pre-deployment" komutu migration için kullanılmaz.
- Migration geriye dönük uyumlu yazılır (önce ekle, sonra kullan, en son kaldır). Yıkıcı migration Tarık onayıyla ve
  öncesinde elle yedekle (`yedek.md`).
- Ortam değişkenleri Coolify kaynağının Environment Variables bölümüne "Is Secret" ile girilir; yer tutucu
  yapıştırılmaz. Değişken eklenince yeniden dağıtılır. Liste: `ilk-kurulum.md`, "Ortam değişkenleri".

## İmajlar

| İmaj (GHCR) | Dockerfile | Port | Kullanıcı | Sağlık |
|---|---|---|---|---|
| `kazuist-web` | `infra/docker/web/Dockerfile` | 3000 | node (1000) | `/api/health` |
| `kazuist-worker-node` | `infra/docker/worker-node/Dockerfile` (`dist/main.js`, tsx yok) | yok | node (1000) | veritabanına `select 1`; SIGTERM ile temiz kapanış |
| `kazuist-migrate` | aynı dosya, hedef `migrate` | yok | node (1000) | çıkış kodu |
| `kazuist-worker-py` | `infra/docker/worker-py/Dockerfile` | 8000 sağlık (konteyner içi), 8001 iç API | app (10001) | `/healthz` |
| `kazuist-maintenance` | `infra/maintenance/Dockerfile` | 8080 | nginx (101) | `/healthz` |

Derleme bağlamı depo köküdür; `.dockerignore` `apps/web/**/_kanit` ekran görüntülerini (yaklaşık 29 MB),
`infra/backup`'ı ve belgeleri dışarıda bırakır (CI imajın içinde arar). Derleme argümanları CI'da verilir:
`GIT_COMMIT` (sha), `BUILT_AT` (commit zamanı; aynı commit aynı katmanları üretir), `APP_VERSION`
(`apps/web/package.json`). Hedef mimari `linux/amd64`'tür (x86 sunucu); ADR-0033 madde 4'teki arm64 derlemesi Arm
sunucu seçilirse eklenir.

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

- Bağlama `infra/docker-compose.prod.yml` içindedir (`read_only: true` bind). Klasörler root sahipli, dizinler
  0755, dosyalar 0644; konteyner uid 10001 ile yalnız okur. CI aynı dosyayla `/models/ner`'e yazmanın reddedildiğini
  denetler. Klasör boşken ve `KAZUIST_NER_BACKEND` boşken işçi başlar (aşağıdaki güvenli kapanma).
- Ortam değişkenleri (Coolify kaynağının Environment Variables bölümü): `KAZUIST_ENV=production` (imaj öntanımı da budur),
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

## Adımlar (elle terfi)

1. CI'ın commit'te yeşil olduğunu ve imajların itildiğini doğrula:
   `gh run list --branch main --workflow ci --limit 3` ve `gh run view <id>` içinde `publish` işleri yeşil.
2. Commit migration içeriyorsa elle yedek: `systemctl start kazuist-backup.service` (`yedek.md`).
3. Önceki değeri not et (geri dönüş noktası): Coolify > kaynak > Environment Variables > `KAZUIST_IMAGE_TAG`.
4. `KAZUIST_IMAGE_TAG=<yeni sha>`, Save, Deploy. Dağıtım logunda `migrate` için `"msg":"done"`; `"msg":"failed"` varsa
   dur, eski sürüm ayakta kalır (`geri-alma.md`).
5. Doğrula (dışarıdan; kapalı provada yönetici IP'sinden):

   ```bash
   curl -fsS https://<alan>/api/version                                  # "commit":"<yeni sha>"
   curl -s -o /dev/null -w '%{http_code}\n' https://<alan>/api/health    # 200
   ```

   Sunucuda: `docker ps --format '{{.Names}}\t{{.Status}}'` hepsi `healthy`; dış izleme panelinde kırmızı yok.
6. Sorun varsa `geri-alma.md`.

## Dış kabul testleri (plan 14.9, siteyarat.md 20)

Yönetici makinesinden, kurulumdan ve her yayından sonra; sonuç teslim raporuna yazılır.

```bash
H=kazuist.com    # kapalı provada geçici alt alan
dig +short "$H" @1.1.1.1                                      # sunucu IP'si
curl -sSI "http://$H/" | head -3                              # tek adımda 301/308 -> https
curl -fsSI "https://$H/" | head -1                            # 200
curl -fsS "https://$H/api/health"                             # {"status":"ok"}
curl -fsS "https://$H/api/version"                            # beklenen commit
curl -fsS "https://$H/robots.txt"; curl -fsS "https://$H/sitemap.xml" | head -5
curl -s -o /dev/null -w '%{http_code}\n' "https://$H/.env"    # 404
curl -s -o /dev/null -w '%{http_code}\n' "https://$H/.git/"   # 404
curl -sSI "https://www.$H/" | head -3                         # kanonik alana yönlenir (DNS kaydı varsa)
echo | openssl s_client -connect "$H:443" -servername "$H" 2>/dev/null | openssl x509 -noout -subject -enddate
nmap -Pn -p 22,5432,6379,8000,6001,6002,8001 <IP>             # 22 yalnız yönetici IP'sinden; diğerleri kapalı ya da filtreli
```

Güvenlik başlıkları (`curl -sSI`): `content-security-policy`, `strict-transport-security`, `x-content-type-options`,
`referrer-policy`, `permissions-policy`; `x-powered-by` yok. Ek H'deki adresler ve bot user-agent denemeleri
kalite-guvenlik ajanının listesinden çalıştırılır.

## Dağıtım sırasında bakım sayfası

web sağlıksızken ya da yeniden oluşturulurken Traefik ham hata yerine 503 ve bakım sayfası döner (FR-105). Ayrıntı
`coolify.md`, "Bakım sayfası".

## Disk

Coolify > Servers > Docker Cleanup kullanılır; volume temizliği kapalı. Elle ölçüm: `df -h /`, `df -ih /`,
`docker system df`. Güvenli temizlik: `docker image prune -f`. `docker volume prune` çalıştırılmaz.
`disk-check.sh` yüzde 80'de uyarır (`izleme.md`).
