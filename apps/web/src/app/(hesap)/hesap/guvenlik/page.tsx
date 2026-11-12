import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { listOwnPasskeys, securityStatus } from '@/server/auth/account-view';
import { requirePageSession } from '@/server/auth/page-session';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { IkiAdimKurulumu, PasskeyYonetimi, YoneticiOnayi } from '../../_bilesen/Guvenlik';

const s = tr.sayfa.guvenlik;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Passkeys, TOTP enrolment and, for staff, the admin step up (server/auth/guard.ts adminAllowed). */
export default async function GuvenlikPage() {
  const { principal, ctx } = await requirePageSession('/hesap/guvenlik');
  const [durum, passkeys] = await Promise.all([
    securityStatus(ctx, principal),
    listOwnPasskeys(ctx, principal.userId),
  ]);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      {durum.staff ? (
        <YoneticiOnayi
          passkeySession={durum.passkeySession}
          totpEnabled={durum.totpEnabled}
          secondStep={durum.secondStep}
        />
      ) : null}
      <PasskeyYonetimi passkeys={passkeys} />
      <IkiAdimKurulumu acik={durum.totpEnabled} parolaGerekli={durum.hasPassword} />
    </AltSayfa>
  );
}
