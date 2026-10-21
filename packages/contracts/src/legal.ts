import { z } from 'zod';
import { ConsentKind } from './account.ts';

/**
 * Legal text publication gate (plan 11, ADR-0023, docs/istekler/hukuk-uyum-yayin-kapisi.md).
 * Contract between hukuk-uyum (content/hukuki), on-yuz (renderer) and kalite-guvenlik (tests):
 * - A text is publishable only with `status: yayinda` and no open marker in the body.
 * - Production never renders a non publishable text; staging may render it with noindex and a draft band.
 * - The production build fails when a text marked `yayinda` still has an open marker.
 */

export const legalStatuses = ['taslak', 'yayinda'] as const;
export type LegalStatus = (typeof legalStatuses)[number];

const routePath = z.string().regex(/^\/(hukuki|legal)\/[a-z0-9-]+$/);

/** Front matter of every content/hukuki/<lang>/<slug>.md file (content/hukuki/README.md). */
export const LegalFrontMatter = z.strictObject({
  title: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]{1,80}$/),
  route: routePath,
  lang: z.enum(['tr', 'en']),
  /** Only Turkish texts bind; English texts carry the "binding version is Turkish" note. */
  binding: z.boolean(),
  /** Written to consents.version when the text is accepted. */
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
  date: z.iso.date(),
  status: z.enum(legalStatuses),
  consent_kind: ConsentKind.optional(),
  /** hreflang pair. */
  alternate: routePath.optional(),
});
export type LegalFrontMatter = z.infer<typeof LegalFrontMatter>;

/** Reasons that keep a text out of production. */
export type LegalBlocker = 'taslak' | 'yer_tutucu' | 'dogrulanacak';

const PLACEHOLDER = /\{\{[^}]*\}\}/;
const TO_VERIFY = /\[DOĞRULANACAK/;

/** Split a Markdown file into its YAML front matter (raw, not parsed) and body. */
export function splitFrontMatter(text: string): { frontMatter: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { frontMatter: m[1] ?? '', body: m[2] ?? '' } : null;
}

/** Every reason the text cannot be published; empty means publishable. */
export function legalPublishBlockers(fm: Pick<LegalFrontMatter, 'status'>, body: string): LegalBlocker[] {
  const out: LegalBlocker[] = [];
  if (fm.status !== 'yayinda') out.push('taslak');
  if (PLACEHOLDER.test(body)) out.push('yer_tutucu');
  if (TO_VERIFY.test(body)) out.push('dogrulanacak');
  return out;
}

export type LegalRenderMode = 'yayin' | 'taslak_bandi' | 'gizli';

/**
 * Renderer decision. production: only publishable texts, everything else is a 404 (gizli).
 * staging and development: non publishable texts render with noindex and the draft band.
 */
export function legalRenderMode(
  fm: Pick<LegalFrontMatter, 'status'>,
  body: string,
  env: 'production' | 'staging' | 'development',
): LegalRenderMode {
  const blocked = legalPublishBlockers(fm, body).length > 0;
  if (!blocked) return 'yayin';
  return env === 'production' ? 'gizli' : 'taslak_bandi';
}

/**
 * Build gate: a text marked `yayinda` must not carry open markers. Returns problem strings (empty is ok).
 * Draft texts pass, because production does not render them (legalRenderMode).
 */
export function legalBuildProblems(
  file: string,
  fm: Pick<LegalFrontMatter, 'status'>,
  body: string,
): string[] {
  if (fm.status !== 'yayinda') return [];
  return legalPublishBlockers(fm, body)
    .filter((b) => b !== 'taslak')
    .map((b) => `${file}: status yayinda but body has an open marker (${b})`);
}
