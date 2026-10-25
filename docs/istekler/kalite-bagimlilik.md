# İstek: bağımlılık açıkları (2026-10-22 taraması)

Kimden: kalite-guvenlik (dal dalga-1/kalite-guvenlik/kapi). Kime: orkestra (`services/worker-py/uv.lock`,
`pnpm-lock.yaml`), anonimlestirme (`ner` extra'sı). Kaynak: docs/kalite/dalga-1.md O-07 (orta).

## Gözlenen

Komut: `sh tests/security/tarama/tarama.sh <dizin>`.

| Paket | Sürüm | Kayıt | Düzeltme | Nerede |
|---|---|---|---|---|
| certifi | 2026.10.18 | PYSEC-2026-4320 | 2026.10.19 | worker-py çalışma zamanı (imajda) |
| transformers | 4.57.6 | PYSEC-2025-217, PYSEC-2026-2288, -2289, -2290, -3929, -4174 (9 satır) | 5.x | yalnız `ner` extra'sı (yerel dışa aktarma); imaj `uv sync --frozen --no-dev` ile kurulur, extra yok |
| esbuild | <=0.24.2 | orta, geliştirme sunucusu | >=0.24.3 | `better-auth > drizzle-kit > @esbuild-kit/*`, yalnız geliştirme |

`pnpm audit`: yüksek 0. Lisans taraması: AGPL ve SSPL 0.

## İstenen

1. certifi'nin 2026.10.19 veya üstüne yükseltilmesi (`uv lock --upgrade-package certifi`).
2. anonimlestirme: transformers yalnız dışa aktarma için gerekiyorsa sürüm 5.x'e geçiş veya `ner` extra'sının
   yalnız `eval` amaçlı olduğu notu ve imaja hiç girmediğinin CI denetimi.
3. esbuild: better-auth veya drizzle-kit yükseltmesi çıktığında; acil değil.

## Sonuç

(orkestra dolduracak)

## 25 Ekim 2026, teknik düzeltme ve yeniden ölçüm

Dal: `codex/guvenlik-bagimlilik`, başlangıç main `1ffbe56`.

- pypdf alt sınırı 6.21.2 yapıldı; kilit 6.21.1 -> 6.21.2. Birincil sürüm notu
  https://github.com/py-pdf/pypdf/releases/tag/6.21.2 güvenlik düzeltmelerini yayımlar;
  https://pypi.org/project/pypdf/6.21.2/ BSD-3-Clause ve Python >=3.9 bilgisini doğrular.
- setuptools kilidi 84.0.0 -> 84.2.1. Birincil paket kaydı:
  https://pypi.org/project/setuptools/84.2.1/ . Mevcut bağımlılık aralıklarıyla `uv lock` çözüldü.
- `uv run --directory services/worker-py pytest -q`: 145 geçti, 1 optional test atlandı.
- Üretim kapsamı `uv export --frozen --no-dev --extra ner-runtime --no-hashes` ardından pip-audit:
  **No known vulnerabilities found**, çıkış 0. Bu sonuç all-extras için geçerli değildir.
- All-extras pip-audit: **9 kayıt, 1 paket**, yalnız transformers 4.57.6. pypdf ve setuptools artık
  raporlanmıyor. Transformers açıkları kapanmadı. Düzeltme sürümleri kayda göre 5.0.0/5.3.0/5.5.0/5.10.0;
  bazı kayıtlarda sabit sürüm bilgisi yoktur.
- Uyum engeli birincil PyPI metadata ile ölçüldü: https://pypi.org/pypi/optimum-onnx/json güncel 0.1.0
  için `transformers>=4.36,<4.58.0` ve `optimum~=2.1.0` ister. `uv lock --upgrade-package transformers
  --upgrade-package optimum --upgrade-package optimum-onnx --upgrade-package gliner` 4.57.6'da kaldı.
  `eval/anon/export_ner.py` halen `optimum.onnxruntime` kullanır. Kör 5.x override yapılmadı.
  İstenen sonraki iş: anonimleştirme sahibi export yolunu transformer 5.x destekleyen araçla uyarlasın ve
  ONNX çıktı/sayısal ve PERSON span eşliğini yeniden ölçsün; alternatif gerçek ayrı export projesi ve
  açık güvenlik kapısıyla yalıtım kararıdır. Runtime ayrımı ADR-0026 ile zaten vardır.
- esbuild orta bulgusu sürüyor: üç yol, better-auth/drizzle-kit > @esbuild-kit/core-utils > esbuild
  0.18.20. Birincil bildirim https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99
  geliştirme sunucusunun kaynak okuma riskini açıklar. Kök pnpm kilidi ve override değiştirilmedi;
  üst paket geçişi/0.x kırıcı API değişimi orkestra tarafından ayrıca doğrulanmalıdır.

### Tarama güvenilirliği (O-09)

Önce CLI ikizleriyle regresyon kırmızı: pip-audit, uv export ve alt paket audit hataları eski betikte
başarı sayıldı. Düzeltmeyle hata kodları kaybolmaz; eksik araç, eksik alt paket kurulumu, boş export,
boş/bozuk audit envanteri ve boş/bilinmeyen/yasak lisans verisi kapıyı kapatır. Alt paket audit/lisans
çıktıları dosyada saklanır, `tail`/`grep` boru hattı hata kodunu yutmaz. Kök Node yüksek eşiği mevcut
politikayla korunur; orta esbuild bulgusu raporda kalır, ignore eklenmedi.

Gerçek tam tarama `sh tests/security/tarama/tarama.sh /tmp/kazuist-security-scan2`: **status 1**,
pip-audit transformers kayıtları nedeniyle. Lisans: kök Node 333, e2e 5, security 17, Python 39 paket;
yasak lisans yok. Yerel raporlar `/tmp/kazuist-security-scan2/` ve all-extras JSON
`/tmp/kazuist-security-all-audit.json` altındadır; CI artefaktı yerine geçmez.

**Kapanış:** pypdf/setuptools alt bulguları kapalı; O-07 transformer/esbuild açık. O-09 kod düzeltmesi
ve regresyon kanıtı hazır; CI dört iş yeşil olmadan birleşme veya bağımsız denetim kapanışı verilmez.
All-extras açıkları nedeniyle yeni doğru tarama CI'ı kıracaktır; kapı gevşetilmez.
