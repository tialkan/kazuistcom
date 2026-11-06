/** Small helpers shared by the writing screens. */

/** Fill {name} placeholders; an unknown name is left as written so a missing value is visible in tests. */
export function doldur(metin: string, d: Record<string, string | number>): string {
  return metin.replace(/\{(\w+)\}/g, (m, k: string) => (k in d ? String(d[k]) : m));
}

/** "3,5" and "3.5" both read as 3.5; anything else is null. */
export function sayiCoz(metin: string): number | null {
  const t = metin.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const sayiMetni = (n: number) => String(n).replace('.', ',');

/** Hand a byte array to the browser as a download with an ASCII file name. */
export function dosyaIndir(bayt: Uint8Array, ad: string, tip: string): void {
  const blob = new Blob([bayt as BlobPart], { type: tip });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ad;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const DOCX_TIPI = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Message of an API error body ({code, message, requestId}), or the fallback. */
export async function hataMesaji(res: Response, yedek: string): Promise<string> {
  try {
    const j = (await res.json()) as { message?: unknown };
    return typeof j.message === 'string' && j.message ? j.message : yedek;
  } catch {
    return yedek;
  }
}
