import type { Metadata } from 'next';
import { denemeHavuzu, onizlemeAcik } from '../../_veri/desteler.ts';
import { DenemeEkrani } from '../../_bilesen/DenemeEkrani.tsx';
import { tr } from '../../_bilesen/metin.ts';
import { OnizlemeBandi, SabitNotlar } from '../../_bilesen/Ortak.tsx';

export const metadata: Metadata = {
  title: tr.meta.denemeBaslik,
};

export default function DenemeSayfasi() {
  const onizleme = onizlemeAcik();
  const havuz = denemeHavuzu(onizleme).filter((k) => k.hmgsAlani !== null && k.secenekler.length >= 4);
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p>
          <a href="/pratik/hmgs">{tr.meta.hmgsBaslik}</a>
        </p>
        <h1>{tr.meta.denemeBaslik}</h1>
      </header>
      {onizleme ? <OnizlemeBandi /> : null}
      <DenemeEkrani havuz={havuz} />
      <SabitNotlar />
    </div>
  );
}
