import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { Dugme, FormAlani, KaynakCipi, SerhliMetin, SerhSatiri } from '@kazuist/ui';
import { modulGorunur } from './(kabuk)/_kabuk/yayin.ts';

const t = ortak();
const a = t.anasayfa;

// The home title already carries the brand, so it skips the "%s | Kazuist" template of the root layout.
export const metadata: Metadata = { title: { absolute: a.baslik }, description: a.aciklama };

const ornekler = [a.ornekler['1'], a.ornekler['2'], a.ornekler['3'], a.ornekler['4']];

/** Product home (plan 13.1): purpose sentence, large search box, sample questions, /tespit band (ADR-0031). */
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
                <Link href={`/ara?q=${encodeURIComponent(s)}`}>{s}</Link>
              </li>
            ))}
          </ul>
        </div>
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
                  kunye={a.serhKunye['1']}
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
                    kunye={a.serhKunye['2']}
                    otorite="baglayici"
                    otoriteMetni={a.otoriteBaglayici}
                  />
                  <KaynakCipi
                    no={3}
                    kunye={a.serhKunye['3']}
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
              ['/ara', t.gezinme.sekme.ara, a.modul.ara, true],
              ['/yazma', t.gezinme.sekme.yazma, a.modul.yazma, true],
              // Narrowed launch: Pratik is listed only where yayin.ts shows it (no approved card in production yet).
              ['/pratik', t.gezinme.sekme.pratik, a.modul.pratik, modulGorunur('pratik')],
              ['/rehberler', t.gezinme.sekme.rehberler, a.modul.rehberler, true],
            ] as const
          )
            .filter(([, , , gorunur]) => gorunur)
            .map(([href, ad, metin]) => (
              <div key={href}>
                <dt>
                  <Link href={href}>{ad}</Link>
                </dt>
                <dd>{metin}</dd>
              </div>
            ))}
        </dl>
      </section>

      {/* /tespit is live and owned by the yazma module; it is not a module tab (docs/istekler/yazma-tespit.md). */}
      <section className="ana-tespit" aria-labelledby="tespit-baslik">
        <div className="sayfa">
          <div className="ana-tespit__metin">
            <h2 id="tespit-baslik">{a.tespitBaslik}</h2>
            <p>{a.tespitMetin}</p>
          </div>
          <Link href="/tespit" className="ana-tespit__bag">
            {a.tespitBag}
          </Link>
        </div>
      </section>
    </>
  );
}
