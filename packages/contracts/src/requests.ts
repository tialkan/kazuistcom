import { z } from 'zod';
import {
  ConsentKind,
  KvkkRelation,
  KvkkReplyChannel,
  KvkkRequestKind,
  TakedownKind,
  TakedownTargetType,
} from './account.ts';
import { PlanCode } from './billing.ts';
import { NotificationPrefsColumn } from './jobs.ts';
import { AnswerRequest, PrepareRequest, VerifyRequest } from './schemas.ts';

/** Request body schemas for every operation that takes a body (plan Ek C.1). Kept equal to openapi.yaml by test. */
const uuid = z.uuid();
/** Multipart file part; the route handler checks type, size (20 MB) and content. */
const filePart = z.unknown();

export const MeDeleteInput = z.strictObject({ requestRefund: z.boolean().default(true) });

export const MePatch = z.strictObject({
  name: z.string().max(120).optional(),
  avatar: z.string().max(60).optional(),
  tone: z.enum(['nazik', 'dogrudan']).optional(),
});
export const EduVerificationStart = z.strictObject({ email: z.email() });
export const EduVerificationConfirm = z.strictObject({ code: z.string().regex(/^[0-9]{6}$/) });
export const ConsentInput = z.strictObject({
  kind: ConsentKind,
  version: z.string().max(40),
  granted: z.boolean(),
});
export const TargetProfessionInput = z.strictObject({
  professionId: z.string(),
  avatar: z.string().optional(),
});
/** KVKK m.11 application by a signed in user; identity comes from the session (ADR-0023). */
export const KvkkRequestInput = z.strictObject({
  kind: KvkkRequestKind,
  detail: z.string().max(4000),
  replyChannel: KvkkReplyChannel.default('eposta'),
  /** Required by the server when replyChannel is posta. */
  address: z.string().max(500).optional(),
});
/**
 * KVKK m.11 application without an account (karar metninde adi gecen kisi). Fields follow the
 * Veri Sorumlusuna Basvuru Usul ve Esaslari Hakkinda Teblig m.5 (RG 10.03.2018, 30356). The server
 * encrypts identityNumber, sends a code to contactEmail and rate limits by IP.
 */
export const KvkkGuestRequestInput = z.strictObject({
  kind: KvkkRequestKind,
  detail: z.string().min(1).max(4000),
  requesterName: z.string().min(2).max(200),
  /** ISO 3166-1 alpha-2. TR means identityNumber is a T.C. kimlik numarasi (11 digits, checksum on server). */
  nationality: z.string().regex(/^[A-Z]{2}$/),
  /** T.C. kimlik numarasi, or passport or identity number for foreigners. */
  identityNumber: z.string().min(5).max(40),
  /** Tebligata esas yerlesim yeri veya is yeri adresi. */
  address: z.string().min(10).max(500),
  contactEmail: z.email(),
  phone: z.string().max(40).optional(),
  relation: KvkkRelation,
  replyChannel: KvkkReplyChannel,
  /** The declaration in content/hukuki/tr/basvuru.md must be accepted. */
  declaration: z.literal(true),
});
export const KvkkGuestVerifyInput = z.strictObject({
  id: uuid,
  code: z.string().regex(/^[0-9]{6}$/),
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
  planCode: PlanCode,
  couponCode: z.string().max(40).optional(),
  preInfoConsentVersion: z.string(),
  /** Version of the subscription contract text (abonelik.md), written as abonelik_sozlesmesi. */
  distanceContractConsentVersion: z.string(),
  /** Withdrawal exception box (cayma_istisnasi); the server may require it (v1.2, ADR-0026). */
  withdrawalWaiver: z.boolean().optional(),
  /** Annual commitment text version (yillik_taahhutname); the server requires it for annual plans. */
  annualCommitmentVersion: z.string().max(40).optional(),
});
/** POST /v1/coupons/redeem: credit coupon as a 90 day promotional lot, once per coupon and user. */
export const CouponRedeemInput = z.strictObject({ code: z.string().min(1).max(40) });
export const AdminChargebackInput = z.strictObject({
  orderId: uuid,
  /** iyzico case reference. */
  caseRef: z.string().min(1).max(100),
});
/** Announce a plan price change; the new price applies from a period at least 30 days away (plan 4.5/9). */
export const AdminPriceChangeInput = z.strictObject({
  planCode: PlanCode,
  newPriceKurus: z.number().int().min(1).max(10_000_000),
});
/** Outcome of a refund whose result was unknown, after checking the iyzico panel (karar 2026-10-22). */
export const AdminRefundResolveInput = z.strictObject({ outcome: z.enum(['basarili', 'basarisiz']) });
export const CancelSubscriptionInput = z.strictObject({ mode: z.enum(['donem_sonu', 'hemen']) });
export const RefundRequestInput = z.strictObject({ orderId: uuid, reason: z.string().max(2000).optional() });
export const NotificationPreferencesInput = z.strictObject({
  email: NotificationPrefsColumn.optional(),
  webPush: NotificationPrefsColumn.optional(),
  apns: NotificationPrefsColumn.optional(),
});
export const WebPushSubscriptionInput = z.strictObject({
  endpoint: z.url(),
  keys: z.strictObject({ p256dh: z.string(), auth: z.string() }),
});
export const ApnsTokenInput = z.strictObject({
  deviceToken: z.string().regex(/^[0-9a-f]{64,200}$/),
  environment: z.enum(['sandbox', 'production']),
});
/** Removal request for a record or a Kampus post or file (FR-79, FR-108, ADR-0023). */
export const TakedownRequestInput = z.strictObject({
  kind: TakedownKind,
  targetType: TakedownTargetType,
  targetId: uuid,
  requesterName: z.string().max(200).optional(),
  reason: z.string().min(1).max(4000),
  /** telif: information on the claimed right (kaldirma.md section 2). */
  rightsInfo: z.string().max(2000).optional(),
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

/** operationId to request body schema. Operations in requestBodyExempt have a provider shaped body. */
export const requestBodies = {
  updateMe: MePatch,
  deleteMe: MeDeleteInput,
  startEduVerification: EduVerificationStart,
  confirmEduVerification: EduVerificationConfirm,
  recordConsent: ConsentInput,
  setTargetProfession: TargetProfessionInput,
  createKvkkRequest: KvkkRequestInput,
  createGuestKvkkRequest: KvkkGuestRequestInput,
  verifyGuestKvkkRequest: KvkkGuestVerifyInput,
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
  redeemCoupon: CouponRedeemInput,
  adminChargeback: AdminChargebackInput,
  adminPriceChange: AdminPriceChangeInput,
  adminResolveRefund: AdminRefundResolveInput,
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
/**
 * Provider shaped bodies (signature verified or re-queried; the handler reads only the documented fields):
 * Better Auth, the iyzico webhook and fraud notification, the App Store webhook and the two iyzico checkout
 * callbacks (form body with token).
 */
export const requestBodyExempt = [
  'authPost',
  'iyzicoWebhook',
  'iyzicoFraudNotification',
  'appStoreWebhook',
  'checkoutCallback',
  'subscriptionCheckoutCallback',
] as const;
