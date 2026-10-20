# İstek: yönetici ikinci adımı için şema

1. İsteyen: kimlik, dal `dalga-1/kimlik/better-auth`.
2. Gerekçe: plan 5.6/2 yönetim paneli için passkey ve ikinci adım zorunlu. Better Auth two-factor eklentisi `two_factors` tablosu ve `users.two_factor_enabled` sütunu ister; şemada yok.
3. Önerilen değişiklik:
   - `users.two_factor_enabled boolean not null default false`
   - `two_factors (id uuid pk, user_id uuid fk users on delete cascade, secret text not null, backup_codes text not null)` (Better Auth two-factor şeması, TOTP)
   - Oturumun passkey ile açıldığını tutmak için `sessions.auth_method text` (ör. `passkey`, `password`, `email-otp`, `google`, `apple`).
4. Geriye uyumluluk: yalnız ekleme; yıkıcı değil.
5. Aciliyet: düşük. Geçici çözüm çalışıyor: passkey oturumu ve ikinci adım (oturuma bağlı e-posta kodu) `verifications` tablosunda `kz:passkey-session:<oturum>` ve `kz:admin-2fa:<oturum>` kimlikleriyle tutuluyor (apps/web/src/server/auth/step-up.ts). Tablo gelince TOTP ikinci adıma geçilir.
