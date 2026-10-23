/**
 * Texts of billing notices (audit Y5). notify.send carries refId "<kind>:<ref>" (billing/notices.ts); the
 * ref holds what the text needs: renewal and price notices "<subscription>:<kurus>:<date>", payment
 * received "<order>:<kurus>", cancellation "<subscription>:<donem_sonu|hemen>:<end date>". kimlik's
 * dispatch calls renderBillingNotice for odeme and fesih_teyidi when a refId is present (istek).
 */
import tr from '@kazuist/i18n/tr/odeme.json' with { type: 'json' };

export interface BillingMessage {
  title: string;
  body: string;
  path: string;
}

const tl = (kurus: string) => {
  const n = Number(kurus);
  return Number.isFinite(n)
    ? (n / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
};
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
};

type Key = keyof typeof tr.bildirim;

function fill(key: Key, vars: Record<string, string | null>): BillingMessage | null {
  const t = tr.bildirim[key];
  let missing = false;
  const body = t.metin.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    if (!v) missing = true;
    return v ?? '';
  });
  return missing ? null : { title: t.baslik, body, path: '/hesap/cuzdan' };
}

/** Message for a billing refId, or null when the refId is not a billing notice or lacks a value. */
export function renderBillingNotice(refId: string): BillingMessage | null {
  const [kind, ...rest] = refId.split(':');
  // Dates are ISO strings that contain ':'; the date is always the tail of the ref.
  switch (kind) {
    case 'odeme_7_gun':
    case 'yillik_30_gun':
    case 'fiyat_degisikligi': {
      const [, kurus, ...date] = rest;
      return fill(kind, { tutar: tl(kurus ?? ''), tarih: day(date.join(':')) });
    }
    case 'odeme_alindi':
      return fill('odeme_alindi', { tutar: tl(rest[1] ?? '') });
    case 'odeme_basarisiz':
    case 'plan_ucretsize_indi':
    case 'sozlesme':
      return fill(kind, {});
    case 'fesih_teyidi': {
      const [, mode, ...date] = rest;
      return fill(mode === 'hemen' ? 'fesih_hemen' : 'fesih_donem_sonu', { tarih: day(date.join(':')) });
    }
    default:
      return null;
  }
}
