import { Sekil, type SekilAdi } from './Sekil.tsx';

export type OtoriteSinifi = 'baglayici' | 'yuksek-emsal' | 'emsal' | 'diger';

const sekil: Record<OtoriteSinifi, SekilAdi> = {
  baglayici: 'baklava',
  'yuksek-emsal': 'bos-baklava',
  emsal: 'bos-daire',
  diger: 'cizgili-daire',
};

/**
 * Source chip: running number, short citation in mono (court, file and decision number)
 * and the authority class as shape plus visible text.
 */
export function KaynakCipi({
  no,
  kunye,
  otorite,
  otoriteMetni,
  href,
}: {
  no: number;
  /** Short citation, e.g. "Yargıtay HGK E.2013/19-199 K.2013/1418". */
  kunye: string;
  otorite: OtoriteSinifi;
  /** Visible authority label from i18n, e.g. "Bağlayıcı". */
  otoriteMetni: string;
  href?: string;
}) {
  const govde = (
    <>
      <span className="kz-cip__no">{no}</span>
      <span className="kz-cip__kunye">{kunye}</span>
      <span className="kz-cip__otorite">
        <Sekil ad={sekil[otorite]} />
        {otoriteMetni}
      </span>
    </>
  );
  const sinif = `kz-cip kz-cip--${otorite}`;
  return href ? (
    <a className={sinif} href={href}>
      {govde}
    </a>
  ) : (
    <span className={sinif}>{govde}</span>
  );
}
