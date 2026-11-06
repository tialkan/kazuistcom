import { doldur, icerik, ilkHarfBuyuk, type Degiskenler, type Hitap } from './icerik.ts';

/**
 * notify.send carries no text (contracts NotifyPayload). Kalemcik reminders name their message in `refId`:
 *   kalemcik:<teslim14|teslim7|teslim3|teslim1|teslim0|sessizlik>:<sen|siz>:<variant>:<kalan>:<gunluk>:<gun>:<sessiz>
 * The notify worker asks `renderKalemcikNotice` for the text of types teslim_hatirlatmasi and kalemcik, the same
 * way billing notices work (notify/dispatch.ts `render`). The text comes from content/kalemcik.yaml. A project
 * name is user text and does not fit in a reference, so messages say "çalışmanız".
 */

export const BILDIRIM_ONEKI = 'kalemcik';
export type BildirimTuru = 'teslim14' | 'teslim7' | 'teslim3' | 'teslim1' | 'teslim0' | 'sessizlik';
const TURLER: readonly BildirimTuru[] = ['teslim14', 'teslim7', 'teslim3', 'teslim1', 'teslim0', 'sessizlik'];

export interface BildirimKaydi {
  tur: BildirimTuru;
  hitap: Hitap;
  varyant: number;
  kalan: number;
  gunluk: number;
  gun: number;
  sessiz: number;
}

export function refIdOlustur(k: BildirimKaydi): string {
  return [BILDIRIM_ONEKI, k.tur, k.hitap, k.varyant, k.kalan, k.gunluk, k.gun, k.sessiz].join(':');
}

const SAYI = /^\d{1,9}$/;

export function refIdCoz(refId: string): BildirimKaydi | null {
  const p = refId.split(':');
  if (p.length !== 8 || p[0] !== BILDIRIM_ONEKI) return null;
  const [, tur, hitap, ...sayilar] = p as [string, string, string, ...string[]];
  if (!TURLER.includes(tur as BildirimTuru) || (hitap !== 'sen' && hitap !== 'siz')) return null;
  if (!sayilar.every((s) => SAYI.test(s))) return null;
  const [varyant, kalan, gunluk, gun, sessiz] = sayilar.map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  return { tur: tur as BildirimTuru, hitap, varyant, kalan, gunluk, gun, sessiz };
}

export interface KalemcikMesaji {
  title: string;
  body: string;
  /** Path in the app that the notification opens. */
  path: string;
}

const CALISMA = 'çalışmanız';

/** Text of a reminder, or null when the reference is not a Kalemcik reference or names a missing variant. */
export function renderKalemcikNotice(refId: string): KalemcikMesaji | null {
  const k = refIdCoz(refId);
  if (!k) return null;
  const kaynak =
    k.tur === 'sessizlik' ? icerik.sessizlik : icerik.teslim[k.tur.slice(6) as '14' | '7' | '3' | '1' | '0'];
  const govde = kaynak.metin[k.varyant];
  if (!govde) return null;
  const d: Degiskenler = { calisma: CALISMA, kalan: k.kalan, gunluk: k.gunluk, gun: k.gun, sessiz: k.sessiz };
  return {
    title: doldur(kaynak.baslik[k.hitap], d),
    body: ilkHarfBuyuk(doldur(govde[k.hitap], d)),
    path: '/kalemcik',
  };
}
