/**
 * Progress of the guides (FR-34): which steps of the article guide, which steps of the thesis guide and which items of
 * the checklist are done. Pure data and pure functions. The browser keeps the serialized value in localStorage
 * (`depoAnahtari`); the server never sees it. Article and thesis progress are stored apart. Saving it on the server
 * for signed in users needs a contract and is requested in docs/istekler/icerik-rehberler.md.
 */
import { z } from 'zod';

export const depoAnahtari = 'kazuist.rehber.v1';
export const listeler = ['makale', 'tez', 'kontrol'] as const;
export type Liste = (typeof listeler)[number];

const tamamlananlar = z.array(z.string()).max(100);
const depoSchema = z.object({
  makale: tamamlananlar.default([]),
  tez: tamamlananlar.default([]),
  kontrol: tamamlananlar.default([]),
});
export type Depo = z.infer<typeof depoSchema>;

export const bosDepo = (): Depo => ({ makale: [], tez: [], kontrol: [] });

/**
 * Reads the stored text. Anything that does not parse is dropped (empty progress); for every list that `gecerli`
 * names, ids outside it are cut off, so stale ids of an older content version never inflate a count. Lists that
 * `gecerli` does not name are kept as stored, so a page that knows one list never erases another.
 */
export function depoyuOku(ham: string | null, gecerli: Partial<Record<Liste, readonly string[]>>): Depo {
  if (!ham) return bosDepo();
  let veri: unknown;
  try {
    veri = JSON.parse(ham);
  } catch {
    return bosDepo();
  }
  const s = depoSchema.safeParse(veri);
  if (!s.success) return bosDepo();
  const temizle = (l: Liste) => {
    const benzersiz = [...new Set(s.data[l])];
    const bilinen = gecerli[l];
    if (!bilinen) return benzersiz;
    const izinli = new Set(bilinen);
    return benzersiz.filter((id) => izinli.has(id));
  };
  return { makale: temizle('makale'), tez: temizle('tez'), kontrol: temizle('kontrol') };
}

/** Returns a new value with `id` marked or unmarked. The order of `gecerli` is kept so the stored list is stable. */
export function isaretle(
  depo: Depo,
  liste: Liste,
  id: string,
  tamam: boolean,
  gecerli: readonly string[],
): Depo {
  if (!gecerli.includes(id)) return depo;
  const set = new Set(depo[liste]);
  if (tamam) set.add(id);
  else set.delete(id);
  return { ...depo, [liste]: gecerli.filter((g) => set.has(g)) };
}

export const sayi = (depo: Depo, liste: Liste): number => depo[liste].length;

/** Whole percent of done items, 0 for an empty list. */
export const yuzde = (yapilan: number, toplam: number): number =>
  toplam <= 0 ? 0 : Math.round((Math.min(yapilan, toplam) / toplam) * 100);
