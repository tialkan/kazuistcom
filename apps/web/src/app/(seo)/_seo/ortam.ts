/**
 * Environment decision for search visibility (plan 13.2, review.md P6/1). The safe default is closed:
 * a page is indexable only when the deployment is production by every signal below.
 */
export type SeoEnv = Record<string, string | undefined>;

/** Production host of the product (plan 1, K-02); www redirects to the apex (plan 13.2/8). */
export const uretimAlanAdi = 'kazuist.com';
const yerelTaban = 'http://localhost:3000';

/** The configured public base URL, or null when APP_URL is missing or not an absolute http(s) URL. */
function appUrl(env: SeoEnv): URL | null {
  const ham = env.APP_URL?.trim();
  if (!ham) return null;
  try {
    const u = new URL(ham);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * True only when NODE_ENV and KAZUIST_ENV say production (same rule as ADR-0023 for legal texts) and
 * APP_URL is the https production host. Anything else (staging, development, missing variable, a
 * staging host that copied the production KAZUIST_ENV by mistake) stays closed.
 */
export function indekslenebilir(env: SeoEnv = process.env): boolean {
  if (env.NODE_ENV !== 'production' || env.KAZUIST_ENV !== 'production') return false;
  const u = appUrl(env);
  return u !== null && u.protocol === 'https:' && u.hostname === uretimAlanAdi;
}

/** Absolute site origin without a trailing slash; metadataBase, canonical and sitemap use it. */
export function siteKoku(env: SeoEnv = process.env): string {
  const u = appUrl(env);
  return (u ?? new URL(yerelTaban)).origin;
}

/** Robots directive of the root layout: open in production, closed everywhere else. */
export function robotsYonergesi(env: SeoEnv = process.env): { index: boolean; follow: boolean } {
  const acik = indekslenebilir(env);
  return { index: acik, follow: acik };
}
