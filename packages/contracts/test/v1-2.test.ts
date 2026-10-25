import { describe, expect, it } from 'vitest';
import {
  AdminRefundResolveInput,
  CheckoutSubscriptionInput,
  EmbedChunksPayload,
  LegalFrontMatter,
  NotifyPayload,
  RefundRequestResult,
  billingNoticeKinds,
  jobPayloadSchemas,
  legalPdfMissingFields,
  legalPdfProblems,
  legalPublishBlockers,
  legalRenderMode,
  noticeKinds,
  refundRefPattern,
} from '../src/index.ts';

const id = '00000000-0000-4000-8000-000000000001';

describe('contract v1.2: billing', () => {
  it('subscription checkout takes the waiver and the annual commitment version, both optional', () => {
    const base = {
      planCode: 'ogrenci.yillik',
      preInfoConsentVersion: '1',
      distanceContractConsentVersion: '1',
    };
    expect(CheckoutSubscriptionInput.safeParse(base).success).toBe(true);
    expect(
      CheckoutSubscriptionInput.safeParse({
        ...base,
        withdrawalWaiver: true,
        annualCommitmentVersion: '2026-10-22.1',
      }).success,
    ).toBe(true);
    expect(CheckoutSubscriptionInput.safeParse({ ...base, withdrawalWaiver: 'evet' }).success).toBe(false);
  });
  it('refund results and refund references', () => {
    expect(RefundRequestResult.safeParse({ id, status: 'bekliyor', amountKurus: null }).success).toBe(true);
    expect(RefundRequestResult.safeParse({ id, status: 'iade', amountKurus: 1 }).success).toBe(false);
    expect(refundRefPattern.test(`fesih:${id}`)).toBe(true);
    expect(refundRefPattern.test('fesih:1; drop table')).toBe(false);
    expect(AdminRefundResolveInput.safeParse({ outcome: 'basarili' }).success).toBe(true);
  });
  it('notice kinds are the billing kinds plus the cancellation confirmation', () => {
    expect(noticeKinds).toEqual([...billingNoticeKinds, 'fesih_teyidi']);
  });
});

describe('contract v1.2: job payloads', () => {
  it('notify.send subtype only with type odeme', () => {
    expect(NotifyPayload.safeParse({ type: 'odeme', subtype: 'odeme_7_gun', userId: id }).success).toBe(true);
    expect(NotifyPayload.safeParse({ type: 'kalemcik', subtype: 'odeme_7_gun', userId: id }).success).toBe(
      false,
    );
    expect(NotifyPayload.safeParse({ type: 'odeme', subtype: 'bilinmeyen', userId: id }).success).toBe(false);
  });
  it('embed.chunks carries the record id only', () => {
    expect(jobPayloadSchemas['embed.chunks']).toBe(EmbedChunksPayload);
    expect(EmbedChunksPayload.safeParse({ recordId: id }).success).toBe(true);
    expect(EmbedChunksPayload.safeParse({ recordId: id, text: 'x' }).success).toBe(false);
  });
});

describe('contract v1.2: legal PDF fields', () => {
  const fm = {
    title: 'Ön bilgilendirme',
    slug: 'on-bilgilendirme',
    route: '/hukuki/on-bilgilendirme',
    lang: 'tr',
    binding: true,
    version: '2026-10-22.1',
    date: '2026-10-22',
    status: 'yayinda',
    pdf: true,
    pdf_fields: ['TUTAR_TL', 'URUN_ADI'],
  } as const;
  const body = 'Ürün: {{URUN_ADI}}. Tutar: {{TUTAR_TL}} TL.';

  it('front matter accepts pdf and pdf_fields, and pdf_fields needs pdf: true', () => {
    expect(LegalFrontMatter.safeParse(fm).success).toBe(true);
    expect(LegalFrontMatter.safeParse({ ...fm, pdf: undefined }).success).toBe(false);
    expect(LegalFrontMatter.safeParse({ ...fm, pdf_fields: ['tutar'] }).success).toBe(false);
    expect(LegalFrontMatter.safeParse({ ...fm, pdf_fields: ['A', 'A'] }).success).toBe(false);
  });
  it('declared order fields do not block the page; any other placeholder does', () => {
    expect(legalPublishBlockers(fm, body)).toEqual([]);
    expect(legalRenderMode(fm, body, 'production')).toBe('yayin');
    expect(legalPublishBlockers(fm, `${body} KEP: {{KEP}}`)).toEqual(['yer_tutucu']);
    expect(legalPublishBlockers({ status: 'yayinda' }, body)).toEqual(['yer_tutucu']);
  });
  it('every declared field must be a placeholder of the body, and every one is required in the PDF', () => {
    expect(legalPdfProblems('a.md', fm, body)).toEqual([]);
    expect(legalPdfProblems('a.md', { ...fm, pdf_fields: ['TUTAR_TL', 'ALICI_AD'] }, body)).toHaveLength(1);
    expect(legalPdfProblems('a.md', { ...fm, pdf_fields: [] }, body)).toHaveLength(1);
    expect(legalPdfMissingFields(fm, { TUTAR_TL: '199,00', URUN_ADI: ' ' })).toEqual(['URUN_ADI']);
  });
});
