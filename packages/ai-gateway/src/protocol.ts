import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BYOK_NONCE_TTL_SECONDS, byokNonceKey } from '@kazuist/contracts';

/**
 * BYOK client protocol helpers (plan 8.1, ADR-0008). Server side only.
 * Valkey semantics: prepare does SET key value NX EX 600, verify does GETDEL.
 */
export interface NonceStore {
  /** SET key value NX EX ttl; false when the key already exists. */
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /** GETDEL key; null when missing (expired or already used). */
  getDel(key: string): Promise<string | null>;
}

/** In-memory store for tests and local development. */
export class MemoryNonceStore implements NonceStore {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const cur = this.data.get(key);
    if (cur && cur.expiresAt > this.now()) return false;
    this.data.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }
  async getDel(key: string): Promise<string | null> {
    const cur = this.data.get(key);
    this.data.delete(key);
    if (!cur || cur.expiresAt <= this.now()) return null;
    return cur.value;
  }
}

/** Minimal Valkey client shape (ioredis and node-redis both fit with a thin wrapper). */
export interface ValkeyLike {
  set(key: string, value: string, opts: { NX: true; EX: number }): Promise<'OK' | null>;
  getDel(key: string): Promise<string | null>;
}

export function valkeyNonceStore(client: ValkeyLike): NonceStore {
  return {
    async setNx(key, value, ttl) {
      return (await client.set(key, value, { NX: true, EX: ttl })) === 'OK';
    },
    getDel: (key) => client.getDel(key),
  };
}

/**
 * One source of the bundle. `sha256` is the digest of the passage text exactly as the model sees it (masked and
 * neutralised, the body of its <kaynak> block). verify reloads record and chunk from the store, rebuilds that
 * text and compares digests, so it never trusts passage text parsed back out of the prompt.
 */
export interface BundleSource {
  /** Prompt local id, K1..Kn. */
  id: string;
  recordId: string;
  chunkId: string;
  sha256: string;
}

/** Signed prompt bundle payload. */
export interface BundlePayload {
  nonce: string;
  expiresAt: string;
  /** The signed in user the bundle was issued to (the web passes a keyed hash, so Valkey never holds the id). */
  subject: string;
  /** Route the passages were selected for; fixes the passage size used to rebuild them. */
  operation: string;
  provider: string;
  model: string;
  system: string;
  prompt: string;
  sources: BundleSource[];
}

/** 410 Gone: nonce expired or reused; maps to ErrorCode nonce_expired. */
export class NonceGoneError extends Error {
  readonly status = 410;
  readonly code = 'nonce_expired' as const;
  constructor() {
    super('nonce expired or already used');
    this.name = 'NonceGoneError';
  }
}

export class SignatureError extends Error {
  readonly status = 400;
  readonly code = 'bad_request' as const;
  constructor() {
    super('invalid signature');
    this.name = 'SignatureError';
  }
}

/** 403: the bundle was issued to another user. The nonce is burnt all the same. */
export class BundleSubjectError extends Error {
  readonly status = 403;
  readonly code = 'forbidden' as const;
  constructor() {
    super('bundle issued to another user');
    this.name = 'BundleSubjectError';
  }
}

/** 409: a source changed or disappeared since prepare; the lines cannot be checked against what the model saw. */
export class SourceMismatchError extends Error {
  readonly status = 409;
  readonly code = 'conflict' as const;
  constructor() {
    super('bundle sources changed');
    this.name = 'SourceMismatchError';
  }
}

/** Hex SHA-256 of a passage text as the model sees it. */
export function passageDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonical(p: BundlePayload): string {
  return JSON.stringify([
    'kazuist-byok-v2',
    p.nonce,
    p.expiresAt,
    p.subject,
    p.operation,
    p.provider,
    p.model,
    p.system,
    p.prompt,
    p.sources.map((x) => [x.id, x.recordId, x.chunkId, x.sha256]),
  ]);
}

export function signBundle(secret: string, payload: BundlePayload): string {
  return createHmac('sha256', secret).update(canonical(payload)).digest('base64url');
}

function sameSig(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface PrepareInput {
  subject: string;
  operation: string;
  provider: string;
  model: string;
  system: string;
  prompt: string;
  sources: BundleSource[];
}

/** Creates nonce, stores it single use with a 10 minute TTL and signs the bundle. */
export async function prepareBundle(
  store: NonceStore,
  secret: string,
  input: PrepareInput,
  now: Date = new Date(),
): Promise<BundlePayload & { signature: string }> {
  if (!input.subject) throw new Error('bundle needs a subject');
  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + BYOK_NONCE_TTL_SECONDS * 1000).toISOString();
  const payload: BundlePayload = { nonce, expiresAt, ...input };
  const signature = signBundle(secret, payload);
  const stored = await store.setNx(byokNonceKey(nonce), JSON.stringify(payload), BYOK_NONCE_TTL_SECONDS);
  if (!stored) throw new Error('nonce collision');
  return { ...payload, signature };
}

/**
 * Consumes the nonce atomically, checks the signature and the owner. Throws NonceGoneError (410) when the nonce
 * is missing, expired or reused; SignatureError (400) on a bad signature or a payload of an older format;
 * BundleSubjectError (403) when another user presents it.
 */
export async function verifyBundle(
  store: NonceStore,
  secret: string,
  nonce: string,
  signature: string,
  subject: string,
  now: Date = new Date(),
): Promise<BundlePayload> {
  const raw = await store.getDel(byokNonceKey(nonce));
  if (!raw) throw new NonceGoneError();
  let payload: BundlePayload;
  try {
    payload = JSON.parse(raw) as BundlePayload;
  } catch {
    throw new SignatureError();
  }
  if (!Array.isArray(payload.sources) || typeof payload.subject !== 'string') throw new SignatureError();
  if (Date.parse(payload.expiresAt) <= now.getTime()) throw new NonceGoneError();
  if (!sameSig(signBundle(secret, payload), signature)) throw new SignatureError();
  if (!subject || !sameSig(payload.subject, subject)) throw new BundleSubjectError();
  return payload;
}

/**
 * Checks passages rebuilt from the store against the signed sources: same ids in the same order and the same
 * digest of the text the model saw. Throws SourceMismatchError (409) otherwise.
 */
export function assertSourcesMatch(
  sources: readonly BundleSource[],
  rebuilt: readonly { id: string; recordId: string; chunkId: string; text: string }[],
): void {
  if (sources.length !== rebuilt.length) throw new SourceMismatchError();
  sources.forEach((s, i) => {
    const r = rebuilt[i];
    if (
      !r ||
      r.id !== s.id ||
      r.recordId !== s.recordId ||
      r.chunkId !== s.chunkId ||
      !sameSig(passageDigest(r.text), s.sha256)
    )
      throw new SourceMismatchError();
  });
}
