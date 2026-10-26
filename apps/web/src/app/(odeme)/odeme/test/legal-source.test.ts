import type { LegalFrontMatter } from '@kazuist/contracts';
import { expect, it } from 'vitest';
import { buildCheckoutLegalPresentation } from '../legal-presentation.ts';
import { checkoutRequest } from '../submit.ts';

const source = (slug: string, title: string) => ({
  fm: {
    title,
    slug,
    route: `/hukuki/${slug}`,
    lang: 'tr',
    binding: true,
    version: '2026-10-26.1',
    date: '2026-10-26',
    status: 'yayinda',
    pdf: true,
    pdf_fields: ['ALICI_AD', 'ALICI_EPOSTA', 'TUTAR_TL'],
  } as LegalFrontMatter,
  ham: '## Koşullar\n\nAlıcı: {{ALICI_AD}} ({{ALICI_EPOSTA}}), toplam {{TUTAR_TL}} TL.\n\n> İade hakkı koşullara tabidir.',
});
const input = () => ({
  kind: 'paket' as const,
  annual: false,
  acceptedVersions: { preInfo: '2026-10-26.1', contract: '2026-10-26.1' },
  preInfo: source('on-bilgilendirme', 'Ön bilgilendirme formu'),
  contract: source('mesafeli-satis', 'Mesafeli satış sözleşmesi'),
  fields: { ALICI_AD: 'Çağrı Özgür', ALICI_EPOSTA: 'cagri@example.invalid', TUTAR_TL: '349,00' },
});
it('fills the published source using the real buyer/order fields and submits precisely its displayed versions', () => {
  const ready = buildCheckoutLegalPresentation(input());
  expect(ready).not.toBeNull();
  if (!ready) throw new Error('Published fixture must render');
  expect(JSON.stringify(ready.documents)).toContain('Çağrı Özgür (cagri@example.invalid), toplam 349,00 TL.');
  expect(JSON.stringify(ready.documents)).not.toContain('{{');
  expect(JSON.stringify(ready.documents)).toContain('İade hakkı koşullara tabidir.');
  expect(ready.documents.map((doc) => doc.version)).toEqual([
    ready.versions.preInfo,
    ready.versions.contract,
  ]);
  const sent = JSON.parse(
    String(
      checkoutRequest({
        kind: 'paket',
        code: 'kredi.300',
        versions: ready.versions,
        withdrawalWaiver: true,
        idempotencyKey: 'fixture-key',
      }).init.body,
    ),
  );
  expect(sent.preInfoConsentVersion).toBe(ready.documents[0]?.version);
  expect(sent.distanceContractConsentVersion).toBe(ready.documents[1]?.version);
});
it.each([
  'taslak',
  'wrong-version',
  'missing-field',
  'company-placeholder',
  'verification-marker',
  'missing-source',
  'wrong-contract',
  'pdf-undeclared',
])('keeps payment closed on %s even outside production', (reason) => {
  const p = input();
  if (reason === 'taslak') p.preInfo.fm.status = 'taslak';
  if (reason === 'wrong-version') p.acceptedVersions.contract = '2026-10-25.1';
  if (reason === 'missing-field') p.fields.ALICI_EPOSTA = ' ';
  if (reason === 'company-placeholder') p.preInfo.ham += '\nKEP: {{KEP}}';
  if (reason === 'verification-marker') p.contract.ham += '\n[DOĞRULANACAK: künye]';
  if (reason === 'wrong-contract') p.contract.fm.slug = 'abonelik';
  if (reason === 'pdf-undeclared') p.preInfo.fm.pdf = false;
  expect(
    buildCheckoutLegalPresentation(reason === 'missing-source' ? { ...p, contract: null } : p),
  ).toBeNull();
});
it('requires the displayed annual subscription contract version as annual commitment', () => {
  const p = input();
  const contract = source('abonelik', 'Abonelik sözleşmesi');
  expect(buildCheckoutLegalPresentation({ ...p, kind: 'abonelik', annual: true, contract })).toBeNull();
  const ready = buildCheckoutLegalPresentation({
    ...p,
    kind: 'abonelik',
    annual: true,
    contract,
    acceptedVersions: { ...p.acceptedVersions, annualCommitment: contract.fm.version },
  });
  expect(ready?.documents[1]?.title).toBe('Abonelik sözleşmesi');
});

it('changes consent identity when the buyer or displayed price changes, so confirmations can reset', () => {
  const p = input();
  const before = buildCheckoutLegalPresentation(p);
  const after = buildCheckoutLegalPresentation({ ...p, fields: { ...p.fields, TUTAR_TL: '399,00' } });
  expect(before?.consentKey).toBeTruthy();
  expect(after?.consentKey).not.toBe(before?.consentKey);
});
