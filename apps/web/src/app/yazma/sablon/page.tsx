import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import tr from '@kazuist/i18n/tr/yazma.json';
import { SablonAtolyesi } from '../_bilesen/SablonAtolyesi.tsx';

export const metadata: Metadata = {
  title: `${tr.sablon.meta.baslik} | ${ortak('tr').marka}`,
  description: tr.sablon.meta.aciklama,
};

export default function SablonSayfasi() {
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.sablon.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.sablon.giris}</p>
      </header>
      <SablonAtolyesi />
    </div>
  );
}
