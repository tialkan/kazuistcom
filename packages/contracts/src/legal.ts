import { z } from 'zod';
import { ConsentKind } from './account.ts';

/**
 * Legal text publication gate (plan 11, ADR-0023, docs/istekler/hukuk-uyum-yayin-kapisi.md).
 * Contract between hukuk-uyum (content/hukuki), on-yuz (renderer) and kalite-guvenlik (tests):
 * - A text is publishable only with `status: yayinda` and no open marker in the body.
 * - Production never renders a non publishable text; staging may render it with noindex and a draft band.
 * - The production build fails when a text marked `yayinda` still has an open marker.
 * - Texts turned into order PDFs (v1.2, ADR-0026) declare `pdf: true` and `pdf_fields`: those placeholders are
 *   filled per order when the PDF is produced (every one is required there) and do not block the page; the
 *   page renders them as a neutral label.
 */

export const legalStatuses = ['taslak', 'yayinda'] as const;
export type LegalStatus = (typeof legalStatuses)[number];

const routePath = z.string().regex(/^\/(hukuki|legal)\/[a-z0-9-]+$/);

const pdfField = z.string().regex(/^[A-Z][A-Z0-9_]{0,59}$/);

/** Front matter of every content/hukuki/<lang>/<slug>.md file (content/hukuki/README.md). */
export const LegalFrontMatter = z
  .strictObject({
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
    /** The text is also produced as an order PDF (Mesafeli Sozlesmeler Yon. m.6, Abonelik Yon. m.5). */
    pdf: z.boolean().optional(),
    /** Order fields filled into the PDF; each is a {{FIELD}} placeholder of the body. */
    pdf_fields: z.array(pdfField).max(50).optional(),
  })
  .refine((fm) => fm.pdf_fields === undefined || fm.pdf === true, {
    message: 'pdf_fields requires pdf: true',
    path: ['pdf_fields'],
  })
  .refine((fm) => new Set(fm.pdf_fields ?? []).size === (fm.pdf_fields ?? []).length, {
    message: 'pdf_fields must be unique',
    path: ['pdf_fields'],
  });
export type LegalFrontMatter = z.infer<typeof LegalFrontMatter>;

/** Reasons that keep a text out of production. */
export type LegalBlocker = 'taslak' | 'yer_tutucu' | 'dogrulanacak';

const PLACEHOLDERS = /\{\{([^}]*)\}\}/g;
const TO_VERIFY = /\[DOĞRULANACAK/;

/** The part of the front matter the gate reads. */
export interface LegalGateInput {
  status: LegalStatus;
  pdf?: boolean;
  pdf_fields?: readonly string[];
}

/** Names of every {{...}} placeholder in the body, in order, trimmed. */
export function legalPlaceholders(body: string): string[] {
  return [...body.matchAll(PLACEHOLDERS)].map((m) => (m[1] ?? '').trim());
}

/** Placeholders that block publication: all of them, except the declared PDF order fields. */
function openPlaceholders(fm: LegalGateInput, body: string): string[] {
  const orderFields = new Set(fm.pdf ? (fm.pdf_fields ?? []) : []);
  return legalPlaceholders(body).filter((name) => !orderFields.has(name));
}

/** Split a Markdown file into its YAML front matter (raw, not parsed) and body. */
export function splitFrontMatter(text: string): { frontMatter: string; body: string } | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  return m ? { frontMatter: m[1] ?? '', body: m[2] ?? '' } : null;
}

/** Every reason the text cannot be published; empty means publishable. */
export function legalPublishBlockers(fm: LegalGateInput, body: string): LegalBlocker[] {
  const out: LegalBlocker[] = [];
  if (fm.status !== 'yayinda') out.push('taslak');
  if (openPlaceholders(fm, body).length > 0) out.push('yer_tutucu');
  if (TO_VERIFY.test(body)) out.push('dogrulanacak');
  return out;
}

export type LegalRenderMode = 'yayin' | 'taslak_bandi' | 'gizli';

/**
 * Renderer decision. production: only publishable texts, everything else is a 404 (gizli).
 * staging and development: non publishable texts render with noindex and the draft band.
 */
export function legalRenderMode(
  fm: LegalGateInput,
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
export function legalBuildProblems(file: string, fm: LegalGateInput, body: string): string[] {
  if (fm.status !== 'yayinda') return [];
  return legalPublishBlockers(fm, body)
    .filter((b) => b !== 'taslak')
    .map((b) => `${file}: status yayinda but body has an open marker (${b})`);
}

/**
 * PDF declaration check (CI): pdf texts list at least one field, and every listed field occurs in the body
 * as {{FIELD}}. Returns problem strings (empty is ok).
 */
export function legalPdfProblems(file: string, fm: LegalGateInput, body: string): string[] {
  if (!fm.pdf) return [];
  const fields = fm.pdf_fields ?? [];
  if (fields.length === 0) return [`${file}: pdf: true but pdf_fields is empty`];
  const present = new Set(legalPlaceholders(body));
  return fields
    .filter((f) => !present.has(f))
    .map((f) => `${file}: pdf field ${f} is not a placeholder of the body`);
}

/** PDF production: the declared fields that have no value. A document with a missing field is not produced. */
export function legalPdfMissingFields(
  fm: LegalGateInput,
  values: Readonly<Record<string, string | undefined>>,
): string[] {
  return (fm.pdf_fields ?? []).filter((f) => !values[f]?.trim());
}

/** Restricted owner-only API response. Never log or queue this content. ADR-0027. */
export const OrderLegalDocument = z.strictObject({
  slug: z.enum(['on-bilgilendirme', 'mesafeli-satis', 'abonelik']),
  version: z.string().min(1),
  text: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type OrderLegalDocument = z.infer<typeof OrderLegalDocument>;
