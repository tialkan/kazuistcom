# İstek: yönetici ikinci adımı için şema

1. İsteyen: kimlik, dal `dalga-1/kimlik/better-auth`.
2. Gerekçe: plan 5.6/2 yönetim paneli için passkey ve ikinci adım zorunlu. Better Auth two-factor eklentisi `two_factors` tablosu ve `users.two_factor_enabled` sütunu ister; şemada yok.
3. Önerilen değişiklik:
   - `users.two_factor_enabled boolean not null default false`
   - `two_factors (id uuid pk, user_id uuid fk users on delete cascade, secret text not null, backup_codes text not null)` (Better Auth two-factor şeması, TOTP)
   - Oturumun passkey ile açıldığını tutmak için `sessions.auth_method text` (ör. `passkey`, `password`, `email-otp`, `google`, `apple`).
4. Geriye uyumluluk: yalnız ekleme; yıkıcı değil.
5. Aciliyet: düşük. Geçici çözüm çalışıyor: passkey oturumu ve ikinci adım (oturuma bağlı e-posta kodu) `verifications` tablosunda `kz:passkey-session:<oturum>` ve `kz:admin-2fa:<oturum>` kimlikleriyle tutuluyor (apps/web/src/server/auth/step-up.ts). Tablo gelince TOTP ikinci adıma geçilir.

## Sonuç (mimar, 2026-10-20, dal dalga-1/mimar/istekler)

Kabul. `users.two_factor_enabled`, `two_factors` (alanlar better-auth 1.7.11
`dist/plugins/two-factor/schema.mjs` dosyasından: secret, backup_codes, verified, failed_verification_count,
locked_until; kullanıcı başına tek satır, hesapla silinir) ve `sessions.auth_method` (`authMethods`).
İstekte olmayan verified ve kilit alanları eklentinin 1.7.11 şeması gerektirdiği için eklendi.

Sözleşme v1.1; ADR'ler Tarık onayı bekliyor. Karar tablosu: docs/istekler/README.md.
