import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { hukukiBelgeler } from '../_kabuk/rotalar.ts';

const t = ortak('tr');
export const metadata: Metadata = { title: `${t.hukuki.baslik} | ${t.marka}`, description: t.hukuki.giris };

export default function HukukiDizin() {
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{t.hukuki.baslik}</h1>
        <p className="sayfa-ust__giris">{t.hukuki.giris}</p>
      </header>
      <ul className="belge-listesi">
        {hukukiBelgeler.map((b) => (
          <li key={b}>
            <Link href={`/hukuki/${b}`}>{t.hukuki.belge[b]}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
