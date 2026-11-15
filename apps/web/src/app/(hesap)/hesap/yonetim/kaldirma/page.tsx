import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { staffReady } from '@/server/auth/account-view';
import { requirePageSession } from '@/server/auth/page-session';
import { listTakedownQueue, overdueHideCount, type TakedownQueueItem } from '@/server/auth/review-queues';
import { AltSayfa } from '../../../_bilesen/AltSayfa';
import styles from '../../../_bilesen/hesap.module.css';
import { doldur, tarihTr } from '../../../_bilesen/istek';
import { KuyrukKarari, type KararSecenegi } from '../../../_bilesen/KuyrukKarari';

const s = tr.sayfa.kaldirmaKuyrugu;
const o = tr.sayfa.yonetimOrtak;

export const metadata: Metadata = { title: s.baslik, robots: { index: false, follow: false } };

const offsetOf = (raw: string | string[] | undefined) => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^[0-9]{1,6}$/.test(v) ? Number(v) : 0;
};

const saatTr = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(iso));

const etiket = <T extends Record<string, string>>(m: T, k: string) => (k in m ? m[k as keyof T] : k);

/** Buttons per step: what onay, duzelt and ret mean depends on where the request stands (takedown.ts). */
function secenekler(k: TakedownQueueItem): KararSecenegi[] {
  const e =
    k.step === 'release'
      ? s.eylemler.release
      : k.status === 'gecici_gizlendi'
        ? s.eylemler.gecici_gizlendi
        : s.eylemler.bekliyor;
  const onaySonuc = k.step === 'decision' && k.status === 'bekliyor' ? s.gizlendi : o.kaydedildi;
  const duzeltSonuc = k.step === 'release' ? s.yenidenMaske : o.kaydedildi;
  return [
    { karar: 'onay', etiket: e.onay, sonuc: onaySonuc },
    { karar: 'duzelt', etiket: e.duzelt, sonuc: duzeltSonuc },
    { karar: 'ret', etiket: e.ret, sonuc: o.kaydedildi },
  ];
}

function Talep({ k }: { k: TakedownQueueItem }) {
  const baslikId = `talep-${k.id}`;
  const r = k.record;
  const no = r
    ? [r.esasNo ? `E. ${r.esasNo}` : null, r.kararNo ? `K. ${r.kararNo}` : null].filter(Boolean)
    : [];
  return (
    <article className={styles.aday} aria-labelledby={baslikId}>
      <h2 id={baslikId}>
        {etiket(s.adimlar, k.step)}: {etiket(s.turler, k.kind)}
      </h2>
      {k.hide ? (
        <p className={k.hide.state === 'ok' ? styles.soluk : styles.hata}>
          {s.gizlemeSonu}: {saatTr(k.hide.dueAt)}.{' '}
          {doldur(s.sure[k.hide.state], { n: Math.abs(k.hide.hoursLeft) })}
        </p>
      ) : null}
      <dl className={styles.ozet}>
        <dt>{s.durum}</dt>
        <dd>{etiket(s.durumlar, k.status)}</dd>
        <dt>{s.hedef}</dt>
        <dd>
          {r ? (
            <>
              {[r.court, r.title].filter(Boolean).join(', ')}
              {no.length ? ` (${no.join(', ')})` : null}
            </>
          ) : (
            s.hedefYok
          )}
        </dd>
        <dt>{s.gerekce}</dt>
        <dd>{k.reason}</dd>
        {k.rightsInfo ? (
          <>
            <dt>{s.hak}</dt>
            <dd>{k.rightsInfo}</dd>
          </>
        ) : null}
        <dt>{s.alindi}</dt>
        <dd>{tarihTr(k.createdAt)}</dd>
        {k.answerDueAt ? (
          <>
            <dt>{s.cevapSonu}</dt>
            <dd>{tarihTr(k.answerDueAt)}</dd>
          </>
        ) : null}
      </dl>
      {k.step === 'release' ? <p className={styles.soluk}>{s.yayinAciklama}</p> : null}
      <KuyrukKarari kuyruk="takedowns" kalemId={k.id} secenekler={secenekler(k)} />
    </article>
  );
}

/**
 * Staff screen of the takedowns queue (FR-79, FR-108). Same gate as the admin API (editor or yonetici, passkey
 * session, TOTP step); a non staff account gets 404. Requests past the 72 hour hiding deadline come first and
 * a banner counts them.
 */
export default async function KaldirmaKuyruguPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { principal, ctx } = await requirePageSession('/hesap/yonetim/kaldirma');
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
  const [{ items, next }, gecikmis] = await Promise.all([
    listTakedownQueue(ctx, offset),
    overdueHideCount(ctx),
  ]);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      {gecikmis > 0 ? <p className={styles.hata}>{doldur(s.gecikmis, { n: gecikmis })}</p> : null}
      {items.length ? <p className={styles.soluk}>{doldur(o.sayi, { n: items.length })}</p> : <p>{s.bos}</p>}
      {items.map((k) => (
        <Talep key={k.id} k={k} />
      ))}
      {offset > 0 || next !== null ? (
        <nav className={styles.eylemler} aria-label={s.baslik}>
          {offset > 0 ? <Link href="/hesap/yonetim/kaldirma">{o.ilk}</Link> : null}
          {next !== null ? <Link href={`/hesap/yonetim/kaldirma?sayfa=${next}`}>{o.sonraki}</Link> : null}
        </nav>
      ) : null}
    </AltSayfa>
  );
}
