import { prepareCheckoutDocuments } from './legal-checkout.ts';
/**
 * Process wide billing service. Production: Postgres store and ledger over DATABASE_URL, iyzico sandbox
 * from IYZICO_* variables (live keys are refused by HttpIyzico), fake e-Arsiv until the integrator is chosen.
 * Missing iyzico variables leave the service unavailable (503), never a silent fake.
 */
import { randomUUID } from 'node:crypto';
import { PRICE_TABLE_V1 } from '@kazuist/ledger';
import pg from 'pg';
import { subjectHash } from '../auth/hash.ts';
import { UnconfiguredEArsiv, type ConsentVersions } from '@kazuist/ledger/billing';
import { hukukiMetin, kazuistOrtami, type Ortam } from '@/app/(kabuk)/_hukuki/yukle';
import { HttpIyzico, IYZICO_SANDBOX_BASE_URL } from '@kazuist/ledger/billing';
import { PgBillingStore, PgLedgerPort } from '@kazuist/ledger/billing';
import { BillingService } from '@kazuist/ledger/billing';

let current: BillingService | null | undefined;

/** Published versions of the payment texts in content/hukuki (consents.version must match, O5). */
export function consentVersionsFromContent(ortam: Ortam = kazuistOrtami()): ConsentVersions | null {
  // In production only a published text (status yayinda) can be accepted (D-N4); drafts elsewhere.
  const v = (slug: string) => {
    const m = hukukiMetin('tr', slug);
    if (!m) return null;
    return ortam === 'production' && m.fm.status !== 'yayinda' ? null : (m.fm.version ?? null);
  };
  const on_bilgilendirme = v('on-bilgilendirme');
  const mesafeli_sozlesme = v('mesafeli-satis');
  const abonelik_sozlesmesi = v('abonelik');
  if (!on_bilgilendirme || !mesafeli_sozlesme || !abonelik_sozlesmesi) return null;
  return { on_bilgilendirme, mesafeli_sozlesme, abonelik_sozlesmesi };
}
let catalogReady: Promise<void> | undefined;

export class BillingUnavailable extends Error {
  override name = 'BillingUnavailable';
}

export async function getBillingService(
  env: Record<string, string | undefined> = process.env,
): Promise<BillingService> {
  if (current === undefined) {
    const {
      DATABASE_URL,
      IYZICO_API_KEY,
      IYZICO_SECRET_KEY,
      IYZICO_MERCHANT_ID,
      BETTER_AUTH_SECRET,
      BETTER_AUTH_URL,
    } = env;
    // Empty strings count as missing (D2); the merchant id is needed to verify subscription webhooks.
    const versions = consentVersionsFromContent();
    if (
      !DATABASE_URL ||
      !IYZICO_API_KEY ||
      !IYZICO_SECRET_KEY ||
      !IYZICO_MERCHANT_ID ||
      !BETTER_AUTH_SECRET ||
      !BETTER_AUTH_URL ||
      !versions
    )
      current = null;
    else {
      const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
      const store = new PgBillingStore(pool, (id) => subjectHash(BETTER_AUTH_SECRET, id));
      catalogReady = store.ensureCatalog(PRICE_TABLE_V1);
      current = new BillingService({
        iyzico: new HttpIyzico({
          apiKey: IYZICO_API_KEY,
          secretKey: IYZICO_SECRET_KEY,
          merchantId: IYZICO_MERCHANT_ID,
          baseUrl: env.IYZICO_BASE_URL || IYZICO_SANDBOX_BASE_URL,
        }),
        iyzicoCfg: { secretKey: IYZICO_SECRET_KEY, merchantId: IYZICO_MERCHANT_ID },
        // No integrator yet: invoices are raised as fatura_bekliyor alerts, never invented (D5).
        earsiv: new UnconfiguredEArsiv(),
        consentVersions: versions,
        prepareLegalDocuments: prepareCheckoutDocuments,
        store,
        ledger: new PgLedgerPort(pool, pool),
        now: () => new Date(),
        newId: randomUUID,
        callbackBaseUrl: BETTER_AUTH_URL,
        webAddress: BETTER_AUTH_URL,
      });
    }
  }
  if (!current) throw new BillingUnavailable();
  await catalogReady;
  return current;
}

/** Tests replace the process service. */
export function setBillingService(s: BillingService | undefined): void {
  current = s;
  catalogReady = undefined;
}
