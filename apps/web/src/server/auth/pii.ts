import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM for personal fields that must be stored but never shown in clear (identity numbers of KVKK
 * applications). Key: PII_ENCRYPTION_KEY, 32 bytes base64. Output: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
function key(b64: string | undefined): Buffer {
  const k = b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0);
  if (k.length !== 32) throw new Error('PII key missing or not 32 bytes');
  return k;
}

export function encryptPii(keyB64: string | undefined, plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(keyB64), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv, c.getAuthTag(), ct]
    .map((x) => (typeof x === 'string' ? x : x.toString('base64url')))
    .join('.');
}

export function decryptPii(keyB64: string | undefined, enc: string): string {
  const [v, iv, tag, ct] = enc.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('bad envelope');
  const d = createDecipheriv('aes-256-gcm', key(keyB64), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** T.C. kimlik numarasi: 11 digits, first not 0, two check digits (official algorithm). */
export function isValidTckn(s: string): boolean {
  if (!/^[1-9][0-9]{10}$/.test(s)) return false;
  const d = [...s].map(Number) as number[];
  const at = (i: number) => d[i] ?? 0;
  const odd = at(0) + at(2) + at(4) + at(6) + at(8);
  const even = at(1) + at(3) + at(5) + at(7);
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== at(9)) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === at(10);
}
