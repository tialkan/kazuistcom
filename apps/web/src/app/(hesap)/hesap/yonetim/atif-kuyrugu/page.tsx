import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { staffReady } from '@/server/auth/account-view';
import { listCitationQueue } from '@/server/auth/citation-queue';
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../../_bilesen/AltSayfa';
import { AtifKuyrugu } from '../../../_bilesen/AtifKuyrugu';
import styles from '../../../_bilesen/hesap.module.css';
import { doldur } from '../../../_bilesen/istek';

const s = tr.sayfa.atifKuyrugu;

export const metadata: Metadata = { title: s.baslik, robots: { index: false, follow: false } };

const offsetOf = (raw: string | string[] | undefined) => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[0-9]{1,6}$/.test(v) ? Number(v) : 0;
};

/**
 * Editor screen of the citation queue (plan 10.9). Same gate as the admin API (guard.ts adminAllowed: editor or
 * yonetici, passkey session, TOTP step); a non staff account gets 404 so the page does not reveal itself.
 * Decisions go through POST /api/v1/admin/queues/citations/{id}/decision, which checks again on the server.
 */
export default async function AtifKuyruguPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { principal, ctx } = await requirePageSession('/hesap/yonetim/atif-kuyrugu');
  const { staff, ready } = await staffReady(ctx, principal);
  if (!staff) notFound();
  if (!ready) {
    return (
      <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
        <p className={styles.hata}>{s.yetkiYok}</p>
        <p>
          <Link href="/hesap/guvenlik">{s.guvenlige}</Link>
        </p>
      </AltSayfa>
    );
  }
  const offset = offsetOf((await searchParams).sayfa);
  const { items, next } = await listCitationQueue(ctx, offset);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      {items.length ? <p className={styles.soluk}>{doldur(s.sayi, { n: items.length })}</p> : <p>{s.bos}</p>}
      <AtifKuyrugu adaylar={items} />
      {offset > 0 || next !== null ? (
        <nav className={styles.eylemler} aria-label={s.baslik}>
          {offset > 0 ? <Link href="/hesap/yonetim/atif-kuyrugu">{s.ilk}</Link> : null}
          {next !== null ? <Link href={`/hesap/yonetim/atif-kuyrugu?sayfa=${next}`}>{s.sonraki}</Link> : null}
        </nav>
      ) : null}
    </AltSayfa>
  );
}
