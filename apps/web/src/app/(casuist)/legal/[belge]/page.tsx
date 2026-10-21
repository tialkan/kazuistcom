import type { Metadata } from 'next';
import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { HukukiGovde } from '../../../(kabuk)/_hukuki/HukukiGovde.tsx';
import { gosterimKipi, hukukiMetin } from '../../../(kabuk)/_hukuki/yukle.ts';
import { CasuistSayfa, casuistMetadata } from '../../_bilesen/CasuistSayfa.tsx';
import { legalEslesme } from '../../_bilesen/veri.ts';

type Belge = keyof typeof legalEslesme;
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(legalEslesme).map((belge) => ({ belge }));

/** content/hukuki/en text when it may render here; null keeps the archived Casuist page (ADR-0002). */
function metin(belge: Belge) {
  const m = hukukiMetin('en', belge);
  if (!m) return null;
  const kip = gosterimKipi(m);
  return kip === 'gizli' ? null : { m, taslak: kip === 'taslak_bandi' };
}

export async function generateMetadata({ params }: { params: Promise<{ belge: Belge }> }): Promise<Metadata> {
  const { belge } = await params;
  const x = metin(belge);
  if (!x) return casuistMetadata(`legal/${belge}`);
  return {
    title: x.m.fm.title,
    ...(x.taslak ? { robots: { index: false, follow: true } } : {}),
    ...(x.m.fm.alternate ? { alternates: { languages: { tr: x.m.fm.alternate } } } : {}),
  };
}

/** English legal pages (Ek H rows 7-11): informational, the Turkish version is binding (wt.107). */
export default async function LegalSayfa({ params }: { params: Promise<{ belge: Belge }> }) {
  const { belge } = await params;
  const x = metin(belge);
  if (x) return <HukukiGovde metin={x.m} taslak={x.taslak} />;
  const t = ortak('en');
  return (
    <CasuistSayfa
      anahtar={`legal/${belge}`}
      ust={
        <p className="casuist-not">
          {t.casuist.baglayiciSurum}{' '}
          <Link href={`/hukuki/${legalEslesme[belge]}`} hrefLang="tr" lang="tr">
            {ortak('tr').casuist.turkceSurum}
          </Link>
        </p>
      }
    />
  );
}
