# ADR-0021: Yerel geliştirme ve CI için S3 deposu: MinIO yerine SeaweedFS

- Tarih: 2026-10-20
- Karar kodu: yok (plan 5.3 teknoloji seçimi; istek: docs/istekler/altyapi-s3-yerel.md)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Plan 5.3 ve Ek A.1 yerel geliştirme yığınında MinIO'yu sayar. Altyapı ajanı 2026-10-19'da şunları buldu:
`quay.io/minio/minio` etiketi anonim çekilemiyor (HTTP 401), Docker Hub'daki `minio/minio` deposu kaldırılmış.
Mimar 2026-10-20'de GitHub API ile doğruladı: `minio/minio` deposu arşivlenmiş (`archived: true`). Yerel
yığının ve CI'daki docker işinin anonim çekilebilen, bakımı süren ve lisansı uygun bir S3 uyumlu depoya
ihtiyacı var.

## Karar

`infra/docker-compose.dev.yml` içindeki `s3` servisi `chrislusf/seaweedfs:4.48` imajını kullanır
(`weed server -s3 -s3.port=9000`). Kimlik bilgileri `S3_ACCESS_KEY_ID` ve `S3_SECRET_ACCESS_KEY`
değişkenlerinden gelir; uç nokta `S3_ENDPOINT=http://127.0.0.1:9000` değişmez. Karar yalnız yerel geliştirme
ve CI içindir; üretim deposu Türkiye'de S3 uyumlu sağlayıcıdır (plan 5.5, ADR-0003) ve bu ADR'den etkilenmez.

## Gerekçe

- Lisans: SeaweedFS Apache-2.0 (GitHub API `license.spdx_id`, 2026-10-20). AGPL veya SSPL değil.
- Sürüm: GitHub son sürümü 4.48, 2026-09-28 (GitHub API `releases/latest`); depo etkin.
- Uygulama kodu yalnız S3 API'sini kullandığı için depo değişimi koda yansımaz.
- Değerlendirilip seçilmeyen: Garage (AGPL-3.0, CLAUDE.md gereği ADR'siz eklenemez; yerel kullanım için
  AGPL yükü gereksiz).

## Sonuçlar

- `.env.example` MinIO yerine SeaweedFS'yi anar (bu PR).
- Konsol (eski MinIO 9001) yoktur; kova oluşturma için `infra/scripts/` altında aws-cli betiği altyapı
  ajanının işidir (istek dosyası madde 3).
- Plan 5.3 ve Ek A.1'deki "MinIO" ifadesinin güncellenmesi plan sahibinin (orkestra) işidir.

## Durum

Önerildi, Tarık onayı bekliyor.
