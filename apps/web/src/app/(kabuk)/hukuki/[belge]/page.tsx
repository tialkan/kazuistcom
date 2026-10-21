import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { BosDurum } from '@kazuist/ui';
import { CasuistSayfa } from '../../../(casuist)/_bilesen/CasuistSayfa.tsx';
import { casuistSayfalari, type CasuistAnahtari } from '../../../(casuist)/_bilesen/veri.ts';
import { HukukiGovde } from '../../_hukuki/HukukiGovde.tsx';
import { gosterimKipi, hukukiMetin, hukukiMetinler } from '../../_hukuki/yukle.ts';
import { hukukiBelgeler } from '../../_kabuk/rotalar.ts';

const t = ortak('tr');
export const dynamicParams = false;
/** Footer documents plus every content/hukuki/tr text routed under /hukuki (runs the build gate). */
export const generateStaticParams = () => {
  const icerik = hukukiMetinler('tr')
    .filter((m) => m.fm.route.startsWith('/hukuki/'))
    .map((m) => m.fm.slug);
  return [...new Set<string>([...hukukiBelgeler, ...icerik])].map((belge) => ({ belge }));
};

const arsivAnahtari = (b: string): CasuistAnahtari | null =>
  `hukuki/${b}` in casuistSayfalari ? (`hukuki/${b}` as CasuistAnahtari) : null;
const belgeAdi = (b: string) => (t.hukuki.belge as Record<string, string>)[b];

type Gosterim =
  | { tur: 'metin'; taslak: boolean; baslik: string }
  | { tur: 'arsiv'; anahtar: CasuistAnahtari; baslik: string }
  | { tur: 'hazirlaniyor'; baslik: string };

/**
 * Decision per ADR-0023 (legalRenderMode): publishable text renders; in staging and development a draft
 * renders with the TASLAK band and noindex; in production a draft never renders. There the text Casuist
 * already published stays (ADR-0002, istek madde 5) or the noindex "in preparation" state is shown.
 */
function gosterim(belge: string): Gosterim {
  const m = hukukiMetin('tr', belge);
  const baslik = m?.fm.title ?? belgeAdi(belge) ?? belge;
  if (m) {
    const kip = gosterimKipi(m);
    if (kip !== 'gizli') return { tur: 'metin', taslak: kip === 'taslak_bandi', baslik };
  }
  const arsiv = arsivAnahtari(belge);
  return arsiv ? { tur: 'arsiv', anahtar: arsiv, baslik } : { tur: 'hazirlaniyor', baslik };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ belge: string }>;
}): Promise<Metadata> {
  const { belge } = await params;
  const g = gosterim(belge);
  const m = hukukiMetin('tr', belge);
  const noindex = g.tur === 'hazirlaniyor' || (g.tur === 'metin' && g.taslak);
  return {
    title: `${g.baslik} | ${t.marka}`,
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
    ...(g.tur === 'metin' && m?.fm.alternate ? { alternates: { languages: { en: m.fm.alternate } } } : {}),
  };
}

export default async function HukukiBelgeSayfasi({ params }: { params: Promise<{ belge: string }> }) {
  const { belge } = await params;
  const g = gosterim(belge);
  const m = hukukiMetin('tr', belge);
  if (g.tur === 'metin' && m) return <HukukiGovde metin={m} taslak={g.taslak} />;
  if (g.tur === 'arsiv')
    return (
      <CasuistSayfa
        anahtar={g.anahtar}
        gezinmesiz
        ust={<p className="casuist-not">{t.hukuki.casuistSurumu}</p>}
      />
    );
  return (
    <div className="sayfa">
      <header className="sayfa-ust">
        <p className="ust-etiket">{t.hukuki.ust}</p>
        <h1>{g.baslik}</h1>
      </header>
      <BosDurum
        baslik={t.hukuki.hazirlaniyor}
        aciklama={<p>{t.hukuki.hazirlaniyorAciklama}</p>}
        eylem={<Link href="/hukuki">{t.hukuki.baslik}</Link>}
      />
    </div>
  );
}
