import type { Blok, KuralSeti } from './ayristir.ts';
import json from './kurallar.json';

/** The rule set as generated from docs/tespit/yazim-kurallari.md (see uret.ts). */
export const kuralSeti = json as unknown as KuralSeti;

/** "4.10" becomes the anchor id used by the page and by the checker links. */
export const kuralKimligi = (id: string) => `kural-${id.replace('.', '-')}`;

const SINIR = 96;

/** Short label of a rule: its lead clause, cut at a word boundary. Used next to checker findings. */
export function kisalt(metin: string): string {
  const bas = metin.split(/[:;]/)[0] ?? metin;
  if (bas.length <= SINIR) return bas.trim();
  const kes = bas.slice(0, SINIR);
  return `${kes.slice(0, Math.max(kes.lastIndexOf(' '), 40)).trim()}…`;
}

export const kuralOzetleri: Record<string, string> = Object.fromEntries(
  kuralSeti.bolumler.flatMap((b) =>
    b.bloklar.flatMap((x) => (x.tur === 'madde' ? [[x.id, kisalt(x.metin)] as const] : [])),
  ),
);

export type Grup =
  { tur: 'paragraf'; metin: string } | { tur: 'liste'; maddeler: Extract<Blok, { tur: 'madde' }>[] };

/** Groups consecutive rule items so the page renders one ordered list per run. */
export function grupla(bloklar: Blok[]): Grup[] {
  const gruplar: Grup[] = [];
  for (const b of bloklar) {
    if (b.tur === 'paragraf') {
      gruplar.push({ tur: 'paragraf', metin: b.metin });
      continue;
    }
    const son = gruplar[gruplar.length - 1];
    if (son?.tur === 'liste') son.maddeler.push(b);
    else gruplar.push({ tur: 'liste', maddeler: [b] });
  }
  return gruplar;
}
