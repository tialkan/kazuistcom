# İstek: kabuktaki "Hedefim" alanına oturum bilgisi

1. İsteyen: kimlik, dal `codex/p7-hesap-arayuzu` (review.md P7). Kime: on-yuz (`apps/web/src/app/(kabuk)/_kabuk/Kabuk.tsx`).
   Kimlik bu dosyaya dokunmadı.
2. Gerekçe: Kabuk her durumda "Hedefim / Meslek seçin" yazıyor ve `/hesap`'e bağlanıyor. Oturum yoksa ziyaretçi
   `/hesap`'ten `/giris?sonra=%2Fhesap`'e yönlenir (bu PR); oturum varsa seçilen meslek görünmüyor ve giriş yapmamış
   kullanıcıya "Giriş yapın" yazmıyor.
3. Önerilen prop arayüzü (kimlik sağlar, on-yuz çizer):

```ts
/** Kabuk'a kök layout'tan verilir; null misafirdir. */
export interface KabukOturumu {
  /** Hedef meslek etiketi (hesap.json meslekler), seçilmediyse null. */
  hedef: string | null;
  /** avatar kimliği, ör. "avukat-n"; seçilmediyse null. */
  avatar: string | null;
}

export function Kabuk(props: { children: ReactNode; oturum: KabukOturumu | null }): JSX.Element;
```

   - Veri: `apps/web/src/server/auth/page-session.ts` `pageSession()` ve `server/auth/account.ts` `getMe()`;
     etiket `server/auth/professions.ts` `findProfession(id)?.label`. Oturum çerezi yoksa veri tabanına gidilmez.
   - Bağlantı: `oturum === null` ise `/giris` ve metin `ortak.json` içinde yeni bir "Giriş yapın" anahtarı;
     oturum varsa `/hesap/hedef` ve `hedef ?? hedefim.secilmedi`.
   - Çağrı yeri `apps/web/src/app/layout.tsx` (orkestra): `const s = await pageSession();` sonra
     `getMe` ile `KabukOturumu` kurulur. Kök layout zaten istek başına çalışıyor (`connection()`), ek önbellek
     sorunu yok.
4. Geriye uyumluluk: `oturum` zorunlu prop olursa layout ile aynı PR'da değişmeli; isteğe bağlı başlatmak da olur.
5. Aciliyet: düşük; işlev etkilenmiyor, yalnız kabuk bilgisi eksik.
