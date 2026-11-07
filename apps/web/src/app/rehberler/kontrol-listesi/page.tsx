import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { EtikKutusu } from '../_bilesen/EtikKutusu.tsx';
import { KontrolListesi, type MaddeGorunumu } from '../_bilesen/KontrolListesi.tsx';
import { RehberUst, SabitNotlar } from '../_bilesen/Ortak.tsx';
import { baglantiAcik, tr } from '../_bilesen/metin.ts';
import { kontrol } from '../_veri/rehberler.ts';

export const metadata: Metadata = {
  title: `${tr.meta.kontrolBaslik} | ${ortak().marka}`,
  description: tr.meta.kontrolAciklama,
};

/** The anchor of a rule on /tespit (tespit/_veri/kurallar.ts: `kural-<bolum>-<sira>`). */
const kuralBaglantisi = (no: string) => `/tespit#kural-${no.replace('.', '-')}`;

export default function KontrolListesiSayfasi() {
  const maddeler: MaddeGorunumu[] = kontrol.maddeler.map((m, i) => ({
    id: m.id,
    no: i + 1,
    etiket: tr.kontrol.etiket[m.etiket],
    metin: m.metin,
    kural: m.kural ? { no: m.kural, href: kuralBaglantisi(m.kural) } : null,
    baglanti: m.baglanti && baglantiAcik(m.baglanti.href) ? m.baglanti : null,
  }));
  return (
    <div className="sayfa">
      <RehberUst
        baslik={kontrol.baslik}
        giris={kontrol.ozet}
        guncelleme={kontrol.guncelleme}
        aktif="kontrol"
      />
      <EtikKutusu />
      <KontrolListesi maddeler={maddeler} />
      <SabitNotlar />
    </div>
  );
}
