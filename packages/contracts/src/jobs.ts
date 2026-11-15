import { z } from 'zod';
import { BillingNoticeKind } from './billing.ts';
import type { JobType } from './schemas.ts';

/**
 * Job payload schemas (plan Ek C.3, ADR-0023, ADR-0035). Producers in Node and Python write exactly these shapes;
 * payloads carry ids, never personal data or text. Every job type either has a schema in jobPayloadSchemas or is
 * listed in jobPayloadExempt (no producer and no consumer yet); a test keeps the two lists complete and disjoint.
 * Consumers validate a claimed payload with parseJobPayload and bury an invalid one (status dead, error
 * `invalid payload`); services/worker-py/core/jobs.py checks the same shapes by hand
 * (packages/contracts/test/fixtures/job-payloads.json is the shared fixture of both sides).
 */

/** Notification kinds (plan 10.8). Only `kampanya` is a commercial electronic message (6563, IYS). */
export const notificationTypes = [
  'teslim_hatirlatmasi',
  'kalemcik',
  'tam_metin_istegi',
  'tam_metin_cevabi',
  'takip',
  'odeme',
  'fesih_teyidi',
  'mevzuat_degisikligi',
  'kampanya',
] as const;
export const NotificationType = z.enum(notificationTypes);
export type NotificationType = z.infer<typeof NotificationType>;

export const notificationChannels = ['email', 'web_push', 'apns'] as const;
export const NotificationChannel = z.enum(notificationChannels);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

/**
 * One column of notification_prefs (email, web_push, apns): `{ "<notification type>": boolean }`.
 * A missing key means the type's default (kimlik notify/prefs.ts).
 */
export const NotificationPrefsColumn = z.partialRecord(NotificationType, z.boolean());
export type NotificationPrefsColumn = z.infer<typeof NotificationPrefsColumn>;

/** push_subscriptions.channel and .environment (the environment is set for apns only). */
export const pushChannels = ['web_push', 'apns'] as const;
export const apnsEnvironments = ['production', 'sandbox'] as const;

/** notify.send payload. The worker renders the text from i18n; no text or address is queued. */
export const NotifyPayload = z
  .strictObject({
    type: NotificationType,
    /**
     * Template of a billing notice (v1.2, ADR-0026). Only with type odeme; preferences stay per type.
     * Producers before v1.2 encode it as the refId prefix (<subtype>:<ref>), which renderers still accept.
     */
    subtype: BillingNoticeKind.optional(),
    userId: z.uuid(),
    refId: z.string().max(100).optional(),
    /** Restrict to some channels; default every channel the user allows. */
    channels: z.array(NotificationChannel).optional(),
  })
  .refine((p) => p.subtype === undefined || p.type === 'odeme', {
    message: 'subtype is only allowed with type odeme',
    path: ['subtype'],
  });
export type NotifyPayload = z.infer<typeof NotifyPayload>;

/**
 * account.purge payload. Enqueued by DELETE /v1/me with run_after = deletion time + grace period
 * (ADR-0023: at most 30 days, KVKK m.13/2). The handler deletes the users row; consents and audit_log keep
 * only the hash (ON DELETE SET NULL), billing records are kept as the law requires.
 */
export const AccountPurgePayload = z.strictObject({ userId: z.uuid() });
export type AccountPurgePayload = z.infer<typeof AccountPurgePayload>;

/** anon.run payload (services/worker-py/anonymizer/job.py). */
export const AnonRunPayload = z.strictObject({ recordId: z.uuid() });

/**
 * embed.chunks payload (v1.2, ADR-0026). Enqueued with dedupe key embed:<recordId> by anon.run and by the
 * records trigger whenever masked_text gets a value. The consumer embeds records.masked_text only; it
 * remembers md5(masked_text) when it reads and, in the write transaction, locks the record row and writes the
 * chunks only if the hash is unchanged, otherwise it fails the job so the retry reads the new text. Chunks of
 * a record are deleted by the records trigger whenever masked_text changes or becomes NULL (fail closed).
 */
export const EmbedChunksPayload = z.strictObject({ recordId: z.uuid() });
export type EmbedChunksPayload = z.infer<typeof EmbedChunksPayload>;

/** billing.reconcile payload: the UTC day to reconcile, default yesterday. */
export const BillingReconcilePayload = z.strictObject({ day: z.iso.date().optional() });

/** http or https URL without white space (the connectors refuse other schemes again, core/ssrf.py). */
const httpUrl = z
  .string()
  .max(2000)
  .regex(/^https?:\/\/\S+$/);

/** Decision types of the Constitutional Court bank (services/worker-py/connectors/aym.py BB and ND). */
export const aymDecisionTypes = ['BireyselBasvuru', 'NormDenetimi'] as const;
/** Courts collected by unit, decision year and page (connectors/yargitay.py and connectors/danistay.py). */
export const courtSources = ['yargitay', 'danistay'] as const;
/** Highest list page a discovery job may ask for (services/worker-py/core/discovery.py MAX_PAGE). */
export const INGEST_MAX_PAGE = 10_000;

const listPage = z.number().int().min(1).max(INGEST_MAX_PAGE);
/**
 * Case number as the court writes it ("2024/817", "2019/1-123"), the same form as connectors/judicial.py
 * case_number, which also allows a trailing "/<digits>". ASCII digits only.
 */
const caseNumber = z
  .string()
  .max(50)
  .regex(/^[0-9]{4}\/[0-9A-Za-z()-]+(?:\/[0-9]+)?$/);

/**
 * ingest.fetch payload (v1.5 ADR-0035, extended in v1.6 ADR-0038), one or two shapes per connector
 * (services/worker-py/core/runtime.py and core/discovery.py). Payloads carry identifiers only (numbers, dates,
 * unit names, addresses of public pages), never a party name or decision text. A z.union, not a discriminated
 * union, because kvkk, rekabet, aym, yargitay and danistay each have a list shape and a document shape:
 *
 * - mevzuat: one law (mevzuat.rg_daily produces it with kanunNo and rgDate).
 * - kvkk and rekabet: one decision page (url) or, since v1.6, a list page (page) that queues the unknown decisions.
 * - aym (v1.6): a list page per decision type or one decision by its bank id. The bank's ids are GUIDs that are not
 *   RFC 9562 UUIDs (version and variant digits are arbitrary), so the check is z.guid(), not z.uuid().
 * - yargitay and danistay (v1.6): a list page (unit, decision year, page) or one decision (bank id, unit, case and
 *   decision number, decision date).
 * - openalex, crossref (doi) and eurlex (celex).
 */
export const IngestFetchPayload = z.union([
  z.strictObject({ source: z.literal('kvkk'), url: httpUrl }),
  z.strictObject({ source: z.literal('rekabet'), url: httpUrl, pdfUrl: httpUrl.optional() }),
  z.strictObject({ source: z.enum(['kvkk', 'rekabet']), page: listPage }),
  z.strictObject({ source: z.literal('aym'), kararTipi: z.enum(aymDecisionTypes), page: listPage }),
  z.strictObject({ source: z.literal('aym'), kararTipi: z.enum(aymDecisionTypes), id: z.guid() }),
  z.strictObject({
    source: z.enum(courtSources),
    unit: z.string().min(1).max(100),
    year: z.number().int().min(1900).max(2100),
    page: listPage,
  }),
  z.strictObject({
    source: z.enum(courtSources),
    id: z.string().regex(/^[0-9]{1,20}$/),
    unit: z.string().min(1).max(100),
    esas: caseNumber,
    karar: caseNumber,
    date: z.iso.date(),
  }),
  z.strictObject({ source: z.literal('openalex'), doi: z.string().min(1).max(200) }),
  z.strictObject({ source: z.literal('crossref'), doi: z.string().min(1).max(200) }),
  z.strictObject({ source: z.literal('eurlex'), celex: z.string().min(1).max(50) }),
  z
    .strictObject({
      source: z.literal('mevzuat'),
      kanunNo: z.string().regex(/^[0-9]{1,6}$/),
      title: z.string().min(1).max(300).optional(),
      tur: z.number().int().min(1).max(99).optional(),
      tertip: z.number().int().min(1).max(9).optional(),
      snapshotDate: z.iso.date().optional(),
      rgDate: z.iso.date().optional(),
    })
    .refine((p) => p.snapshotDate !== undefined || p.rgDate !== undefined, {
      message: 'snapshotDate or rgDate is required',
      path: ['rgDate'],
    }),
]);
export type IngestFetchPayload = z.infer<typeof IngestFetchPayload>;

/** mevzuat.rg_daily payload: the Resmi Gazete issue day, default today (UTC). */
export const MevzuatRgDailyPayload = z.strictObject({ date: z.iso.date().optional() });

/** At most this many records per citations.extract job (services/worker-py/citations/job.py MAX_RECORDS). */
export const CITATIONS_MAX_RECORDS = 500;
const citationRecordIds = z.array(z.uuid()).min(1).max(CITATIONS_MAX_RECORDS);

/**
 * citations.extract payload: one record, a list of records, or the follow-up that collects a Batch API answer
 * (batchId, the submitted records and the poll count, at most 150 polls).
 */
export const CitationsExtractPayload = z.union([
  z.strictObject({ recordId: z.uuid() }),
  z.strictObject({ recordIds: citationRecordIds }),
  z.strictObject({
    batchId: z.string().min(1).max(200),
    recordIds: citationRecordIds,
    poll: z.number().int().min(0).max(150),
  }),
]);
export type CitationsExtractPayload = z.infer<typeof CitationsExtractPayload>;

/**
 * rules.extract payload (yazma, apps/web/src/app/yazma/_sunucu/kurallar.ts). The web process creates the row in
 * the running state and finishes it itself; the payload says only who asked and for which template kind.
 */
export const RulesExtractPayload = z.strictObject({ userId: z.uuid(), kind: z.enum(['tez', 'makale']) });

/** kalemcik.daily and billing.monthly_grant carry nothing: the handler works on the day it runs. */
export const EmptyJobPayload = z.strictObject({});

export const jobPayloadSchemas = {
  'ingest.fetch': IngestFetchPayload,
  'anon.run': AnonRunPayload,
  'embed.chunks': EmbedChunksPayload,
  'citations.extract': CitationsExtractPayload,
  'rules.extract': RulesExtractPayload,
  'billing.monthly_grant': EmptyJobPayload,
  'billing.reconcile': BillingReconcilePayload,
  'notify.send': NotifyPayload,
  'kalemcik.daily': EmptyJobPayload,
  'mevzuat.rg_daily': MevzuatRgDailyPayload,
  'account.purge': AccountPurgePayload,
} as const satisfies Partial<Record<JobType, z.ZodType>>;

/**
 * Job types without a payload schema (v1.5, ADR-0035): none has a producer or a consumer. Registering a consumer
 * for one of them needs a schema first; until then parseJobPayload answers no_schema and the consumer buries the
 * job. kampus.* and docx.validate are removed in step B (docs/istekler/mimar-p1-sozlesme-temizligi.md, ADR-0036).
 */
export const jobPayloadExempt = [
  'ingest.parse',
  'docx.validate',
  'kampus.summarize',
  'kampus.poster',
  'live.fetch',
] as const satisfies readonly JobType[];

export type JobTypeWithPayload = keyof typeof jobPayloadSchemas;
/** Payload a producer passes for a job type (zod input, before defaults). */
export type JobPayloadInput<T extends JobTypeWithPayload> = z.input<(typeof jobPayloadSchemas)[T]>;
/** Payload a consumer receives after parseJobPayload. */
export type JobPayload<T extends JobTypeWithPayload> = z.output<(typeof jobPayloadSchemas)[T]>;

export const hasJobPayloadSchema = (type: JobType): type is JobTypeWithPayload =>
  Object.hasOwn(jobPayloadSchemas, type);

export type ParsedJobPayload<T extends JobType> =
  | { success: true; data: T extends JobTypeWithPayload ? JobPayload<T> : never }
  | { success: false; reason: 'invalid_payload' | 'no_schema' };

/**
 * Validate a payload against its job type. Never throws and never echoes the payload (it may hold ids only, but
 * the error path stays content free): the failure reason is one of two fixed codes.
 */
export function parseJobPayload<T extends JobType>(type: T, payload: unknown): ParsedJobPayload<T> {
  if (!hasJobPayloadSchema(type)) return { success: false, reason: 'no_schema' };
  const schema: z.ZodType = jobPayloadSchemas[type];
  const r = schema.safeParse(payload);
  return r.success
    ? ({ success: true, data: r.data } as ParsedJobPayload<T>)
    : { success: false, reason: 'invalid_payload' };
}
