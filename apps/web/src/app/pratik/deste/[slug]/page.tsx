import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ortak } from '@kazuist/i18n';
import { kartDurumu } from '../../_alan/kart.ts';
import { desteBul, gorunenKartlar, onizlemeAcik } from '../../_veri/desteler.ts';
import { DesteEkrani } from '../../_bilesen/DesteEkrani.tsx';
import { doldur, tr } from '../../_bilesen/metin.ts';
import { OnizlemeBandi, SabitNotlar } from '../../_bilesen/Ortak.tsx';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const deste = desteBul(slug);
  if (!deste) return {};
  return {
    title: `${doldur(tr.meta.desteBaslik, { deste: deste.baslik })} | ${ortak().marka}`,
    description: deste.aciklama,
  };
}

export default async function DesteSayfasi({ params }: Props) {
  const { slug } = await params;
  const deste = desteBul(slug);
  if (!deste) notFound();
  const onizleme = onizlemeAcik();
  const kartlar = gorunenKartlar(deste, onizleme);
  const bekleyen = onizleme
    ? 0
    : deste.kartlar.filter((k) => kartDurumu(k, deste.hmgsAlani !== null) === 'onay_bekliyor').length;
  const kaynaklar = [...new Set(deste.kartlar.flatMap((k) => k.kaynaklar.map((s) => s.kanunAdi)))];
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p>
          <a href="/pratik">{tr.deste.geri}</a>
        </p>
        <h1>{deste.baslik}</h1>
        <p className="sayfa-ust__giris">{deste.aciklama}</p>
        <p>{doldur(tr.deste.kaynak, { kanun: kaynaklar.join(', ') })}</p>
      </header>
      {onizleme ? <OnizlemeBandi /> : null}
      <DesteEkrani kartlar={kartlar} bekleyen={bekleyen} />
      <SabitNotlar />
    </div>
  );
}
