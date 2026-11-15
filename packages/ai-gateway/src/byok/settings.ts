import type { ReasoningEffort } from '../types.ts';

/**
 * BYOK key settings in the browser (plan 8.3, FR-84, K-08). The key lives only in Web Storage on the user's
 * device: sessionStorage by default (gone when the tab closes), localStorage only when the user opts in to
 * "remember on this device". Nothing in this module talks to a server, logs or reports the key.
 */
export const BYOK_STORAGE_ITEM = 'kazuist.byok.v1';

/** oturum: sessionStorage (default); cihaz: localStorage after an explicit opt in. */
export type ByokPersistence = 'oturum' | 'cihaz';

/** Providers the browser client supports today; OpenRouter first (K-08), the CSP allows only its origin. */
export const BYOK_CLIENT_PROVIDERS = ['openrouter'] as const;
export type ByokClientProvider = (typeof BYOK_CLIENT_PROVIDERS)[number];

export interface ByokSettings {
  provider: ByokClientProvider;
  model: string;
  apiKey: string;
  /** plan 8.4/3 "gizlilik öncelikli": OpenRouter zero data retention endpoints only (provider.zdr). */
  zdr: boolean;
  persistence: ByokPersistence;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ByokStorages {
  session: StorageLike | null;
  local: StorageLike | null;
}

export interface ByokModel {
  id: string;
  name: string;
  /** Sent as OpenRouter reasoning.effort so reasoning cannot eat the whole output budget. */
  reasoningEffort?: ReasoningEffort;
}

/**
 * Suggested OpenRouter models (plan 8.6 "hızlı sınıf"). IDs, names and reasoning metadata checked against
 * https://openrouter.ai/api/v1/models on 2026-11-15:
 * - Claude Haiku 5.5: reasoning optional and only on request, so nothing is sent (the platform default model).
 * - GPT-5.6 Luna: reasoning on by default, effort "none" supported.
 * - Gemini 3.8 Flash: reasoning mandatory, lowest supported effort "low".
 */
export const OPENROUTER_BYOK_MODELS: readonly ByokModel[] = [
  { id: 'anthropic/claude-haiku-5.5', name: 'Claude Haiku 5.5' },
  { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', reasoningEffort: 'none' },
  { id: 'google/gemini-3.8-flash', name: 'Gemini 3.8 Flash', reasoningEffort: 'low' },
];

export const DEFAULT_BYOK_MODEL = 'anthropic/claude-haiku-5.5';

/** OpenRouter model ID shape (author/slug, optional :variant); PrepareRequest caps it at 120 characters. */
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function isValidModelId(id: string): boolean {
  return id.length <= 120 && MODEL_ID.test(id);
}

/** OpenRouter free variants end in ":free"; their limits and provider terms differ (FR-84 free tier warning). */
export function isFreeModel(id: string): boolean {
  return id.trim().toLowerCase().endsWith(':free');
}

export function reasoningEffortFor(id: string): ReasoningEffort | undefined {
  return OPENROUTER_BYOK_MODELS.find((m) => m.id === id)?.reasoningEffort;
}

export type KeyProblem = 'bos' | 'bicim';

/** Shape check only; whether the key works is up to the provider. The contract caps keys at 400 characters. */
export function keyProblem(raw: string): KeyProblem | null {
  const key = raw.trim();
  if (!key) return 'bos';
  if (key.length < 20 || key.length > 400 || /\s/.test(key)) return 'bicim';
  return null;
}

/** Shows the user which key is stored without showing the key: first 6 and last 4 characters. */
export function maskKey(key: string): string {
  return key.length <= 12 ? '…' : `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function parse(raw: string | null, persistence: ByokPersistence): ByokSettings | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.v !== 1 || o.provider !== 'openrouter') return null;
  if (typeof o.model !== 'string' || !isValidModelId(o.model)) return null;
  if (typeof o.apiKey !== 'string' || keyProblem(o.apiKey)) return null;
  return { provider: 'openrouter', model: o.model, apiKey: o.apiKey, zdr: o.zdr === true, persistence };
}

const tryGet = (s: StorageLike | null): string | null => {
  try {
    return s?.getItem(BYOK_STORAGE_ITEM) ?? null;
  } catch {
    return null;
  }
};

const tryRemove = (s: StorageLike | null): void => {
  try {
    s?.removeItem(BYOK_STORAGE_ITEM);
  } catch {
    // Storage blocked: nothing to remove.
  }
};

/** Session storage wins over local storage, so a tab level choice overrides the remembered one. */
export function readByokSettings(st: ByokStorages): ByokSettings | null {
  return parse(tryGet(st.session), 'oturum') ?? parse(tryGet(st.local), 'cihaz');
}

/**
 * Stores the settings in exactly one place and removes them from the other, so switching from "remember" back
 * to "this session" leaves no copy in localStorage. Returns false when the browser refuses storage.
 */
export function saveByokSettings(st: ByokStorages, s: ByokSettings): boolean {
  const target = s.persistence === 'cihaz' ? st.local : st.session;
  const other = s.persistence === 'cihaz' ? st.session : st.local;
  if (!target || keyProblem(s.apiKey) || !isValidModelId(s.model)) return false;
  try {
    target.setItem(
      BYOK_STORAGE_ITEM,
      JSON.stringify({ v: 1, provider: s.provider, model: s.model, apiKey: s.apiKey.trim(), zdr: s.zdr }),
    );
  } catch {
    return false;
  }
  tryRemove(other);
  return true;
}

/** Removes the key from both storages. */
export function clearByokSettings(st: ByokStorages): void {
  tryRemove(st.session);
  tryRemove(st.local);
}

/** The page's Web Storage; either one may be blocked (private mode, storage disabled), then it is null. */
export function browserStorages(): ByokStorages {
  const pick = (name: 'sessionStorage' | 'localStorage'): StorageLike | null => {
    try {
      const g = globalThis as unknown as Partial<Record<typeof name, StorageLike>>;
      return g[name] ?? null;
    } catch {
      return null;
    }
  };
  return { session: pick('sessionStorage'), local: pick('localStorage') };
}
