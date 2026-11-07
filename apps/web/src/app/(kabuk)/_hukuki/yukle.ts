import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LegalFrontMatter,
  legalBuildProblems,
  legalRenderMode,
  splitFrontMatter,
  type LegalRenderMode,
} from '@kazuist/contracts';
import { ayristir, onBilgi, type Blok } from './md.ts';

/** content/hukuki, resolved from the app directory (next build and vitest run in apps/web). */
const kok = () => {
  for (const d of [join(process.cwd(), 'content/hukuki'), join(process.cwd(), '../../content/hukuki')])
    if (existsSync(/* turbopackIgnore: true */ d)) return d;
  throw new Error('content/hukuki not found');
};

export type Ortam = 'production' | 'staging' | 'development';
/** Production only when both NODE_ENV and KAZUIST_ENV say so (ADR-0023). */
export function kazuistOrtami(env: Record<string, string | undefined> = process.env): Ortam {
  if (env.NODE_ENV === 'production' && env.KAZUIST_ENV === 'production') return 'production';
  return env.KAZUIST_ENV === 'staging' ? 'staging' : 'development';
}

export type HukukiMetin = { dosya: string; fm: LegalFrontMatter; govde: Blok[]; ham: string };

/**
 * Directory under content/hukuki. Kazuist is Turkish only (ADR-0032): there is no English version, so the
 * only value is 'tr'. The parameter stays so existing callers keep their explicit 'tr'.
 */
export type HukukiDil = 'tr';

export function oku(dosya: string): HukukiMetin {
  const text = readFileSync(/* turbopackIgnore: true */ dosya, 'utf8');
  const parca = splitFrontMatter(text);
  if (!parca) throw new Error(`${dosya}: missing front matter`);
  const fm = LegalFrontMatter.parse(onBilgi(parca.frontMatter));
  if (fm.lang !== 'tr') throw new Error(`${dosya}: only Turkish legal texts are published (ADR-0032)`);
  const sorun = legalBuildProblems(dosya, fm, parca.body);
  // Build gate: a text marked yayinda with an open marker must break the build.
  if (sorun.length) throw new Error(sorun.join('\n'));
  return { dosya, fm, govde: ayristir(parca.body), ham: parca.body };
}

/** All legal texts, validated. Throws on invalid front matter or a failed build gate. */
export function hukukiMetinler(lang: HukukiDil = 'tr'): HukukiMetin[] {
  const d = join(/* turbopackIgnore: true */ kok(), lang);
  return readdirSync(/* turbopackIgnore: true */ d)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => oku(join(/* turbopackIgnore: true */ d, f)));
}

export function hukukiMetin(lang: HukukiDil, slug: string): HukukiMetin | null {
  const f = join(/* turbopackIgnore: true */ kok(), lang, `${slug}.md`);
  return existsSync(/* turbopackIgnore: true */ f) ? oku(f) : null;
}

export function gosterimKipi(m: HukukiMetin, ortam: Ortam = kazuistOrtami()): LegalRenderMode {
  return legalRenderMode(m.fm, m.ham, ortam);
}

/**
 * Version written to consents.version when a user accepts the text (istek madde 4).
 * Returns null when the text does not exist.
 */
export function hukukiMetinSurumu(slug: string, lang: HukukiDil = 'tr'): string | null {
  return hukukiMetin(lang, slug)?.fm.version ?? null;
}
