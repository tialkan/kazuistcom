/** Minimal clipboard surface, so the logic can be tested without a browser. */
export interface PanoYuzeyi {
  writeText?: (metin: string) => Promise<void>;
}

export type KopyalamaSonucu = 'basarili' | 'basarisiz';

/**
 * Writes the text to the clipboard. Any failure (no API, insecure context, permission denied, a rejected
 * promise) is reported as 'basarisiz'; the caller then shows the text selected in a textarea instead.
 */
export async function panoyaKopyala(metin: string, pano: PanoYuzeyi | undefined): Promise<KopyalamaSonucu> {
  if (!pano || typeof pano.writeText !== 'function') return 'basarisiz';
  try {
    await pano.writeText(metin);
    return 'basarili';
  } catch {
    return 'basarisiz';
  }
}

/** Replaces {name} placeholders in a dictionary string. */
export const doldur = (s: string, degerler: Record<string, string | number>): string =>
  s.replace(/\{(\w+)\}/g, (parca, anahtar: string) =>
    anahtar in degerler ? String(degerler[anahtar]) : parca,
  );
