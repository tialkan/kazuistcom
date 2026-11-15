import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { staffReady } from '@/server/auth/account-view';
import { requirePageSession } from '@/server/auth/page-session';
import { listAnonymizationQueue, type AnonQueueItem } from '@/server/auth/review-queues';
import { AltSayfa } from '../../../_bilesen/AltSayfa';
import styles from '../../../_bilesen/hesap.module.css';
import { doldur } from '../../../_bilesen/istek';
import { KuyrukKarari } from '../../../_bilesen/KuyrukKarari';

const s = tr.sayfa.anonimKuyrugu;
const o = tr.sayfa.yonetimOrtak;

export const metadata: Metadata = { title: s.baslik, robots: { index: false, follow: false } };

const offsetOf = (raw: string | string[] | undefined) => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[0-9]{1,6}$/.test(v) ? Number(v) : 0;
};

const yuzde = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 });

function Kalem({ k }: { k: AnonQueueItem }) {
  const baslikId = `anon-${k.id}`;
  const r = k.record;
  const no = r
    ? [r.esasNo ? `E. ${r.esasNo}` : null, r.kararNo ? `K. ${r.kararNo}` : null].filter(Boolean)
    : [];
  return (
    <article className={styles.aday} aria-labelledby={baslikId}>
      <h2 id={baslikId}>
        {r ? [r.court, r.title].filter(Boolean).join(', ') : s.kayitYok}
        {no.length ? ` (${no.join(', ')})` : null}
      </h2>
      <dl className={styles.ozet}>
        {k.anonymizationVersion ? (
          <>
            <dt>{s.surum}</dt>
            <dd>{k.anonymizationVersion}</dd>
          </>
        ) : null}
        {k.childStrict ? (
          <>
            <dt>{s.cocuk}</dt>
            <dd>{s.cocukVar}</dd>
          </>
        ) : null}
        {k.blocked ? (
          <>
            <dt>{s.engel}</dt>
            <dd>{k.blocked}</dd>
          </>
        ) : null}
      </dl>
      {k.blocked ? <p className={styles.hata}>{s.engelUyari}</p> : null}
      {k.spans.length ? (
        <section aria-label={s.oneriler}>
          <p className={styles.soluk}>{s.metin}</p>
          {k.spans.map((p, i) => (
            <figure key={i}>
              <figcaption className={styles.soluk}>
                {[
                  `${s.tur}: ${p.entity}`,
                  `${s.maske}: ${p.mask}`,
                  p.detector ? `${s.yontem}: ${p.detector}` : null,
                  p.score !== null ? `${s.guven}: ${yuzde.format(p.score)}` : null,
                ]
                  .filter(Boolean)
                  .join('; ')}
              </figcaption>
              <blockquote className={styles.baglam}>
                {p.before}
                <mark>{p.span}</mark>
                {p.after}
              </blockquote>
            </figure>
          ))}
          {k.more ? <p className={styles.soluk}>{doldur(s.fazla, { n: k.more })}</p> : null}
        </section>
      ) : null}
      <KuyrukKarari
        kuyruk="anonymization"
        kalemId={k.id}
        secenekler={[
          { karar: 'onay', etiket: s.onayla, sonuc: s.onaylandi },
          { karar: 'ret', etiket: s.reddet, sonuc: s.reddedildi },
        ]}
      />
    </article>
  );
}

/**
 * Staff screen of the anonymization queue (plan 10.9). The decision is only recorded here; the anonymiser
 * publishes an approved record on its next run (services/worker-py/anonymizer/approvals.py). The original text
 * around each span is shown to staff only; a non staff account gets 404.
 */
export default async function AnonimKuyruguPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { principal, ctx } = await requirePageSession('/hesap/yonetim/anonimlestirme');
  const { staff, ready } = await staffReady(ctx, principal);
  if (!staff) notFound();
  if (!ready) {
    return (
      <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
        <p className={styles.hata}>{o.yetkiYok}</p>
        <p>
          <Link href="/hesap/guvenlik">{o.guvenlige}</Link>
        </p>
      </AltSayfa>
    );
  }
  const offset = offsetOf((await searchParams).sayfa);
  const { items, next } = await listAnonymizationQueue(ctx, offset);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      {items.length ? <p className={styles.soluk}>{doldur(o.sayi, { n: items.length })}</p> : <p>{s.bos}</p>}
      {items.map((k) => (
        <Kalem key={k.id} k={k} />
      ))}
      {offset > 0 || next !== null ? (
        <nav className={styles.eylemler} aria-label={s.baslik}>
          {offset > 0 ? <Link href="/hesap/yonetim/anonimlestirme">{o.ilk}</Link> : null}
          {next !== null ? (
            <Link href={`/hesap/yonetim/anonimlestirme?sayfa=${next}`}>{o.sonraki}</Link>
          ) : null}
        </nav>
      ) : null}
    </AltSayfa>
  );
}
