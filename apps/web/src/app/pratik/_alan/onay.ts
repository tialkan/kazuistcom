/**
 * Editor approval flow of the cards (plan 10.6/4, FR-62, FR-106 "kart" queue). Pure rules over the card data;
 * persistence of an approval is the editor tool (content/desteler/onayla.ts) and, later, the admin queue
 * (docs/istekler/pratik-onay-kuyrugu.md).
 *
 * Rules: a draft needs a source verified word for word before anyone can approve it; the author cannot approve
 * their own card; one editor approves a version once; HMGS cards need two different editors, other cards one; any
 * change to the question, the answer or the source raises the version and the old approvals stop counting.
 */
import {
  gecerliOnaylar,
  gerekenOnay,
  kartDurumu,
  kaynakDogrulandiMi,
  type Deste,
  type Kart,
  type KartDurumu,
} from './kart.ts';

export type OnayHatasiKodu = 'kaynak_dogrulanmadi' | 'yazar' | 'tekrar' | 'gerek_yok' | 'ad';

export class OnayHatasi extends Error {
  readonly kod: OnayHatasiKodu;
  constructor(kod: OnayHatasiKodu, mesaj: string) {
    super(mesaj);
    this.name = 'OnayHatasi';
    this.kod = kod;
  }
}

const ayniAd = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

/** True when `editor` may approve this version of the card now. */
export function onaylayabilir(
  k: Kart,
  editor: string,
  hmgs: boolean,
): { evet: true } | { evet: false; neden: OnayHatasiKodu } {
  if (editor.trim().length < 3) return { evet: false, neden: 'ad' };
  if (!kaynakDogrulandiMi(k)) return { evet: false, neden: 'kaynak_dogrulanmadi' };
  if (ayniAd(k.hazirlayan, editor)) return { evet: false, neden: 'yazar' };
  const onaylar = gecerliOnaylar(k);
  if (onaylar.some((o) => ayniAd(o.ad, editor))) return { evet: false, neden: 'tekrar' };
  if (onaylar.length >= gerekenOnay(hmgs)) return { evet: false, neden: 'gerek_yok' };
  return { evet: true };
}

const MESAJLAR: Record<OnayHatasiKodu, string> = {
  ad: 'the editor name is too short',
  kaynak_dogrulanmadi:
    'the source of this card is not verified word for word yet (run content/desteler/dogrula.ts)',
  yazar: 'the author of a card cannot approve it',
  tekrar: 'this editor has already approved this version',
  gerek_yok: 'this version already has all the approvals it needs',
};

/** Adds one editor approval for the current version. Throws OnayHatasi when a rule forbids it. */
export function onayla(k: Kart, editor: string, tarih: string, hmgs: boolean): Kart {
  const s = onaylayabilir(k, editor, hmgs);
  if (!s.evet) throw new OnayHatasi(s.neden, MESAJLAR[s.neden]);
  return { ...k, editorler: [...k.editorler, { ad: editor.trim(), tarih, surum: k.surum }] };
}

export interface KartDegisikligi {
  soru?: string;
  secenekler?: string[];
  dogruIndex?: number;
  aciklama?: string;
  kaynaklar?: Kart['kaynaklar'];
}

/**
 * Applies an edit. The version goes up and every old approval stops counting. A changed source loses its
 * verification mark, so the card falls back to draft until dogrula.ts passes again.
 */
export function degistir(k: Kart, degisiklik: KartDegisikligi, tarih: string): Kart {
  const kaynakDegisti =
    degisiklik.kaynaklar !== undefined &&
    JSON.stringify(degisiklik.kaynaklar) !== JSON.stringify(k.kaynaklar);
  const icerikDegisti = (['soru', 'secenekler', 'dogruIndex', 'aciklama'] as const).some(
    (alan) => degisiklik[alan] !== undefined && JSON.stringify(degisiklik[alan]) !== JSON.stringify(k[alan]),
  );
  if (!kaynakDegisti && !icerikDegisti) return k;
  const kaynaklar = (degisiklik.kaynaklar ?? k.kaynaklar).map((x) =>
    kaynakDegisti ? { ...x, dogrulamaTarihi: null, maddeOzeti: null } : x,
  );
  return { ...k, ...degisiklik, kaynaklar, surum: k.surum + 1, guncelleme: tarih };
}

export interface KuyrukSatiri {
  desteSlug: string;
  desteBasligi: string;
  kart: Kart;
  durum: KartDurumu;
  hmgs: boolean;
  /** Approvals still missing before the card can be published. */
  eksikOnay: number;
}

const SIRA: Record<KartDurumu, number> = { onay_bekliyor: 0, taslak: 1, yayinda: 2 };

/** Editor queue: cards that are not published, the ones ready for an editor first. */
export function onayKuyrugu(desteler: readonly Deste[]): KuyrukSatiri[] {
  const satirlar: KuyrukSatiri[] = [];
  for (const d of desteler) {
    for (const k of d.kartlar) {
      const hmgs = d.hmgsAlani !== null;
      const durum = kartDurumu(k, hmgs);
      if (durum === 'yayinda') continue;
      satirlar.push({
        desteSlug: d.slug,
        desteBasligi: d.baslik,
        kart: k,
        durum,
        hmgs,
        eksikOnay: gerekenOnay(hmgs) - gecerliOnaylar(k).length,
      });
    }
  }
  return satirlar.sort((a, b) => SIRA[a.durum] - SIRA[b.durum] || a.kart.id.localeCompare(b.kart.id));
}

export interface DesteDurumuOzeti {
  yayinda: number;
  onayBekliyor: number;
  taslak: number;
}

export function desteDurumuOzeti(d: Deste): DesteDurumuOzeti {
  const ozet: DesteDurumuOzeti = { yayinda: 0, onayBekliyor: 0, taslak: 0 };
  for (const k of d.kartlar) {
    const durum = kartDurumu(k, d.hmgsAlani !== null);
    if (durum === 'yayinda') ozet.yayinda++;
    else if (durum === 'onay_bekliyor') ozet.onayBekliyor++;
    else ozet.taslak++;
  }
  return ozet;
}
