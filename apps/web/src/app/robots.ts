import type { MetadataRoute } from 'next';
import { robotsKurallari } from './(seo)/_seo/kurallar.ts';

/** Evaluated per request: KAZUIST_ENV and APP_URL are run time values, not build time ones. */
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return robotsKurallari();
}
