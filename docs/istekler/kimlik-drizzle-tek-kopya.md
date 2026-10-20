# İstek: drizzle-orm tek kopya

1. İsteyen: kimlik, dal `dalga-1/kimlik/better-auth`.
2. Gerekçe: better-auth 1.7.11 kysely getiriyor; pnpm apps/web için drizzle-orm 0.45.4'ün kysely eş bağımlılıklı ikinci bir varyantını çözüyor. packages/db şeması diğer varyantla kurulduğu için `eq(schema.users.id, ...)` gibi çağrılar tip hatası veriyor.
3. Önerilen değişiklik (biri yeter):
   - packages/db/package.json'a `kysely` (better-auth ile aynı sürüm, 0.29.7) devDependency olarak eklemek, böylece iki paket aynı varyanta düşer; veya
   - kök pnpm-workspace.yaml'de drizzle-orm için `peerDependencyRules`/`overrides` ile tek varyant; veya
   - packages/db'nin drizzle-orm operatörlerini (`eq`, `and`, ...) ve sürücü fabrikalarını yeniden dışa aktarması.
4. Geriye uyumluluk: etkisiz.
5. Aciliyet: düşük. Geçici çözüm: apps/web/src/server/auth/orm.ts drizzle-orm'u packages/db'nin kopyasından göreli yolla yeniden dışa aktarıyor; apps/web package.json'da drizzle-orm yok. İstek uygulanınca orm.ts kaldırılır.
