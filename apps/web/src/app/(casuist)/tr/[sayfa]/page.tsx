import { CasuistSayfa, casuistMetadata } from '../../_bilesen/CasuistSayfa.tsx';
import { trSayfalari } from '../../_bilesen/veri.ts';

type Sayfa = (typeof trSayfalari)[number];
export const dynamicParams = false;
export const generateStaticParams = () => trSayfalari.map((sayfa) => ({ sayfa }));

export async function generateMetadata({ params }: { params: Promise<{ sayfa: Sayfa }> }) {
  const { sayfa } = await params;
  return casuistMetadata(`tr/${sayfa}`);
}

export default async function TrSayfa({ params }: { params: Promise<{ sayfa: Sayfa }> }) {
  const { sayfa } = await params;
  return <CasuistSayfa anahtar={`tr/${sayfa}`} />;
}
