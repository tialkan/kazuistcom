import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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

/** Signed prompt bundle payload. */
export interface BundlePayload {
  nonce: string;
  expiresAt: string;
  provider: string;
  model: string;
  system: string;
  prompt: string;
  sourceIds: string[];
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

function canonical(p: BundlePayload): string {
  return JSON.stringify([p.nonce, p.expiresAt, p.provider, p.model, p.system, p.prompt, p.sourceIds]);
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
  provider: string;
  model: string;
  system: string;
  prompt: string;
  sourceIds: string[];
}

/** Creates nonce, stores it single use with a 10 minute TTL and signs the bundle. */
export async function prepareBundle(
  store: NonceStore,
  secret: string,
  input: PrepareInput,
  now: Date = new Date(),
): Promise<BundlePayload & { signature: string }> {
  const nonce = randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + BYOK_NONCE_TTL_SECONDS * 1000).toISOString();
  const payload: BundlePayload = { nonce, expiresAt, ...input };
  const signature = signBundle(secret, payload);
  const stored = await store.setNx(byokNonceKey(nonce), JSON.stringify(payload), BYOK_NONCE_TTL_SECONDS);
  if (!stored) throw new Error('nonce collision');
  return { ...payload, signature };
}

/**
 * Consumes the nonce atomically and checks the signature. Throws NonceGoneError (410) when the
 * nonce is missing, expired or reused; SignatureError (400) on a bad signature.
 */
export async function verifyBundle(
  store: NonceStore,
  secret: string,
  nonce: string,
  signature: string,
  now: Date = new Date(),
): Promise<BundlePayload> {
  const raw = await store.getDel(byokNonceKey(nonce));
  if (!raw) throw new NonceGoneError();
  const payload = JSON.parse(raw) as BundlePayload;
  if (Date.parse(payload.expiresAt) <= now.getTime()) throw new NonceGoneError();
  if (!sameSig(signBundle(secret, payload), signature)) throw new SignatureError();
  return payload;
}
