import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };
import { getMe } from '@/server/auth/account';
import { requirePageSession } from '@/server/auth/page-session';
import { listProfessions } from '@/server/auth/professions';
import { AltSayfa } from '../../_bilesen/AltSayfa';
import { HedefFormu } from '../../_bilesen/HedefFormu';

const s = tr.sayfa.hedef;

export const metadata: Metadata = { title: s.baslik, robots: { index: false } };

/** Profession list from the same source as GET /v1/professions; the form puts /v1/me/target-profession. */
export default async function HedefPage() {
  const { principal, ctx } = await requirePageSession('/hesap/hedef');
  const me = await getMe(ctx, principal.userId);
  return (
    <AltSayfa baslik={s.baslik} aciklama={s.aciklama}>
      <HedefFormu
        meslekler={listProfessions()}
        secili={me?.targetProfession ?? null}
        seciliAvatar={me?.avatar ?? null}
      />
    </AltSayfa>
  );
}
