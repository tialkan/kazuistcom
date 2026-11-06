import type { AuthorityClass } from '@kazuist/contracts';
import type { EtiketTuru, OtoriteSinifi } from '@kazuist/ui';
import type { Label } from '@kazuist/casuist';

/** Fills {name} placeholders of an i18n template. Values are plain text; React escapes them on render. */
export function doldur(sablon: string, degerler: Record<string, string | number>): string {
  return sablon.replace(/\{(\w+)\}/g, (m, k: string) => (k in degerler ? String(degerler[k]) : m));
}

/** 7.11.2026 style date (gg.aa.yyyy), from an ISO date or date-time. */
export function tarihTr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // A date-time is a moment: shown as the calendar day in Türkiye, not the UTC day.
  if (iso.length > 10) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(t);
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

/** Label of plan 7.3 to the shape and colour kind of the design system. */
export const etiketTuru: Record<Label, EtiketTuru> = {
  yeni: 'yeni',
  yerlesik: 'yerlesik',
  eski: 'eski',
  oncu: 'oncu',
  anonimlestirildi: 'anonim',
  ilgililik_yuksek: 'ilgililik',
  ilgililik_orta: 'ilgililik',
  ilgililik_arka_plan: 'ilgililik',
  guncellik_uyarisi: 'guncellik',
  canli_kaynak: 'canli',
  veri_gunu: 'veri-gunu',
};

/** Ek F class to the authority mark of the design system (FR-81: shape plus text). */
export function otoriteSekli(a: AuthorityClass): OtoriteSinifi {
  if (a === 'baglayici_norm' || a === 'baglayici_karar') return 'baglayici';
  if (a === 'yuksek_emsal') return 'yuksek-emsal';
  if (a === 'emsal' || a === 'emsal_sinirli') return 'emsal';
  return 'diger';
}

export const otoriteEtiketi = (a: AuthorityClass): EtiketTuru => {
  const s = otoriteSekli(a);
  return s === 'diger' ? 'diger-otorite' : s;
};

/** Query string for /ara, keeping only set values. */
export function araAdresi(p: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `/ara?${s}` : '/ara';
}
