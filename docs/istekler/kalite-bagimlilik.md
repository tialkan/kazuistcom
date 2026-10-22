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
