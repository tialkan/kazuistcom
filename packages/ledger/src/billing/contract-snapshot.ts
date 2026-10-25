import { createHash } from 'node:crypto';
import { LegalFrontMatter, legalPdfMissingFields, legalPublishBlockers } from '@kazuist/contracts';
import { fillLegalDoc, type LegalDocSlug } from './contract-doc.ts';

/** Frozen before checkout; persisted atomically with the order and its consent versions. */
export interface LegalSnapshot {
  orderId: string;
  slug: LegalDocSlug;
  version: string;
  fields: Readonly<Record<string, string>>;
  text: string;
  sha256: string;
}

/** This function never loads current files or derives a past contract from today's product catalog. */
export function createLegalSnapshot(input: {
  orderId: string;
  slug: LegalDocSlug;
  acceptedVersion: string;
  frontMatter: unknown;
  body: string;
  fields: Record<string, string>;
}): LegalSnapshot {
  const fm = LegalFrontMatter.parse(input.frontMatter);
  if (
    fm.slug !== input.slug ||
    fm.version !== input.acceptedVersion ||
    fm.lang !== 'tr' ||
    !fm.binding ||
    !fm.pdf ||
    !fm.pdf_fields?.length ||
    legalPublishBlockers(fm, input.body).length ||
    legalPdfMissingFields(fm, input.fields).length
  )
    throw new Error('Legal snapshot is not publishable or does not match the accepted version');
  const filled = fillLegalDoc({
    slug: input.slug,
    body: input.body,
    version: fm.version,
    orderId: input.orderId,
    fields: input.fields,
  });
  if (!filled.ok || /\{\{|\[DOĞRULANACAK/.test(filled.text))
    throw new Error('Legal snapshot contains missing fields');
  return {
    orderId: input.orderId,
    slug: input.slug,
    version: fm.version,
    fields: Object.freeze({ ...input.fields }),
    text: filled.text,
    sha256: createHash('sha256').update(filled.text, 'utf8').digest('hex'),
  };
}

/** Reject corrupt storage before rendering or sending a frozen document. */
export function verifyLegalSnapshot(snapshot: LegalSnapshot): boolean {
  return (
    snapshot.text.length > 0 &&
    !/\{\{|\[DOĞRULANACAK/.test(snapshot.text) &&
    snapshot.sha256 === createHash('sha256').update(snapshot.text, 'utf8').digest('hex')
  );
}
