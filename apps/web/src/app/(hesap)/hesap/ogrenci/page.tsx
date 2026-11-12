import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { getMe } from '@/server/auth/account';
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { OgrenciFormu } from '../../_bilesen/OgrenciFormu';

const s = tr.sayfa.ogrenci;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** edu.tr verification (plan 10.1): code by e-mail, renewed yearly. */
export default async function OgrenciPage() {
  const { principal, ctx } = await requirePageSession('/hesap/ogrenci');
  const me = await getMe(ctx, principal.userId);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <OgrenciFormu dogrulandi={me?.eduVerified ?? false} />
    </AltSayfa>
  );
}
