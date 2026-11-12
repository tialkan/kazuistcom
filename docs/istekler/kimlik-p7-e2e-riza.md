# İstek: /kayit e2e testinde rıza kutusu

1. İsteyen: kimlik, dal `codex/p7-hesap-arayuzu` (review.md P7 madde 3). Kime: kalite-guvenlik (`tests/e2e/**`).
2. Gerekçe: `/kayit` formunda artık zorunlu bir onay kutusu var ("Kullanım koşullarını okudum ve kabul ediyorum.
   Aydınlatma metnini okudum."). Kutu işaretlenmeden tarayıcı formu göndermez. `tests/e2e/specs/hesap.spec.ts`
   içindeki "/kayit offers an e-mail and password form that creates the account" testi kutuyu işaretlemediği için
   `pnpm e2e` ile çalıştırıldığında `/api/v1/me` 401 kalır.
3. Önerilen değişiklik: parola doldurulduktan sonra, düğmeye basmadan önce
   `await page.getByRole('checkbox').check();` satırı. İsterseniz kayıttan sonra
   `GET /api/v1/me/consents` yanıtında `kullanim_kosullari` ve `aydinlatma` satırlarının `granted: true` olduğu da
   denetlenebilir.
4. Bu PR'ın kendi doğrulaması: yerel üretim derlemesine karşı aynı akış (kutusuz gönderim engelleniyor, kutuyla
   hesap açılıyor ve iki rıza satırı güncel sürümle yazılıyor) Playwright ile geçti.
5. `/giris` testleri değişmeden geçer: sayfada adı "giriş" içeren tek düğme ("Giriş yap") ve etiketi "e-posta" içeren
   tek alan kalacak biçimde tasarlandı.
6. Aciliyet: orta; `pnpm e2e` kapısı bu satır olmadan bu testte kırmızıdır.

Durum: kapandı (12 Kasım 2026). Orkestra satırı aynı PR'da ekledi.
