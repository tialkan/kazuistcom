import type { KuralDegerleri, SablonTuru } from '../_cekirdek/kural-semasi.ts';

/**
 * Client of the DOCX check that runs in services/worker-py (docxcheck, internal network only). The uploaded
 * file is the personal data here: it is forwarded as raw bytes in memory, never stored, never logged and never
 * sent anywhere else (in particular not to an AI provider).
 */

export interface DenetimYaniti {
  durum: number;
  govde: unknown;
}

export type DenetimIstemcisi = (
  bayt: Uint8Array,
  tur: SablonTuru,
  kurallar: KuralDegerleri,
) => Promise<DenetimYaniti>;

type Env = Record<string, string | undefined>;
const ZAMAN_ASIMI_MS = 60_000;

/** Rules the checker uses; notes and the institution name stay out of the request. */
export function denetimKurallari(d: KuralDegerleri): Record<string, unknown> {
  const kopya: Record<string, unknown> = { ...d };
  delete kopya.notes;
  delete kopya.institution;
  return kopya;
}

/** Null when WORKER_PY_URL or KAZUIST_INTERNAL_TOKEN is missing: the endpoint then answers 503 (fail closed). */
export function pythonDenetimIstemcisi(
  env: Env = process.env,
  fetchFn: typeof fetch = fetch,
): DenetimIstemcisi | null {
  const taban = env.WORKER_PY_URL;
  const token = env.KAZUIST_INTERNAL_TOKEN;
  if (!taban || !token) return null;
  return async (bayt, tur, kurallar) => {
    const baslik = Buffer.from(JSON.stringify({ kind: tur, rules: denetimKurallari(kurallar) })).toString(
      'base64',
    );
    const yanit = await fetchFn(`${taban.replace(/\/$/, '')}/internal/docxcheck`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-internal-token': token,
        'x-kazuist-rules': baslik,
      },
      body: bayt as BodyInit,
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
    const govde: unknown = await yanit.json().catch(() => null);
    return { durum: yanit.status, govde };
  };
}
