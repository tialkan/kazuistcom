import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import byok from '@kazuist/i18n/tr/byok.json' with { type: 'json' };
import { getMe } from '@/server/auth/account';
import { pendingConsents, staffReady } from '@/server/auth/account-view';
import { requirePageSession } from '@/server/auth/page-session';
import { findProfession } from '@/server/auth/professions';
import styles from '../_bilesen/hesap.module.css';
import { CikisDugmesi, ProfilFormu, RizaKutusu } from '../_bilesen/HesapEylemleri';

const s = tr.sayfa.hesap;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

const bolumler = [
  { href: '/hesap/hedef', ...s.bolum.hedef },
  { href: '/hesap/ogrenci', ...s.bolum.ogrenci },
  { href: '/hesap/guvenlik', ...s.bolum.guvenlik },
  { href: '/hesap/bildirimler', ...s.bolum.bildirimler },
  { href: '/hesap/kvkk', ...s.bolum.kvkk },
  { href: '/hesap/verilerim', ...s.bolum.verilerim },
  { href: '/hesap/iade', ...s.bolum.iade },
  { href: '/hesap/yz-anahtari', baslik: byok.sayfa.hesapBag, aciklama: byok.sayfa.hesapAciklama },
];

/** Shown to editor and yonetici only; the screens check the full admin gate again. */
const yonetim = [{ href: '/hesap/yonetim/atif-kuyrugu', ...s.yonetim.atifKuyrugu }];

/** /hesap: profile summary, consent reminder, links to every account page and sign out. */
export default async function HesapPage() {
  const { principal, ctx } = await requirePageSession('/hesap');
  const me = await getMe(ctx, principal.userId);
  if (!me) redirect('/giris');
  const [eksik, { staff }] = await Promise.all([
    pendingConsents(ctx, principal.userId),
    staffReady(ctx, principal),
  ]);
  const meslek = me.targetProfession ? findProfession(me.targetProfession)?.label : undefined;
  return (
    <section className={`sayfa ${styles.alt}`}>
      <header className="sayfa-ust">
        <h1>{s.baslik}</h1>
        <p className="sayfa-ust__giris">{s.aciklama}</p>
      </header>
      {eksik.length ? <RizaKutusu eksik={eksik} /> : null}
      <section aria-labelledby="hesap-profil">
        <h2 id="hesap-profil">{s.profilBaslik}</h2>
        <dl className={styles.ozet}>
          <dt>{s.eposta}</dt>
          <dd>{me.email}</dd>
          <dt>{s.plan}</dt>
          <dd>{s.planlar[me.plan]}</dd>
          <dt>{s.ogrenci}</dt>
          <dd>{me.eduVerified ? s.dogrulandi : s.dogrulanmadi}</dd>
          <dt>{s.hedef}</dt>
          <dd>{meslek ?? s.secilmedi}</dd>
        </dl>
        <ProfilFormu ad={me.name ?? ''} />
      </section>
      <nav aria-labelledby="hesap-ayarlar">
        <h2 id="hesap-ayarlar">{s.ayarlarBaslik}</h2>
        <ul className={styles.bolumler}>
          {bolumler.map((b) => (
            <li key={b.href}>
              <Link href={b.href} className={styles.bolumBag}>
                <strong>{b.baslik}</strong>
                <span>{b.aciklama}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {staff ? (
        <nav aria-labelledby="hesap-yonetim">
          <h2 id="hesap-yonetim">{s.yonetimBaslik}</h2>
          <ul className={styles.bolumler}>
            {yonetim.map((b) => (
              <li key={b.href}>
                <Link href={b.href} className={styles.bolumBag}>
                  <strong>{b.baslik}</strong>
                  <span>{b.aciklama}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <CikisDugmesi />
    </section>
  );
}
