import { sharedPool } from '@/server/deps';
import { ornekKaynagi } from './ornek.ts';
import { sqlKaynagi, type AtifKaynagi } from './sql.ts';

/**
 * Chooses the network source once per process, with the same convention as the search (ara/_sunucu/baglam.ts):
 * KAZUIST_ARAMA_KAYNAGI=fikstur selects the example source (tests, local development, screenshots), otherwise
 * PostgreSQL over DATABASE_URL. Production never falls back to the example: without a database the network
 * answers 503 (KaynakYok).
 */
export class KaynakYok extends Error {
  override name = 'KaynakYok';
}

type Env = Record<string, string | undefined>;

let override: AtifKaynagi | undefined;

/** Tests replace the source. */
export function kaynagiDegistir(k: AtifKaynagi | undefined): void {
  override = k;
}

export function atifKaynagi(env: Env = process.env): AtifKaynagi {
  if (override) return override;
  if (env.KAZUIST_ARAMA_KAYNAGI === 'fikstur') {
    if (env.NODE_ENV === 'production' && env.KAZUIST_FIKSTUR_URETIMDE !== '1')
      throw new KaynakYok('example source is not allowed in production');
    return ornekKaynagi;
  }
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === 'production') throw new KaynakYok('no corpus database');
    return ornekKaynagi;
  }
  return sqlKaynagi(sharedPool(env.DATABASE_URL));
}
