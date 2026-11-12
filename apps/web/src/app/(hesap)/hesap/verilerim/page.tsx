import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { AccountDeletion } from './silme';

const s = tr.sayfa.veri;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** KVKK m.11 data export (JSON, CSV) and account deletion. */
export default async function VerilerimPage() {
  await requirePageSession('/hesap/verilerim');
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <ul>
        <li>
          <a href="/api/v1/me/export?format=json">{s.json}</a>
        </li>
        <li>
          <a href="/api/v1/me/export?format=csv">{s.csv}</a>
        </li>
      </ul>
      <AccountDeletion />
    </AltSayfa>
  );
}
