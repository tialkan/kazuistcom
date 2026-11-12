import { ortak, upperTr, type OrtakSozluk } from '@kazuist/i18n';

/**
 * Session data the shell shows in the Hedefim slot (docs/istekler/kimlik-p7-kabuk-oturum.md). `null` is a
 * guest. Built on the server from the session cookie; it carries no e-mail and no identifier.
 */
export interface KabukOturumu {
  /** Display name from the account, trimmed; null when the user has not set one. */
  ad: string | null;
  /** Target profession label (hesap.json meslekler); null when none is chosen. */
  hedef: string | null;
  /** Avatar id such as "avukat-n"; null when none is chosen. Kept for the hand drawn set (ADR-0034). */
  avatar: string | null;
}

/** What the Hedefim link renders: target, the two text lines, the avatar initial and the title. */
export interface HedefimGorunumu {
  href: string;
  ust: string;
  alt: string;
  bas: string | null;
  baslik: string;
}

/** First letter of the name, upper cased with Turkish rules (i to İ). */
export const basHarf = (ad: string | null): string | null => {
  const ilk = ad ? Array.from(ad.trim())[0] : undefined;
  return ilk ? upperTr(ilk) : null;
};

/**
 * Guests go to /giris. A signed in user goes to /hesap, the hub that links every account page; without a
 * target profession the link opens /hesap/hedef so the empty slot can be filled in one step.
 */
export function hedefimGorunumu(oturum: KabukOturumu | null, t: OrtakSozluk = ortak()): HedefimGorunumu {
  if (!oturum)
    return {
      href: '/giris',
      ust: t.hedefim.etiket,
      alt: t.hedefim.girisYapin,
      bas: null,
      baslik: t.hedefim.girisAciklama,
    };
  return {
    href: oturum.hedef ? '/hesap' : '/hesap/hedef',
    ust: oturum.ad ?? t.gezinme.hesap,
    alt: oturum.hedef ?? t.hedefim.secilmedi,
    bas: basHarf(oturum.ad),
    baslik: oturum.hedef ? t.hedefim.hesapAciklama : t.hedefim.aciklama,
  };
}
