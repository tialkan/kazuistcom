import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { gorunenKartlar, onizlemeAcik, tumDesteler } from '../_veri/desteler.ts';
import { Calisma } from '../_bilesen/Calisma.tsx';
import { tr } from '../_bilesen/metin.ts';
import { OnizlemeBandi, SabitNotlar } from '../_bilesen/Ortak.tsx';

export const metadata: Metadata = {
  title: `${tr.meta.bugunBaslik} | ${ortak().marka}`,
};

/** Today's spaced repetition over every visible deck. */
export default function BugunSayfasi() {
  const onizleme = onizlemeAcik();
  const kartlar = tumDesteler.flatMap((d) => gorunenKartlar(d, onizleme));
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p>
          <a href="/pratik">{tr.deste.geri}</a>
        </p>
        <h1>{tr.meta.bugunBaslik}</h1>
      </header>
      {onizleme ? <OnizlemeBandi /> : null}
      {kartlar.length === 0 ? (
        <p>{tr.deste.kartYok}</p>
      ) : (
        <Calisma kartlar={kartlar} baslik={tr.calisma.baslik} />
      )}
      <SabitNotlar />
    </div>
  );
}
