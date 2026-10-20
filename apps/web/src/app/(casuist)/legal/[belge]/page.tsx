import Link from 'next/link';
import { ortak } from '@kazuist/i18n';
import { CasuistSayfa, casuistMetadata } from '../../_bilesen/CasuistSayfa.tsx';
import { legalEslesme } from '../../_bilesen/veri.ts';

type Belge = keyof typeof legalEslesme;
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(legalEslesme).map((belge) => ({ belge }));

export async function generateMetadata({ params }: { params: Promise<{ belge: Belge }> }) {
  const { belge } = await params;
  return casuistMetadata(`legal/${belge}`);
}

/** English legal pages (Ek H rows 7-11): informational, the Turkish version is binding (wt.107). */
export default async function LegalSayfa({ params }: { params: Promise<{ belge: Belge }> }) {
  const { belge } = await params;
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
