import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { Dugme, FormAlani, KaynakCipi, SerhliMetin, SerhSatiri } from '@kazuist/ui';
import { ModulBagi } from './(kabuk)/_kabuk/ModulBagi.tsx';
import { OrnekSoru } from './(kabuk)/_kabuk/OrnekSoru.tsx';
import { modulAcik } from './(kabuk)/_kabuk/rotalar.ts';

const t = ortak('tr');
const a = t.anasayfa;

export const metadata: Metadata = { title: a.baslik, description: a.aciklama };

const ornekler = [a.ornekler['1'], a.ornekler['2'], a.ornekler['3'], a.ornekler['4']];

/** Product home (plan 13.1): purpose sentence, large search box, sample questions, Kampus band. */
export default function Home() {
  return (
    <>
      <section className="sayfa ana-kahraman" aria-labelledby="ana-baslik">
        <div>
          <h1 id="ana-baslik">{t.amac}</h1>
          <p className="ana-kahraman__giris">{a.giris}</p>
        </div>
        {/* Plain GET form: works without JavaScript and lands on /ara (owned by the casuist module). */}
        <form className="ana-arama" action="/ara" method="get" role="search">
          <FormAlani
            id="q"
            name="q"
            type="search"
            etiket={a.aramaEtiketi}
            ipucu={a.aramaIpucu}
            autoComplete="off"
            required
          />
          <div className="ana-arama__satir">
            <Dugme type="submit">{a.aramaDugme}</Dugme>
          </div>
        </form>
        <div>
          <h2 className="ust-etiket">{a.orneklerBaslik}</h2>
          <ul className="ana-ornekler">
            {ornekler.map((s) => (
              <li key={s}>
                <OrnekSoru soru={s} araAcik={modulAcik('/ara')} />
              </li>
            ))}
          </ul>
        </div>
        <p className="ana-en-notu" lang="en">
          {a.enNotu} <Link href="/en">/en</Link>
        </p>
      </section>

      <section className="sayfa ana-serh" aria-labelledby="serh-baslik">
        <h2 id="serh-baslik">{a.serhBaslik}</h2>
        <p className="sayfa-ust__giris">{a.serhGiris}</p>
        <div className="ana-serh__kagit">
          <p className="ana-serh__not">{a.serhOrnekNotu}</p>
          <SerhliMetin>
            <SerhSatiri
              serhEtiketi={`${a.serhKaynak} 1`}
              serh={
                <KaynakCipi
                  no={1}
                  kunye="Kanun m.0/0"
                  otorite="baglayici"
                  otoriteMetni={a.otoriteBaglayici}
                />
              }
            >
              <p>{a.serhOrnek1}</p>
            </SerhSatiri>
            <SerhSatiri
              serhEtiketi={`${a.serhKaynak} 2`}
              serh={
                <>
                  <KaynakCipi
                    no={2}
                    kunye="E.0000/00 K.0000/00"
                    otorite="yuksek-emsal"
                    otoriteMetni={a.otoriteYuksek}
                  />
                  <KaynakCipi
                    no={3}
                    kunye="Kanun m.0"
                    otorite="baglayici"
                    otoriteMetni={a.otoriteBaglayici}
                  />
                </>
              }
            >
              <p>{a.serhOrnek2}</p>
            </SerhSatiri>
          </SerhliMetin>
        </div>
      </section>

      <section className="sayfa ana-moduller" aria-labelledby="modul-baslik">
        <h2 id="modul-baslik">{a.modullerBaslik}</h2>
        <dl>
          {(
            [
              ['/ara', t.gezinme.sekme.ara, a.modul.ara],
              ['/yazma', t.gezinme.sekme.yazma, a.modul.yazma],
              ['/pratik', t.gezinme.sekme.pratik, a.modul.pratik],
              ['/rehberler', t.gezinme.sekme.rehberler, a.modul.rehberler],
            ] as const
          ).map(([href, ad, metin]) => (
            <div key={href}>
              <dt>
                <ModulBagi href={href}>{ad}</ModulBagi>
              </dt>
              <dd>{metin}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="ana-kampus" aria-labelledby="kampus-baslik">
        <div className="sayfa">
          <h2 id="kampus-baslik">{a.kampusBaslik}</h2>
          <p>{a.kampusMetin}</p>
          <ModulBagi href="/kampus">{a.kampusBag}</ModulBagi>
        </div>
      </section>
    </>
  );
}
