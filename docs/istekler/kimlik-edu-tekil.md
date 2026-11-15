# İstek: edu.tr adresi yalnız bir hesapta doğrulanabilsin (veritabanı güvencesi)

## 1. İsteyen

kimlik ajanı, dal `kimlik/purge-takedown-verified-gates`.

## 2. Gerekçe

Plan 10.1/3 ve 4.2: edu.tr doğrulaması günlük ücretsiz özet hakkını 2'den 5'e çıkarır ve
`ogrenci_dogrulanmis` rolünü verir. Bugün aynı kurum adresi (ya da `ali+1@`, `Ali@` gibi aynı posta kutusuna
düşen biçimleri) birden çok hesapta doğrulanabiliyordu; bu, ücretsiz hakkın hesap çoğaltılarak katlanmasına
yol açar.

Kimlik bu dalda kodla zorluyor (`apps/web/src/server/auth/edu.ts`):

- Adres `normalizeEduEmail` ile tek biçime indirilir: küçük harf, baş ve sondaki boşluk, alan adının sonundaki
  nokta ve `+etiket` atılır. `edu_verifications.email` artık bu biçimle yazılır; kod kullanıcının yazdığı
  adrese gider.
- Başka bir hesapta `verified_at` dolu bir satır varsa kod gönderilmez (400, `hata.eduKullanimda`).
- Onay, `pg_advisory_xact_lock(hashtextextended('edu:<adres>', 0))` altında yeniden denetlenir; aynı anda onaylayan
  iki hesaptan yalnız biri doğrulanır.

Kod güvencesi tek yazıcı varken yeterlidir; veritabanı kısıtı olmadan başka bir yazıcı (yönetici aracı, betik,
ileride iOS uç noktası) kuralı atlayabilir.

## 3. Önerilen değişiklik

`edu_verifications` her yıllık yenilemede yeni satır açtığı için `email` üzerinde düz bir tekil indeks
kullanılamaz (aynı kullanıcının iki doğrulanmış satırı olur). İki seçenek:

A. Talep tablosu (önerilen):

```ts
export const eduClaims = pgTable('edu_claims', {
  /** normalizeEduEmail biçimi. */
  email: text('email').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  verifiedAt: ts('verified_at').notNull(),
});
```

Onay işlemi `insert ... on conflict (email) do update set verified_at = excluded.verified_at where
edu_claims.user_id = excluded.user_id` yapar; dönen satır yoksa adres başkasınındır. `account.purge` satırı
ON DELETE CASCADE ile ya da açıkça siler (`purgeSteps`'e eklenir).

B. İfade indeksi: `create unique index edu_verifications_claim_uq on edu_verifications
(regexp_replace(rtrim(lower(trim(email)), '.'), '\+[^@]*@', '@'), user_id) where verified_at is not null`
kullanıcı başına tekrarı engellemez ve iki kullanıcıyı ayırmaz; tek başına yetmez. Bu yüzden A önerilir.

## 4. Geriye uyumluluk

Yeni tablo eklemek yıkıcı değildir. Mevcut doğrulanmış satırlar migration içinde normalize edilerek
`edu_claims`'e taşınmalı; aynı adresi iki hesapta doğrulamış eski kayıt varsa en eski `verified_at` kazanır,
diğerleri raporlanır (silinmez; karar Tarık'ın). Sözleşme uçları (`/v1/me/edu-verification`) değişmez.

## 5. Aciliyet

Bekleyebilir: kod güvencesi bu dalda devrede. Veritabanı kısıtı geldiğinde kimlik `claimedByOther`
denetimini tablo üzerinden yapacak biçimde sadeleştirir.
