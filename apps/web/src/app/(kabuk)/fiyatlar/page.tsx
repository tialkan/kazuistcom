import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { Tablo } from '@kazuist/ui';
import { islemler, paketler, planlar } from './fiyatlar.ts';

const t = ortak('tr');
const f = t.fiyatlar;

export const metadata: Metadata = { title: `${f.baslik} | ${t.marka}`, description: f.aciklama };

export default function FiyatlarSayfasi() {
  const s = f.sutun;
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <h1>{f.baslik}</h1>
        <p className="sayfa-ust__giris">{f.giris}</p>
        <p className="taslak-notu">{f.taslak}</p>
      </header>
      <Tablo
        baslik={f.planlar}
        satirAnahtari={(p) => p.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: s.plan, hucre: (p) => p.ad },
          { anahtar: 'kime', baslik: s.kime, hucre: (p) => p.kime },
          { anahtar: 'fiyat', baslik: s.fiyat, hucre: (p) => p.fiyat },
          { anahtar: 'kredi', baslik: s.kredi, hucre: (p) => p.kredi },
          { anahtar: 'ozellik', baslik: s.ozellik, hucre: (p) => p.ozellik },
        ]}
        satirlar={planlar}
        not={f.kdv}
      />
      <Tablo
        baslik={f.paketler}
        satirAnahtari={(p) => p.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: s.paket, hucre: (p) => p.ad },
          { anahtar: 'kredi', baslik: s.krediMiktari, hucre: (p) => p.kredi, sayisal: true },
          { anahtar: 'fiyat', baslik: s.fiyat, hucre: (p) => p.fiyat, sayisal: true },
          { anahtar: 'krediBasi', baslik: s.krediBasi, hucre: (p) => p.krediBasi, sayisal: true },
        ]}
        satirlar={paketler}
        not={f.kdv}
      />
      <Tablo
        baslik={f.islemler}
        satirAnahtari={(p) => p.ad}
        sutunlar={[
          { anahtar: 'ad', baslik: s.islem, hucre: (p) => p.ad },
          { anahtar: 'kredi', baslik: s.krediBedeli, hucre: (p) => p.kredi, sayisal: true },
        ]}
        satirlar={islemler}
      />
      <h2>{f.kurallarBaslik}</h2>
      <ul className="duz-liste">
        {[f.kural['1'], f.kural['2'], f.kural['3'], f.kural['4']].map((k) => (
          <li key={k}>{k}</li>
        ))}
      </ul>
    </div>
  );
}
