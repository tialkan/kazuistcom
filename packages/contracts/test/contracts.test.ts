import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import {
  AnswerEvent,
  ApiError,
  CONTRACT_VERSION,
  authorityClasses,
  byokProviders,
  consentKinds,
  errorCodes,
  kvkkRelations,
  kvkkReplyChannels,
  kvkkRequestKinds,
  kvkkRequestStatuses,
  notificationTypes,
  planCodes,
  refundRequestStatuses,
  reviewQueueNames,
  takedownKinds,
  takedownTargetTypes,
  formatSseEvent,
  isNonceFresh,
  jobStates,
  jobTypes,
  parseModelLine,
  recordStatuses,
  recordTypes,
  sseEventTypes,
} from '../src/index.ts';

const spec = parse(readFileSync(fileURLToPath(new URL('../openapi.yaml', import.meta.url)), 'utf8')) as {
  openapi: string;
  info: { version: string };
  paths: Record<string, unknown>;
  components: {
    schemas: Record<string, { enum?: string[]; discriminator?: { mapping: Record<string, string> } }>;
  };
};
const enumOf = (name: string) => spec.components.schemas[name]?.enum;

describe('openapi and zod stay in sync', () => {
  it('is OpenAPI 3.1', () => expect(spec.openapi).toBe('3.1.0'));
  it('contract version is the same in openapi.yaml, package.json and CONTRACT_VERSION', () => {
    expect(spec.info.version).toBe(CONTRACT_VERSION);
    expect(pkg.version).toBe(CONTRACT_VERSION);
  });
  it.each([
    ['ErrorCode', errorCodes],
    ['AuthorityClass', authorityClasses],
    ['RecordType', recordTypes],
    ['RecordStatus', recordStatuses],
    ['ByokProvider', byokProviders],
    ['JobType', jobTypes],
    ['JobState', jobStates],
    ['ConsentKind', consentKinds],
    ['KvkkRequestKind', kvkkRequestKinds],
    ['KvkkRequestStatus', kvkkRequestStatuses],
    ['KvkkRelation', kvkkRelations],
    ['KvkkReplyChannel', kvkkReplyChannels],
    ['TakedownKind', takedownKinds],
    ['TakedownTargetType', takedownTargetTypes],
    ['ReviewQueueName', reviewQueueNames],
    ['NotificationType', notificationTypes],
    ['PlanCode', planCodes],
    ['RefundRequestStatus', refundRequestStatuses],
  ])('%s enum matches', (name, values) => expect(enumOf(name)).toEqual([...values]));
  it('SSE event names match discriminator', () => {
    expect(Object.keys(spec.components.schemas.AnswerEvent?.discriminator?.mapping ?? {})).toEqual([
      ...sseEventTypes,
    ]);
  });
  it('covers Ek C.1 path groups', () => {
    const required = [
      '/health',
      '/version',
      '/v1/me',
      '/v1/search',
      '/v1/answers',
      '/v1/answers/prepare',
      '/v1/answers/verify',
      '/v1/citation-network',
      '/v1/library/export',
      '/v1/templates/rules',
      '/v1/jobs/{id}',
      '/v1/hmgs/report',
      '/v1/kampus/fulltext-requests',
      '/v1/wallet/ledger',
      '/v1/subscriptions/{id}/cancel',
      '/v1/webhooks/appstore',
      '/v1/push/apns-tokens',
      '/v1/takedown-requests',
      '/v1/kvkk-requests',
      '/v1/kvkk-requests/guest',
      '/v1/kvkk-requests/guest/verify',
      '/v1/checkout/callback',
      '/v1/checkout/subscription-callback',
      '/v1/coupons/redeem',
      '/v1/webhooks/iyzico-fraud',
      '/v1/admin/chargebacks',
      '/v1/admin/price-changes',
      '/v1/admin/refunds/pending',
      '/v1/admin/refunds/{refundRef}/resolve',
      '/v1/admin/ledger-adjustments',
    ];
    for (const p of required) expect(spec.paths, p).toHaveProperty([p]);
  });
});

describe('zod schemas', () => {
  it('error body rejects extra fields', () => {
    expect(ApiError.safeParse({ code: 'internal', message: 'x', requestId: 'r' }).success).toBe(true);
    expect(ApiError.safeParse({ code: 'internal', message: 'x', requestId: 'r', stack: 'y' }).success).toBe(
      false,
    );
  });
  it('parses model JSON Lines', () => {
    expect(parseModelLine('{"t":"son"}')).toEqual({ t: 'son' });
    expect(parseModelLine('{"t":"yetersiz","neden":"kaynak yok"}')?.t).toBe('yetersiz');
    expect(
      parseModelLine('{"t":"cumle","metin":"a","kaynaklar":["K3"],"alinti":{"K3":"birebir dayanak metni"}}')
        ?.t,
    ).toBe('cumle');
    expect(parseModelLine('{"t":"cumle","metin":"a","kaynaklar":[],"alinti":{}}')).toBeNull();
    expect(parseModelLine('not json')).toBeNull();
    expect(parseModelLine('{"t":"other"}')).toBeNull();
  });
  it('formats SSE frames', () => {
    const ev = AnswerEvent.parse({ t: 'son', requestId: 'r1', creditsCharged: 0 });
    expect(formatSseEvent(ev)).toBe('event: son\ndata: {"t":"son","requestId":"r1","creditsCharged":0}\n\n');
  });
  it('nonce is valid for 10 minutes', () => {
    const t0 = new Date('2026-10-19T10:00:00Z');
    expect(isNonceFresh(t0, new Date('2026-10-19T10:09:59Z'))).toBe(true);
    expect(isNonceFresh(t0, new Date('2026-10-19T10:10:01Z'))).toBe(false);
  });
});
