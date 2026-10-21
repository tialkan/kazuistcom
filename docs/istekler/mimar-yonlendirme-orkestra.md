# Yönlendirme: orkestraya ve Tarık'a (sözleşme v1.1)

Kimden: mimar, dal `dalga-1/mimar/istekler`. Kime: orkestra (plan sahibi, ortak dosyalar) ve Tarık.
Dayanak: ADR-0021, ADR-0022, ADR-0023, `hukuk-uyum-urun-tutarliligi.md` (madde 1, 2, 10).

## Bu PR'da orkestra adına değişen ortak dosyalar (orkestranın talimatıyla)

`pnpm-workspace.yaml` (drizzle-orm overrides, dedupePeerDependents), `pnpm-lock.yaml`, `apps/web/package.json`
(drizzle-orm, iovalkey), `apps/worker-node/package.json` (build betiği, esbuild), `apps/worker-node/src/main.ts`
(notify.send ve billing kaydı, SIGTERM). Yeni bağımlılıkların lisansları: iovalkey MIT ve alt bağımlılıkları
MIT veya Apache-2.0; esbuild MIT (zaten ağaçtaydı).

## Orkestra

1. Plan 4.5 dayanak atıfları (madde 1): Abonelik Sözleşmeleri Yönetmeliği m.2/2 uygulanacak maddeleri
   sınırlıyor; 4.5/7, 4.5/8 ve 4.5/9'daki m.15, m.16, m.19-20 ve m.22 atıfları kanuni zorunluluk diye
   yazılmamalı (hukuk-uyum'un bulgusu, sonraki değişiklikler doğrulanmalı).
2. Plan 5.3 ve Ek A.1'de MinIO yerine SeaweedFS (ADR-0021).
3. `api/v1/takedown-requests/**` ve `api/v1/admin/**` yollarının sahibi atanmalı.
4. Hesap silme işleyicisi (`apps/worker-node/src/account/**`, kimlik) ve gerçek billing bağımlılıkları (odeme)
   geldiğinde `apps/worker-node/src/handlers.ts` ve `main.ts` kaydı.

## Tarık kararları

1. ADR-0021, ADR-0022, ADR-0023 onayı.
2. Hesap silme bekleme süresi: önerilen 14 gün, üst sınır 30 gün.
3. Abonelikte cayma: ilk dönem kredisi hiç kullanılmamış abonelikte ne olacağı (madde 2).
4. Yaş sınırı: kullanım koşullarında 18 yaş taslak; kayıtta yaş beyanı alınacak mı (madde 10).
