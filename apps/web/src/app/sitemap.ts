import type { MetadataRoute } from 'next';
import { siteHaritasi } from './(seo)/_seo/kurallar.ts';

/** Evaluated per request: the site origin comes from APP_URL at run time. */
export const dynamic = 'force-dynamic';

export default function sitemap(): MetadataRoute.Sitemap {
  return siteHaritasi();
}
