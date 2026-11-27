import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { GeriSayim } from '../_karsilama/GeriSayim.tsx';
import { Sahne } from '../_karsilama/Sahne.tsx';

const t = ortak().karsilama;
const l = t.lansman;

export const metadata: Metadata = { title: l.baslik, description: l.aciklama };

/** Launch countdown to 12 December, reached from the welcome call to action. */
export default function Lansman() {
  return (
    <Sahne secenek={{ kelime: false, gunes: 'batis' }} logoAlt={t.logo}>
      <section className="kzw-geri-sayim" aria-labelledby="lansman-baslik">
        <p className="kzw-lansman-ust">{l.ust}</p>
        <h1 id="lansman-baslik" className="kzw-lansman-baslik">
          {l.tarih}
        </h1>
        <GeriSayim birim={{ gun: l.gun, saat: l.saat, dakika: l.dakika, saniye: l.saniye }} bitti={l.bitti} />
        <Link className="kzw-geri" href="/">
          {l.geri}
        </Link>
      </section>
    </Sahne>
  );
}
