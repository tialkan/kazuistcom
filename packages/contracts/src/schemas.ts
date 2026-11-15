import { z } from 'zod';

/** Contract version; equals openapi.yaml info.version and this package's version (ADR-0023). */
export const CONTRACT_VERSION = '1.6.0';

/** Error body for every endpoint (plan Ek C.1, wt.65). */
export const errorCodes = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'payload_too_large',
  'rate_limited',
  'insufficient_credits',
  'nonce_expired',
  'unavailable',
  'internal',
] as const;
export type ErrorCode = z.infer<typeof ErrorCode>;
export const ErrorCode = z.enum(errorCodes);
export const ApiError = z.strictObject({
  code: ErrorCode,
  message: z.string(),
  requestId: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

/** Overall state only; dependency and variable names stay internal. */
export const Health = z.strictObject({ status: z.enum(['ok', 'degraded']) });
export type Health = z.infer<typeof Health>;

export const Version = z.object({
  version: z.string(),
  commit: z.string(),
  builtAt: z.iso.datetime(),
});
export type Version = z.infer<typeof Version>;

/** plan Ek F */
export const authorityClasses = [
  'baglayici_norm',
  'baglayici_karar',
  'yuksek_emsal',
  'emsal',
  'emsal_sinirli',
  'idari_karar',
  'doktrin',
  'karsilastirmali',
] as const;
export type AuthorityClass = z.infer<typeof AuthorityClass>;
export const AuthorityClass = z.enum(authorityClasses);

export const recordTypes = [
  'mevzuat',
  'karar',
  'kurul_karari',
  'makale',
  'kitap',
  'tez',
  'ab_hukuku',
] as const;
export type RecordType = z.infer<typeof RecordType>;
export const RecordType = z.enum(recordTypes);

export const recordStatuses = [
  'yururlukte',
  'degisti',
  'yururlukten_kalkti',
  'bozuldu',
  'onandi',
  'kesinlesti',
  'bilinmiyor',
] as const;
export type RecordStatus = z.infer<typeof RecordStatus>;
export const RecordStatus = z.enum(recordStatuses);

export const byokProviders = ['anthropic', 'openrouter', 'openai', 'gemini'] as const;
export type ByokProvider = z.infer<typeof ByokProvider>;
export const ByokProvider = z.enum(byokProviders);

/** plan Ek C.3. Append only (pg enum job_type); account.purge added in v1.1 (ADR-0023). */
export const jobTypes = [
  'ingest.fetch',
  'ingest.parse',
  'anon.run',
  'embed.chunks',
  'citations.extract',
  'rules.extract',
  'docx.validate',
  'kampus.summarize',
  'kampus.poster',
  'billing.monthly_grant',
  'billing.reconcile',
  'notify.send',
  'kalemcik.daily',
  'mevzuat.rg_daily',
  'live.fetch',
  'account.purge',
] as const;
export const JobType = z.enum(jobTypes);
export type JobType = z.infer<typeof JobType>;
export const jobStates = ['queued', 'running', 'done', 'failed', 'dead'] as const;
export const JobState = z.enum(jobStates);
export type JobState = z.infer<typeof JobState>;

export const SearchQuery = z.strictObject({
  q: z.string().min(1).max(500),
  type: RecordType.optional(),
  sort: z.enum(['ilgililik', 'onem', 'tarih_yeni', 'tarih_eski']).default('ilgililik'),
  page: z.coerce.number().int().min(1).max(50).default(1),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  court: z.string().max(100).optional(),
  authority: AuthorityClass.optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SourceChip = z.object({
  id: z.string(),
  recordId: z.uuid(),
  title: z.string(),
  authorityClass: AuthorityClass,
  status: RecordStatus,
  date: z.iso.date().nullable().optional(),
  fetchedAt: z.iso.datetime().nullable().optional(),
});
export type SourceChip = z.infer<typeof SourceChip>;

/**
 * Control characters a question may not carry (v1.6, ADR-0038): C0 controls except tab, line feed and carriage
 * return, and DEL. The gateway masks the question and the passages in one label space with an internal separator
 * (plan 8.5); a question holding such a character could shift the passages, so it is refused at the schema.
 * openapi.yaml AnswerRequest.q and PrepareRequest.q carry the same rule as `pattern`.
 */
// eslint-disable-next-line no-control-regex -- the point is to match control characters
export const QUESTION_TEXT_PATTERN = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
export const QuestionText = z
  .string()
  .min(3)
  .max(1000)
  .regex(QUESTION_TEXT_PATTERN, { message: 'q must not contain control characters' });

/** Search filters of a sourced summary, the same in platform mode and in BYOK client mode (v1.6, ADR-0038). */
export const AnswerFilters = z.strictObject({
  type: RecordType.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  court: z.string().optional(),
});
export type AnswerFilters = z.infer<typeof AnswerFilters>;

export const AnswerRequest = z.strictObject({
  q: QuestionText,
  mode: z.enum(['platform', 'byok_aktarma']).default('platform'),
  depth: z.enum(['standart', 'derin']).default('standart'),
  filters: AnswerFilters.optional(),
  byok: z
    .strictObject({
      provider: ByokProvider,
      model: z.string().max(120),
      apiKey: z.string().max(400),
    })
    .optional(),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

/** SSE event names for POST /v1/answers. The SSE `event:` field equals `t`. */
export const sseEventTypes = ['cumle', 'kaynaklar', 'uyari', 'cekimser', 'son'] as const;
export type SseEventType = (typeof sseEventTypes)[number];

export const CumleEvent = z.object({
  t: z.literal('cumle'),
  index: z.number().int().min(0).max(2),
  metin: z.string(),
  kaynaklar: z.array(z.string()).min(1),
  alinti: z.record(z.string(), z.string().min(12)),
  destekleyici: z.boolean().optional(),
});
export const KaynaklarEvent = z.object({ t: z.literal('kaynaklar'), kaynaklar: z.array(SourceChip) });
export const UyariEvent = z.object({
  t: z.literal('uyari'),
  kod: z.enum(['veri_gunu', 'guncellik', 'destekleyici_kaynak', 'sabit_fr19', 'sabit_fr20']),
  metin: z.string(),
  cumleIndex: z.number().int().nullable().optional(),
});
export const CekimserEvent = z.object({
  t: z.literal('cekimser'),
  metin: z.string(),
  neden: z.string().nullable().optional(),
});
export const SonEvent = z.object({
  t: z.literal('son'),
  requestId: z.string(),
  creditsCharged: z.number().int().min(0),
  droppedLines: z.number().int().min(0).optional(),
});
export const AnswerEvent = z.discriminatedUnion('t', [
  CumleEvent,
  KaynaklarEvent,
  UyariEvent,
  CekimserEvent,
  SonEvent,
]);
export type AnswerEvent = z.infer<typeof AnswerEvent>;

/** Serialise one SSE frame. */
export function formatSseEvent(event: AnswerEvent): string {
  return `event: ${event.t}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Model output line (plan Ek D.1). One JSON object per line.
 * Structural check only; semantic validation (quotes in passages, numbers, names) lives in packages/casuist.
 */
export const ModelLineCumle = z.strictObject({
  t: z.literal('cumle'),
  metin: z.string().min(1),
  kaynaklar: z.array(z.string().regex(/^K\d+$/)).min(1),
  alinti: z.record(z.string().regex(/^K\d+$/), z.string()),
});
export const ModelLineYetersiz = z.strictObject({ t: z.literal('yetersiz'), neden: z.string() });
export const ModelLineSon = z.strictObject({ t: z.literal('son') });
export const ModelLine = z.discriminatedUnion('t', [ModelLineCumle, ModelLineYetersiz, ModelLineSon]);
export type ModelLine = z.infer<typeof ModelLine>;

/** Parse one raw JSON Lines string; returns null when it is not valid JSON or fails the schema. */
export function parseModelLine(raw: string): ModelLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = ModelLine.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * BYOK client protocol (plan 8.1). The nonce is single use: prepare stores it in Valkey with
 * SET key value NX EX 600, verify consumes it with GETDEL; missing means expired or reused (410).
 */
export const byokNonceKey = (nonce: string): string => `byok:nonce:${nonce}`;
export const BYOK_NONCE_TTL_SECONDS = 600;

export const PrepareRequest = z.strictObject({
  q: QuestionText,
  provider: ByokProvider,
  model: z.string().max(120),
  depth: z.enum(['standart', 'derin']).default('standart'),
  /** v1.6 (ADR-0038): the same search filters as AnswerRequest.filters. */
  filters: AnswerFilters.optional(),
});
export type PrepareRequest = z.infer<typeof PrepareRequest>;

export const PrepareResponse = z
  .object({
    nonce: z.string().min(16),
    expiresAt: z.iso.datetime(),
    signature: z.string(),
    system: z.string(),
    prompt: z.string(),
    sources: z.array(SourceChip),
    passages: z.record(z.string(), z.string()).optional(),
    limits: z.object({ maxInputTokens: z.number().int(), maxOutputTokens: z.number().int() }),
  })
  .refine((v) => Date.parse(v.expiresAt) > 0, { message: 'expiresAt must be a valid date' });
export type PrepareResponse = z.infer<typeof PrepareResponse>;

export const VerifyRequest = z.strictObject({
  nonce: z.string(),
  signature: z.string(),
  lines: z.array(z.string().max(4000)).max(20),
  save: z.boolean().default(false),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const VerifyResponse = z.object({
  results: z.array(
    z.object({ index: z.number().int(), ok: z.boolean(), reason: z.string().nullable().optional() }),
  ),
  abstained: z.boolean(),
  savedId: z.uuid().nullable().optional(),
});
export type VerifyResponse = z.infer<typeof VerifyResponse>;

/** True when a nonce issued at `issuedAt` is still valid at `now` (10 minutes). */
export function isNonceFresh(issuedAt: Date, now: Date = new Date()): boolean {
  const age = now.getTime() - issuedAt.getTime();
  return age >= 0 && age <= BYOK_NONCE_TTL_SECONDS * 1000;
}
