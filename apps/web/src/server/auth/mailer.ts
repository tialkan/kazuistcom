import { AsyncLocalStorage } from 'node:async_hooks';
import nodemailer from 'nodemailer';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

/**
 * Transactional mail sent synchronously from the web process (sign in codes, edu.tr codes).
 * Codes never enter the jobs table (Ek C.3: payload carries ids only). Other notifications go
 * through notify.send jobs in apps/worker-node/src/notify.
 */
export type CodePurpose =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email' | 'edu' | 'kvkk-guest';

export interface Mailer {
  /** False when no provider is configured: forms that send a code answer 503 before doing anything. */
  readonly configured: boolean;
  sendCode(to: string, purpose: CodePurpose, code: string): Promise<void>;
}

/** A code could not be handed to the mail provider (none configured, or the provider failed). */
export class MailUnavailableError extends Error {
  override name = 'MailUnavailableError';
}

/**
 * Better Auth catches a failed sendVerificationOTP and answers 200 (runInBackgroundOrAwait), which would make
 * a form look successful without a code. authHandler runs each request in trackMailFailures and answers 503
 * when the send callback called noteMailFailure.
 */
const mailFailures = new AsyncLocalStorage<{ failed: boolean }>();

export function noteMailFailure(): void {
  const s = mailFailures.getStore();
  if (s) s.failed = true;
}

export async function trackMailFailures<T>(fn: () => Promise<T>): Promise<{ value: T; failed: boolean }> {
  const state = { failed: false };
  const value = await mailFailures.run(state, fn);
  return { value, failed: state.failed };
}

const subjects: Record<CodePurpose, string> = tr.eposta.konu;

export function codeMail(purpose: CodePurpose, code: string): { subject: string; text: string } {
  return { subject: subjects[purpose], text: tr.eposta.kodMetni.replace('{kod}', code) };
}

/** SMTP mailer; in development MAIL_SMTP_URL points to Mailpit (smtp://localhost:1025). */
export function smtpMailer(url: string, from = '"Kazuist" <bildirim@kazuist.com>'): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    configured: true,
    async sendCode(to, purpose, code) {
      const m = codeMail(purpose, code);
      try {
        await transport.sendMail({ from, to, subject: m.subject, text: m.text });
      } catch {
        // The provider's error may carry the address; only the class leaves this function.
        throw new MailUnavailableError('mail provider failed');
      }
    },
  };
}

/** Fails loudly when no provider is configured (plan 14.6, wt.149d): never pretends success. */
export const unconfiguredMailer: Mailer = {
  configured: false,
  async sendCode() {
    throw new MailUnavailableError('mail provider not configured');
  },
};

export class MemoryMailer implements Mailer {
  readonly sent: { to: string; purpose: CodePurpose; code: string }[] = [];
  /** Tests switch these to exercise the 503 paths: no provider, or a provider that fails. */
  configured = true;
  failing = false;
  async sendCode(to: string, purpose: CodePurpose, code: string) {
    if (!this.configured || this.failing) throw new MailUnavailableError('memory mailer unavailable');
    this.sent.push({ to, purpose, code });
  }
  last(to: string, purpose?: CodePurpose) {
    return [...this.sent].reverse().find((m) => m.to === to && (!purpose || m.purpose === purpose));
  }
}
