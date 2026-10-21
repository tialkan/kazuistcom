import { z } from 'zod';
import { ByokProvider } from './schemas.ts';

/**
 * Account, consent, KVKK and takedown vocabulary shared by the API (openapi.yaml), packages/db enums and
 * the worker. Contract v1.1, ADR-0023. Tests keep every list equal to its OpenAPI enum and pg enum.
 */

/** Consent kinds (plan 9.2/8, 8.4/2, 11). Append only: a pg enum value cannot be removed safely. */
export const consentKinds = [
  'aydinlatma',
  'acik_riza_analitik',
  'acik_riza_pazarlama',
  'kullanim_kosullari',
  'on_bilgilendirme',
  'mesafeli_sozlesme',
  'cayma_istisnasi',
  'yz_aktarim',
  'abonelik_sozlesmesi',
  'yillik_taahhutname',
  'yz_ucretsiz_katman',
] as const;
export const ConsentKind = z.enum(consentKinds);
export type ConsentKind = z.infer<typeof ConsentKind>;

/**
 * consents.context jsonb, written by the server (never taken from the client). The text version is the
 * consents.version column and equals the `version` field of the legal text front matter.
 */
export const ConsentContext = z.strictObject({
  /** Product or plan code the consent was given for, for example kredi.300 or ogrenci.yillik. */
  productCode: z.string().max(40).optional(),
  orderId: z.uuid().optional(),
  subscriptionId: z.uuid().optional(),
  /** yz_aktarim and yz_ucretsiz_katman: the provider the user allowed. */
  provider: ByokProvider.optional(),
  /** Where the consent was given. */
  channel: z.enum(['web', 'ios']).optional(),
  /** Evidence of the consent screen, truncated to 200 characters by the writer. */
  userAgent: z.string().max(200).nullable().optional(),
});
export type ConsentContext = z.infer<typeof ConsentContext>;

/**
 * KVKK m.11/1 rights, in the order of the article's sub-paragraphs (a) to (g with breve).
 * `itiraz` is kept from contract v1 and means m.11/1-g (objection to an automated analysis result).
 */
export const kvkkRequestKinds = [
  'islenip_islenmedigi',
  'bilgi',
  'amac',
  'aktarim_bilgisi',
  'duzeltme',
  'silme',
  'ucuncu_kisilere_bildirim',
  'itiraz',
  'zarar_giderimi',
] as const;
export const KvkkRequestKind = z.enum(kvkkRequestKinds);
export type KvkkRequestKind = z.infer<typeof KvkkRequestKind>;

/** Article reference shown in the form and in the reply letter. */
export const kvkkRequestKindArticle: Record<KvkkRequestKind, string> = {
  islenip_islenmedigi: 'KVKK m.11/1-a',
  bilgi: 'KVKK m.11/1-b',
  amac: 'KVKK m.11/1-c',
  aktarim_bilgisi: 'KVKK m.11/1-ç',
  duzeltme: 'KVKK m.11/1-d',
  silme: 'KVKK m.11/1-e',
  ucuncu_kisilere_bildirim: 'KVKK m.11/1-f',
  itiraz: 'KVKK m.11/1-g',
  zarar_giderimi: 'KVKK m.11/1-ğ',
};

export const kvkkRequestStatuses = [
  'dogrulama_bekliyor',
  'alindi',
  'inceleniyor',
  'kabul_edildi',
  'reddedildi',
] as const;
export const KvkkRequestStatus = z.enum(kvkkRequestStatuses);
export type KvkkRequestStatus = z.infer<typeof KvkkRequestStatus>;

/** Relation of the applicant to Kazuist (content/hukuki/tr/basvuru.md form). */
export const kvkkRelations = ['kullanici', 'eski_kullanici', 'karar_metninde_adi_gecen', 'diger'] as const;
export const KvkkRelation = z.enum(kvkkRelations);
export type KvkkRelation = z.infer<typeof KvkkRelation>;

/** KVKK m.13/3: the answer is given in writing or electronically. */
export const kvkkReplyChannels = ['eposta', 'posta'] as const;
export const KvkkReplyChannel = z.enum(kvkkReplyChannels);
export type KvkkReplyChannel = z.infer<typeof KvkkReplyChannel>;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** KVKK m.13/2: concluded at the latest within thirty days. Counted from the date the application arrives. */
export const KVKK_RESPONSE_DAYS = 30;

export function kvkkDueAt(receivedAt: Date): Date {
  return new Date(receivedAt.getTime() + KVKK_RESPONSE_DAYS * DAY_MS);
}

/** Takedown request kinds (content/hukuki/tr/kaldirma.md section 1). */
export const takedownKinds = ['kisisel_veri', 'telif', 'guncellik'] as const;
export const TakedownKind = z.enum(takedownKinds);
export type TakedownKind = z.infer<typeof TakedownKind>;

/** What a takedown request points at. Kampus targets live in the kampus schema. */
export const takedownTargetTypes = ['record', 'kampus_post', 'kampus_file'] as const;
export const TakedownTargetType = z.enum(takedownTargetTypes);
export type TakedownTargetType = z.infer<typeof TakedownTargetType>;

export const takedownStatuses = ['bekliyor', 'gecici_gizlendi', 'sonuclandi'] as const;
export type TakedownStatus = (typeof takedownStatuses)[number];

/** Outcome of a concluded request (kaldirma.md section 3/4). */
export const takedownDecisions = ['kalici_kaldirma', 'ek_maskeleme', 'ret'] as const;
export type TakedownDecision = (typeof takedownDecisions)[number];

/** Plan FR-108 and 6.4/9: the temporary hiding decision is due within 72 hours. */
export const TAKEDOWN_HIDE_HOURS = 72;

/** Deadlines of one takedown request. The thirty day answer applies to personal data requests only. */
export function takedownDeadlines(
  kind: TakedownKind,
  receivedAt: Date,
): { hideDueAt: Date; dueAt: Date | null } {
  return {
    hideDueAt: new Date(receivedAt.getTime() + TAKEDOWN_HIDE_HOURS * HOUR_MS),
    dueAt: kind === 'kisisel_veri' ? kvkkDueAt(receivedAt) : null,
  };
}

/**
 * How a session was opened (sessions.auth_method). Written by the kimlik hooks; the admin panel requires
 * `passkey` (plan 5.6/2).
 */
export const authMethods = ['passkey', 'password', 'email_otp', 'google', 'apple'] as const;
export type AuthMethod = (typeof authMethods)[number];

/** Review queues of the admin panel (plan 10.9) plus the KVKK application queue (ADR-0023). */
export const reviewQueueNames = [
  'anonymization',
  'citations',
  'cards',
  'journal-rules',
  'takedowns',
  'kampus-reports',
  'kvkk-requests',
] as const;
export const ReviewQueueName = z.enum(reviewQueueNames);
export type ReviewQueueName = z.infer<typeof ReviewQueueName>;

/**
 * review_queue.decision values. The first three are editor decisions (AdminQueueDecisionInput);
 * `superseded` is written only by the system when a newer run replaces an open item (anon.run).
 */
export const reviewDecisions = ['onay', 'ret', 'duzelt', 'superseded'] as const;
export type ReviewDecision = (typeof reviewDecisions)[number];
