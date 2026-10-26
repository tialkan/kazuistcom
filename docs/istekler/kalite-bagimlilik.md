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

### Ek yetkiyle export uyumluluk düzeltmesi

Orkestra `eval/anon/export_ner.py` ve ilgili regresyon testlerini bu işe açıkça verdi.
`optimum`/`optimum-onnx` kaldırıldı; `onnx>=1.17`, `transformers>=5.10,<5.17`,
`gliner>=0.2.29,<0.3` aralıkları çözüldü: transformers 5.16.1, gliner 0.2.29. GLiNER birincil metadata
https://pypi.org/pypi/gliner/0.2.29/json `transformers>=4.51.3,<5.17.0` ile uyumludur.

Akdeniz export doğrudan `torch.onnx.export` logits sarmalayıcısına geçti; eager attention, eval modu,
opset 17 ve dinamik batch/token eksenleri açıkça seçilir. Resmî API:
https://docs.pytorch.org/docs/2.14/onnx.html (`dynamo=False` için `dynamic_axes`). Config, tokenizer,
kaynak/ONNX SHA256 ve manifest üretimi korunur. GLiNER hazırlık dizini kaynak cache yerine çıktı altında
oluşturulur; `anonymizer` runtime kodu değişmedi.

All-extras yeni gerçek pip-audit: **No known vulnerabilities found**, çıkış 0
(`/tmp/kazuist-security-all2-audit.txt`). Önceki 9 transformers kaydı artık yoktur.

- Küçük rastgele Bert offline export regresyonu: farklı batch/token/padding üç şekil, `atol=rtol=1e-5`.
  İlk koşu kırmızı: wrapper training modu export sonunda referans modelde dropout açtı. `.eval()`
  düzeltmesiyle yeşil. Komut: `uv run --directory services/worker-py --extra ner python -m unittest
  discover -s ../../eval/anon -p 'test_export_ner.py'`.
- Gerçek sabit cache ağırlığı, akdeniz 50 sentetik belge: max logit farkı 0.0000460148; transformer 5
  pipeline PERSON span uyumu %98,65. Eski manifestteki %99,10 farklı pipeline sürümüdür. Eski cache ONNX
  ve yeni graph aynı runtime ile ayrıca karşılaştırıldı: eski PERSON 440, yeni 440, kesişim 440,
  **runtime span kaybı yok**. Yeni ONNX SHA256:
  `d360b18c97f47570235f91f7f51a383c597e0a079eb59c9df6a18539ffa45340`.
- Hushmark 402 paragraf: span eşliği 1.0, max skor farkı 0.00000572205; sınır aşımı nedeniyle atlanan 0.
- Yeni Python yığını: 145 geçti, 1 optional test atlandı. Ruff yeni tarama/export testlerinde temiz.

Gerçek export çıktıları yalnız `/tmp/kazuist-ner-security-export` altında üretildi, eski model cache
çıktıları değiştirilmedi. Alan sıkışıklığında kendi yeni model çıktıları SHA/manifest ölçümü sonrası
kaldırıldı; manifest kopyaları `/tmp/kazuist-akdeniz-manifest.json` ve
`/tmp/kazuist-hushmark-manifest.json` olarak korunur. İlk disk hataları başarı sayılmadı.

GLiNER 20 belge yeni-yığın export/parity denemesi henüz geçmedi: `OSError: [Errno 28] No space left on
 device` nedeniyle model yazılamadı. Import ve metadata uyumu tam export eşliği yerine geçmez. Orkestra
alanı doğrulamadan yeni büyük export başlatılmaz. O-07 güvenlik açığı sayısı temiz olsa da bu major
uyumluluk kabulü ve tam final tarama/CI ölçümü tamamlanmadan iş kapalı sayılmaz.

### GLiNER salt okunur uyumluluk ölçümü

Yeni GLiNER0.2.29/Transformers5.16.1 Torch referansı mevcut sabit cache ONNX grafiğiyle 20 sentetik belgede
ölçüldü: 150 birleşik span, eşlik **1.0**, max skor farkı **0.0000199676**. Çıktı
`/tmp/kazuist-gliner-cached-parity.log`; ağ kapalı, yeni büyük dosya yok, cache kaynak/çıktıları değişmedi.
Bu, yeni Torch yığınının mevcut ONNX modelle uyumunu kanıtlar; disk28 nedeniyle tamamlanamayan yeni GLiNER
export işleminin yerine geçmez. Yeni Python export ortamı lisans denetimi de 55 paket için çıkış0.

Kapanış için final tam tarama ve dört CI işi, ardından bağımsız denetim orkestradadır. esbuild orta
bulgusu raporda açık kalır; Node yüksek eşiği düşürülmedi.

### 26 Ekim: yeni GLiNER export ve CI kabulü

Diskte 20 GiB boş alan doğrulandıktan sonra gerçek sabit kaynak ağırlığıyla GLiNER yeniden dışa aktarıldı. Ağ kapalı; çıktı yalnız `/tmp/kazuist-gliner-final-20261026/model/`, kaynak cache değişmedi. Yeni ONNX SHA256 `03f8a927c1c010c337bce2dfe9d25cdb41a245f4a8e26ff8cd457028beb0e3ef`. 20 sentetik belgede Torch/ONNX span eşliği 1.0, max skor farkı 0.0000199676. Manifest kaynak/model hashleri ve ortam sürümlerini içerir. Önceki disk engeli bu ölçümle kapandı.

PR #37 CI40213483001 dört iş başarı; gerçek tarama `tarama status 0`, all-extras pip-audit çıkış0, tarama regresyonları geçti. Esbuild orta bulgusu mevcut yüksek eşik politikasında raporlanır ve bağımsız denetim beklenir; bu sonuç tüm güvenlik işlerinin kapandığı anlamına gelmez.
