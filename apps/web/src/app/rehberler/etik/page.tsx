import type { Metadata } from 'next';
import { ortak } from '@kazuist/i18n';
import { EtikKutusu } from '../_bilesen/EtikKutusu.tsx';
import { RehberUst, SabitNotlar } from '../_bilesen/Ortak.tsx';
import { tr } from '../_bilesen/metin.ts';
import { etik } from '../_veri/rehberler.ts';

export const metadata: Metadata = {
  title: `${tr.meta.etikBaslik} | ${ortak('tr').marka}`,
  description: tr.meta.etikAciklama,
};

export default function EtikSayfasi() {
  return (
    <div className="sayfa">
      <RehberUst baslik={etik.baslik} giris={etik.ozet} guncelleme={etik.guncelleme} aktif="etik" />
      <EtikKutusu acik sayfaBaglantisi={false} />
      <SabitNotlar />
    </div>
  );
}
