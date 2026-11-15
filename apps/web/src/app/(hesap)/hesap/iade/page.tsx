import type { Metadata } from 'next';
import Link from 'next/link';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { Dugme } from '@kazuist/ui';
import { kunye } from '@/app/(kabuk)/_kabuk/kunye';
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import styles from '../../_bilesen/hesap.module.css';
import { doldur } from '../../_bilesen/istek';

const s = tr.sayfa.iade;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/**
 * Refund request path (review.md P8 madde 3, hukuk-uyum-p5-tutarlilik.md madde 4). The pre-information form sends
 * the withdrawal notice to the company e-mail from the registered address; this page gives that address, the
 * account's registered one and the rules. An in-app request per order needs an order list (odeme), see
 * docs/istekler/kimlik-iade-siparis-listesi.md.
 */
export default async function IadePage() {
  const { principal } = await requirePageSession('/hesap/iade');
  const mailto = `mailto:${kunye.eposta}?subject=${encodeURIComponent(s.konu)}`;
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <p>{s.kural}</p>
      <p>{doldur(s.nasil, { eposta: kunye.eposta })}</p>
      <p className={styles.soluk}>{doldur(s.kayitli, { eposta: principal.email })}</p>
      <div className={styles.eylemler}>
        <Dugme href={mailto}>{s.gonder}</Dugme>
      </div>
      <p className={styles['alt-bag']}>{s.sure}</p>
      <p>{s.silme}</p>
      <ul>
        <li>
          <Link href="/hukuki/iade-ve-kredi">{s.kurallar}</Link>
        </li>
        <li>
          <Link href="/hesap/verilerim">{s.verilerim}</Link>
        </li>
      </ul>
    </AltSayfa>
  );
}
