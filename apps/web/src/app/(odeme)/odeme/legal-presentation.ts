import { createHash } from 'node:crypto';
import {
  legalPdfMissingFields,
  legalPdfProblems,
  legalPublishBlockers,
  type LegalFrontMatter,
} from '@kazuist/contracts';
import { fillLegalDoc, type LegalDocSlug } from '@kazuist/ledger/billing';
import { ayristir, type Blok } from '../../(kabuk)/_hukuki/md.ts';
import type { CheckoutKind } from './gate.ts';
import type { PaymentVersions } from './submit.ts';

export interface CheckoutLegalPresentation {
  consentKey: string;
  versions: PaymentVersions;
  documents: { slug: LegalDocSlug; title: string; version: string; blocks: Blok[] }[];
}
interface Source {
  fm: LegalFrontMatter;
  ham: string;
}

/** Build the body and accepted versions from the same source objects; all environments fail closed. */
export function buildCheckoutLegalPresentation(input: {
  kind: CheckoutKind;
  annual: boolean;
  acceptedVersions: PaymentVersions;
  preInfo: Source | null;
  contract: Source | null;
  fields: Record<string, string>;
}): CheckoutLegalPresentation | null {
  const { preInfo, contract } = input;
  if (!preInfo || !contract) return null;
  const expectedContract = input.kind === 'paket' ? 'mesafeli-satis' : 'abonelik';
  const sources = [preInfo, contract];
  const expectedSlugs = ['on-bilgilendirme', expectedContract];
  const versions = [input.acceptedVersions.preInfo, input.acceptedVersions.contract];
  if (input.annual && input.acceptedVersions.annualCommitment !== contract.fm.version) return null;
  const documents: CheckoutLegalPresentation['documents'] = [];
  for (const [index, source] of sources.entries()) {
    const { fm, ham } = source;
    if (
      fm.slug !== expectedSlugs[index] ||
      fm.version !== versions[index] ||
      fm.lang !== 'tr' ||
      !fm.binding ||
      !fm.pdf ||
      !fm.pdf_fields?.length ||
      legalPublishBlockers(fm, ham).length ||
      legalPdfProblems(fm.slug, fm, ham).length ||
      legalPdfMissingFields(fm, input.fields).length
    )
      return null;
    const filled = fillLegalDoc({
      slug: fm.slug as LegalDocSlug,
      body: ham,
      version: fm.version,
      orderId: 'checkout-preview',
      fields: input.fields,
    });
    if (!filled.ok || /\{\{|\[DOĞRULANACAK/.test(filled.text)) return null;
    // The pending order has no ID yet. The UI shows its accepted version separately, not a fictitious ID.
    const body = filled.text.split('\n').slice(2).join('\n').trim();
    if (!body) return null;
    documents.push({
      slug: fm.slug as LegalDocSlug,
      title: fm.title,
      version: fm.version,
      blocks: ayristir(body),
    });
  }
  return {
    documents,
    versions: { ...input.acceptedVersions },
    consentKey: createHash('sha256').update(JSON.stringify(documents), 'utf8').digest('hex'),
  };
}
