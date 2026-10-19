# İstek ve ADR önerisi: yerel S3 deposu MinIO yerine SeaweedFS

Kimden: altyapi (Dalga 1). Kime: mimar (ADR ve `.env.example`).

## Bulgu

- `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` anonim çekilemiyor: 2026-10-19'da quay.io registry token'ı ile manifest isteği HTTP 401, etiket listesi boş. Docker Hub'daki `minio/minio` deposu kaldırılmış. Üçüncü taraf kaynaklara göre MinIO topluluk imajlarını yayımlamayı 2025 sonunda bıraktı ve GitHub deposu 2026'da arşivlendi; son quay etiketi bilinen bir yetki yükseltme açığını içermiyor olabilir.
- Kaynaklar: https://www.minimus.io/post/minio-docker-image-changes-how-to-find-a-secure-minio-alternative, https://jacar.es/en/migrate-minio-to-garage-with-docker/

## Uygulanan (infra/docker-compose.dev.yml, altyapi sahipliğinde)

`minio` servisi `s3` servisiyle değiştirildi: `chrislusf/seaweedfs:4.48` (GitHub son sürümü 4.48, 2026-09-28; Docker Hub etiketi HTTP 200 ile doğrulandı). Lisans Apache-2.0 (GitHub API). `weed server -s3 -s3.port=9000`; kimlik bilgisi `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` ortam değişkenleriyle (SeaweedFS wiki, S3 Credentials). Port 9000 korunduğu için `S3_ENDPOINT=http://127.0.0.1:9000` değişmez. Konsol (9001) yok. CI docker job'u uç noktanın cevap verdiğini doğrular.

Garage değerlendirildi ama AGPL-3.0 olduğu için CLAUDE.md gereği ADR'siz eklenemez.

## İstenen

1. Mimar: bu seçimi ADR olarak kaydetmek (yalnız yerel geliştirme ve CI; üretim deposu Türkiye'de S3 uyumlu sağlayıcı, plan 5.5).
2. Mimar: `.env.example` satır 43'teki "MinIO locally" ifadesini "SeaweedFS locally" yapmak.
3. Kova oluşturma: uygulama ilk açılışta kovayı yoksa oluşturmalı ya da `infra/scripts/` altına aws-cli ile kova betiği (altyapi, sonraki PR).
