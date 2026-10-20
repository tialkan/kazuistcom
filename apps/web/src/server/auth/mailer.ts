import nodemailer from 'nodemailer';
import tr from '@kazuist/i18n/tr/hesap.json' with { type: 'json' };

/**
 * Transactional mail sent synchronously from the web process (sign in codes, edu.tr codes).
 * Codes never enter the jobs table (Ek C.3: payload carries ids only). Other notifications go
 * through notify.send jobs in apps/worker-node/src/notify.
 */
export type CodePurpose =
  'sign-in' | 'email-verification' | 'forget-password' | 'change-email' | 'edu' | 'admin-step-up';

export interface Mailer {
  sendCode(to: string, purpose: CodePurpose, code: string): Promise<void>;
}

const subjects: Record<CodePurpose, string> = tr.eposta.konu;

export function codeMail(purpose: CodePurpose, code: string): { subject: string; text: string } {
  return { subject: subjects[purpose], text: tr.eposta.kodMetni.replace('{kod}', code) };
}

/** SMTP mailer; in development MAIL_SMTP_URL points to Mailpit (smtp://localhost:1025). */
export function smtpMailer(url: string, from = '"Kazuist" <bildirim@kazuist.com>'): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async sendCode(to, purpose, code) {
      const m = codeMail(purpose, code);
      await transport.sendMail({ from, to, subject: m.subject, text: m.text });
    },
  };
}

/** Fails loudly when no provider is configured (plan 14.6, wt.149d): never pretends success. */
export const unconfiguredMailer: Mailer = {
  async sendCode() {
    throw new Error('mail provider not configured');
  },
};

export class MemoryMailer implements Mailer {
  readonly sent: { to: string; purpose: CodePurpose; code: string }[] = [];
  async sendCode(to: string, purpose: CodePurpose, code: string) {
    this.sent.push({ to, purpose, code });
  }
  last(to: string, purpose?: CodePurpose) {
    return [...this.sent].reverse().find((m) => m.to === to && (!purpose || m.purpose === purpose));
  }
}
