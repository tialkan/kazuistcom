import type { Metadata } from 'next';
import tr from '@kazuist/i18n/tr/kalemcik.json';
import { Kalemcik } from './_bilesen/Kalemcik.tsx';

export const metadata: Metadata = {
  title: tr.meta.baslik,
  description: tr.meta.aciklama,
};

export default function KalemcikSayfasi() {
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{tr.baslik}</h1>
        <p className="sayfa-ust__giris">{tr.giris}</p>
      </header>
      <Kalemcik />
    </div>
  );
}
