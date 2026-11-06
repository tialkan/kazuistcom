import { Sekil, type SekilAdi } from './Sekil.tsx';

/** Record labels of plan 7.3 and the authority classes of Ek F. */
export type EtiketTuru =
  | 'yeni'
  | 'yerlesik'
  | 'eski'
  | 'oncu'
  | 'anonim'
  | 'ilgililik'
  | 'guncellik'
  | 'canli'
  | 'veri-gunu'
  | 'baglayici'
  | 'yuksek-emsal'
  | 'emsal'
  | 'diger-otorite';

/** Every label carries colour, shape and text; the shape alone distinguishes all kinds (plan 7.3). */
export const etiketSekli: Record<EtiketTuru, SekilAdi> = {
  yeni: 'daire',
  yerlesik: 'kare',
  eski: 'bos-kare',
  oncu: 'ucgen',
  anonim: 'cizgili-daire',
  ilgililik: 'cubuk',
  guncellik: 'unlem',
  canli: 'halka-nokta',
  'veri-gunu': 'takvim',
  baglayici: 'baklava',
  'yuksek-emsal': 'bos-baklava',
  emsal: 'bos-daire',
  'diger-otorite': 'cizgili-daire',
};

export function Etiket({ tur, children }: { tur: EtiketTuru; children: string }) {
  return (
    <span className={`kz-etiket kz-etiket--${tur}`} data-tur={tur}>
      <Sekil ad={etiketSekli[tur]} />
      <span className="kz-etiket__metin">{children}</span>
    </span>
  );
}
