import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { marketingConsent } from '@/server/auth/account-view';
import { getNotificationPreferences } from '@/server/auth/notifications';
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { BildirimTercihleri } from '../../_bilesen/BildirimTercihleri';

const s = tr.sayfa.bildirimler;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Notification preferences (PUT /api/v1/notifications/preferences) and the separate commercial consent. */
export default async function BildirimlerPage() {
  const { principal, ctx } = await requirePageSession('/hesap/bildirimler');
  const [tercihler, ticari] = await Promise.all([
    getNotificationPreferences(ctx, principal.userId),
    marketingConsent(ctx, principal.userId),
  ]);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <BildirimTercihleri tercihler={tercihler} ticari={ticari} />
    </AltSayfa>
  );
}
