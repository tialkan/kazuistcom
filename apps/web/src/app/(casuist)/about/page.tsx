import { CasuistSayfa, casuistMetadata } from '../_bilesen/CasuistSayfa.tsx';

export const metadata = casuistMetadata('about');

export default function AboutSayfasi() {
  return <CasuistSayfa anahtar="about" />;
}
