import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { KvkkFormu } from '../../_bilesen/KvkkFormu';

const s = tr.sayfa.kvkk;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** KVKK m.11 application for a signed in user (plan 10.10). */
export default async function KvkkPage() {
  await requirePageSession('/hesap/kvkk');
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <KvkkFormu />
    </AltSayfa>
  );
}
