import { CasuistSayfa, casuistMetadata } from '../_bilesen/CasuistSayfa.tsx';

export const metadata = casuistMetadata('problem');

export default function ProblemSayfasi() {
  return <CasuistSayfa anahtar="problem" />;
}
