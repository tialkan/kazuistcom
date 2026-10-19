import { z } from 'zod';
import { AnswerRequest, PrepareRequest, VerifyRequest } from './schemas.ts';

/** Request body schemas for every operation that takes a body (plan Ek C.1). Kept equal to openapi.yaml by test. */
const uuid = z.uuid();
const consentKinds = [
  'aydinlatma',
  'acik_riza_analitik',
  'acik_riza_pazarlama',
  'kullanim_kosullari',
  'on_bilgilendirme',
  'mesafeli_sozlesme',
  'cayma_istisnasi',
  'yz_aktarim',
] as const;
/** Multipart file part; the route handler checks type, size (20 MB) and content. */
const filePart = z.unknown();

export const MePatch = z.strictObject({
  name: z.string().max(120).optional(),
  avatar: z.string().max(60).optional(),
  tone: z.enum(['nazik', 'dogrudan']).optional(),
});
export const EduVerificationStart = z.strictObject({ email: z.email() });
export const EduVerificationConfirm = z.strictObject({ code: z.string().regex(/^[0-9]{6}$/) });
export const ConsentInput = z.strictObject({
  kind: z.enum(consentKinds),
  version: z.string().max(40),
  granted: z.boolean(),
});
export const TargetProfessionInput = z.strictObject({
  professionId: z.string(),
  avatar: z.string().optional(),
});
export const KvkkRequestInput = z.strictObject({
  kind: z.enum(['bilgi', 'duzeltme', 'silme', 'itiraz', 'aktarim_bilgisi']),
  detail: z.string().max(4000),
});
export const LibraryItemInput = z.strictObject({ recordId: uuid, note: z.string().max(2000).optional() });
export const GuideProgressInput = z.strictObject({ completedSteps: z.array(z.string()) });
export const TemplateRulesUpload = z.strictObject({
  file: filePart,
  institutionName: z.string().max(200).optional(),
});
export const TemplateDocxInput = z.strictObject({
  templateRuleId: uuid.optional(),
  journalRuleVersionId: uuid.optional(),
});
export const WritingProjectInput = z.strictObject({
  title: z.string().max(300).optional(),
  kind: z.enum(['tez', 'makale', 'odev']).optional(),
  targetWords: z.number().int().min(0).optional(),
  deadline: z.iso.date().optional(),
});
export const WritingProgressInput = z.strictObject({
  words: z.number().int().min(0).max(100000),
  note: z.string().max(1000).optional(),
});
export const DocxCountUpload = z.strictObject({ file: filePart });
export const AbbreviationsInput = z.strictObject({
  text: z.string().max(200000),
  useAi: z.boolean().default(false),
});
export const ReviewInput = z.strictObject({
  cardId: uuid,
  rating: z.number().int().min(1).max(4),
  reviewedAt: z.iso.datetime(),
});
export const HmgsAttemptInput = z.strictObject({
  answers: z.array(z.strictObject({ cardId: uuid, choice: z.enum(['A', 'B', 'C', 'D', 'E']).nullable() })),
});
export const KampusProfileInput = z.strictObject({
  displayName: z.string().max(120),
  institution: z.string().nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
});
export const KampusPostInput = z.strictObject({
  kind: z.enum(['makale', 'tez', 'bildiri', 'poster', 'not']),
  title: z.string().max(300),
  abstract: z.string().max(5000).optional(),
  fileId: uuid.optional(),
});
export const KampusFollowInput = z.strictObject({ profileId: uuid });
export const KampusFileJobInput = z.strictObject({ fileId: uuid });
export const KampusFulltextRequestInput = z.strictObject({
  postId: uuid,
  message: z.string().max(1000).optional(),
});
export const KampusReportInput = z.strictObject({
  targetType: z.enum(['post', 'profile', 'file']),
  targetId: uuid,
  reason: z.string().max(2000),
});
export const CheckoutTopupInput = z.strictObject({
  productCode: z.enum(['kredi.300', 'kredi.1000', 'kredi.3000']),
  couponCode: z.string().max(40).optional(),
  preInfoConsentVersion: z.string(),
  distanceContractConsentVersion: z.string(),
  withdrawalWaiver: z.boolean(),
});
export const CheckoutSubscriptionInput = z.strictObject({
  planCode: z.enum(['ogrenci.aylik', 'ogrenci.yillik', 'akademisyen.aylik', 'akademisyen.yillik']),
  couponCode: z.string().max(40).optional(),
  preInfoConsentVersion: z.string(),
  distanceContractConsentVersion: z.string(),
});
export const CancelSubscriptionInput = z.strictObject({ mode: z.enum(['donem_sonu', 'hemen']) });
export const RefundRequestInput = z.strictObject({ orderId: uuid, reason: z.string().max(2000).optional() });
const channelPrefs = z.record(z.string(), z.boolean());
export const NotificationPreferencesInput = z.strictObject({
  email: channelPrefs.optional(),
  webPush: channelPrefs.optional(),
  apns: channelPrefs.optional(),
});
export const WebPushSubscriptionInput = z.strictObject({
  endpoint: z.url(),
  keys: z.strictObject({ p256dh: z.string(), auth: z.string() }),
});
export const ApnsTokenInput = z.strictObject({
  deviceToken: z.string().regex(/^[0-9a-f]{64,200}$/),
  environment: z.enum(['sandbox', 'production']),
});
export const TakedownRequestInput = z.strictObject({
  recordId: uuid,
  reason: z.string().max(4000),
  contactEmail: z.email(),
});
export const AdminQueueDecisionInput = z.strictObject({
  decision: z.enum(['onay', 'ret', 'duzelt']),
  note: z.string().max(2000).optional(),
  patch: z
    .strictObject({
      changes: z
        .array(z.strictObject({ path: z.string().max(200), value: z.unknown() }))
        .max(100)
        .optional(),
    })
    .optional(),
});
export const AdminPriceTableInput = z.strictObject({
  version: z.string(),
  effectiveFrom: z.iso.datetime(),
  products: z.array(
    z.strictObject({
      code: z.string(),
      priceKurus: z.number().int(),
      credits: z.number().int().nullable().optional(),
    }),
  ),
  operations: z.record(z.string(), z.number().int()),
});
export const AdminFeatureFlagInput = z.strictObject({
  key: z.string().regex(/^[a-z0-9_.]{1,80}$/),
  enabled: z.boolean(),
  rolloutPercent: z.number().int().min(0).max(100).optional(),
});
export const AdminProfessionInput = z.strictObject({
  id: z.string(),
  label: z.string(),
  avatars: z.array(z.string()).optional(),
});
export const AdminWeightsInput = z.record(z.string(), z.number());
export const AdminLedgerAdjustmentInput = z.strictObject({
  userId: uuid,
  credits: z.number().int(),
  reason: z.string().min(10).max(2000),
});

/** operationId to request body schema. Exempt: authPost (Better Auth), iyzicoWebhook and appStoreWebhook (provider shape, signature verified). */
export const requestBodies = {
  updateMe: MePatch,
  startEduVerification: EduVerificationStart,
  confirmEduVerification: EduVerificationConfirm,
  recordConsent: ConsentInput,
  setTargetProfession: TargetProfessionInput,
  createKvkkRequest: KvkkRequestInput,
  createAnswer: AnswerRequest,
  prepareAnswer: PrepareRequest,
  verifyAnswer: VerifyRequest,
  addLibraryItem: LibraryItemInput,
  setGuideProgress: GuideProgressInput,
  extractTemplateRules: TemplateRulesUpload,
  createTemplateDocx: TemplateDocxInput,
  createWritingProject: WritingProjectInput,
  updateWritingProject: WritingProjectInput,
  logWritingProgress: WritingProgressInput,
  countDocxWords: DocxCountUpload,
  buildAbbreviations: AbbreviationsInput,
  submitReview: ReviewInput,
  submitHmgsAttempt: HmgsAttemptInput,
  upsertKampusProfile: KampusProfileInput,
  createKampusPost: KampusPostInput,
  followKampusProfile: KampusFollowInput,
  createKampusSummary: KampusFileJobInput,
  createKampusPoster: KampusFileJobInput,
  createKampusFulltextRequest: KampusFulltextRequestInput,
  createKampusReport: KampusReportInput,
  checkoutTopup: CheckoutTopupInput,
  checkoutSubscription: CheckoutSubscriptionInput,
  cancelSubscription: CancelSubscriptionInput,
  createRefundRequest: RefundRequestInput,
  setNotificationPreferences: NotificationPreferencesInput,
  registerWebPush: WebPushSubscriptionInput,
  registerApnsToken: ApnsTokenInput,
  createTakedownRequest: TakedownRequestInput,
  adminDecideQueueItem: AdminQueueDecisionInput,
  adminCreatePriceTable: AdminPriceTableInput,
  adminSetFlag: AdminFeatureFlagInput,
  adminUpsertProfession: AdminProfessionInput,
  adminSetWeights: AdminWeightsInput,
  adminLedgerAdjustment: AdminLedgerAdjustmentInput,
} as const;
export const requestBodyExempt = ['authPost', 'iyzicoWebhook', 'appStoreWebhook'] as const;
