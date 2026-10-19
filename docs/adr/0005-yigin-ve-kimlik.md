# ADR-0005: Yığın ve kimlik: TypeScript monorepo, Python işçi, PostgreSQL; kimlikte Better Auth

- Tarih: 2026-10-19
- Karar kodu: K-05 (plan.md bölüm 1)
- Durum: Önerildi, Tarık onayı bekliyor

## Bağlam

Ekip iki dil ve tek veri tabanıyla az hareketli parçalı bir yapı istiyor; ajanların paralel çalışması için modül sınırları net olmalı. Kimlikte e-posta ve parola, e-posta kodu, passkey, Google, Apple, HttpOnly oturum çerezi ve iOS için bearer gerekir (plan 5.3). Plan seçimi ADR-0005'e bırakmıştır. Ekip tezatatlascom deposunda better-auth 1.7 ve drizzle-orm 0.45 ile çalışıyor.

## Karar

1. Yığın: pnpm workspaces monorepo; apps/web Next.js App Router (16.4.2), apps/worker-node, services/worker-py (Python 3.12, uv), packages/* (plan 5.2); PostgreSQL 18 ve pgvector, pg_trgm; Valkey; Türkiye'de S3 uyumlu depo. Drizzle şemanın tek sahibidir; Python yalnız SQL ile okur ve yazar.
2. Kimlik: Better Auth (1.7.x). Drizzle bağdaştırıcısı, e-posta ve parola, e-posta OTP, passkey eklentisi, Google ve Apple sağlayıcıları, bearer eklentisi (iOS). Oturum çerezi HttpOnly, Secure, SameSite=Lax. Kimlik tabloları (users, sessions, accounts, passkeys, verifications) packages/db'de uuid kimlikle tanımlıdır.
3. Auth.js (next-auth paketi) seçilmedi.

## Gerekçe

Karşılaştırma:

| Ölçüt | Better Auth | Auth.js |
|---|---|---|
| E-posta ve parola | Yerleşik | Credentials sağlayıcısı, oturum veri tabanıyla zor; resmî olarak önerilmiyor |
| Passkey | Eklenti | Deneysel WebAuthn sağlayıcısı |
| E-posta kodu (OTP) | Eklenti | Magic link; kod akışı elle |
| iOS bearer | Bearer eklentisi | Elle yazılır |
| Drizzle | Resmî bağdaştırıcı, şema bizde | Resmî bağdaştırıcı |
| Ekip deneyimi | tezatatlascom'da üretimde | Yok |
| Lisans | MIT | ISC |

Better Auth gereksinimlerin tamamını yerleşik veya resmî eklentiyle karşılıyor ve ekip deneyimi var. İki dil, tek veri tabanı ve tek kuyruk (ADR-0006, Ek C.3) işletim yükünü düşük tutar.

## Sonuçlar

- Better Auth sürümü kurulumda resmî belgeden doğrulanır; kimlik ajanı packages/db şemasında değişiklik gerekirse docs/istekler/ altına yazar.
- Yönetim paneli için passkey ve ikinci adım zorunludur (plan 5.6/2).
- Better Auth uçları /api/auth/* altında, OpenAPI'de tek yol olarak belgelenmiştir.
- Better Auth projesi terk edilirse göç yolu: tablolar bizde olduğu için Auth.js veya kendi oturum katmanına geçiş şemayı bozmaz.

## Durum

Önerildi, Tarık onayı bekliyor.
