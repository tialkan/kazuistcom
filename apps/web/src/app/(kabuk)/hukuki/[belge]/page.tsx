import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { BosDurum } from '@kazuist/ui';
import { CasuistSayfa } from '../../../(casuist)/_bilesen/CasuistSayfa.tsx';
import { casuistSayfalari, type CasuistAnahtari } from '../../../(casuist)/_bilesen/veri.ts';
import { hukukiBelgeler, type HukukiBelge } from '../../_kabuk/rotalar.ts';

const t = ortak('tr');
export const dynamicParams = false;
export const generateStaticParams = () => hukukiBelgeler.map((belge) => ({ belge }));

const arsivAnahtari = (b: HukukiBelge): CasuistAnahtari | null =>
  `hukuki/${b}` in casuistSayfalari ? (`hukuki/${b}` as CasuistAnahtari) : null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ belge: HukukiBelge }>;
}): Promise<Metadata> {
  const { belge } = await params;
  const arsiv = arsivAnahtari(belge);
  return {
    title: `${t.hukuki.belge[belge]} | ${t.marka}`,
    // Pages without a published text are thin; keep them out of the index until hukuk-uyum fills them.
    ...(arsiv ? {} : { robots: { index: false, follow: true } }),
  };
}

/**
 * Legal page shell (plan 11). The five texts that Casuist already published are shown as they are
 * (target of the /tr/hukuki/* redirect); the rest show a designed "in preparation" state.
 * hukuk-uyum replaces the body with content/hukuki/<belge> once Tarik approves.
 */
export default async function HukukiBelgeSayfasi({ params }: { params: Promise<{ belge: HukukiBelge }> }) {
  const { belge } = await params;
  const arsiv = arsivAnahtari(belge);
  if (arsiv) {
    return (
      <CasuistSayfa
        anahtar={arsiv}
        gezinmesiz
        ust={<p className="casuist-not">{t.hukuki.casuistSurumu}</p>}
      />
    );
  }
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p className="ust-etiket">{t.hukuki.ust}</p>
        <h1>{t.hukuki.belge[belge]}</h1>
      </header>
      <BosDurum
        baslik={t.hukuki.hazirlaniyor}
        aciklama={<p>{t.hukuki.hazirlaniyorAciklama}</p>}
        eylem={<Link href="/hukuki">{t.hukuki.baslik}</Link>}
      />
    </div>
  );
}
