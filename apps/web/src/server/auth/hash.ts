import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

/** Keyed hash used as proof in append only tables after a user is deleted (consents, audit_log). */
export function subjectHash(secret: string, id: string): string {
  return createHmac('sha256', secret).update(`subject:${id}`).digest('hex');
}

export function codeHash(secret: string, scope: string, code: string): string {
  return createHmac('sha256', secret).update(`${scope}:${code}`).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function sixDigitCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
