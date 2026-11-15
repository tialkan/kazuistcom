import type { ByokProvider } from '@kazuist/contracts';
import { PLATFORM_PROVIDER_ORDER } from './routing.ts';

/** Counter store; production uses Valkey INCRBY with day keys, tests use memory. */
export interface CounterStore {
  get(key: string): Promise<number>;
  incrBy(key: string, by: number, ttlSeconds: number): Promise<number>;
}

export class MemoryCounterStore implements CounterStore {
  private readonly data = new Map<string, number>();
  async get(key: string): Promise<number> {
    return this.data.get(key) ?? 0;
  }
  async incrBy(key: string, by: number): Promise<number> {
    const v = (this.data.get(key) ?? 0) + by;
    this.data.set(key, v);
    return v;
  }
}

export interface BudgetConfig {
  userDailyCredits: number;
  ipDailyFreeUses: number;
  /** Credits spent on platform calls from one IP per day; bounds many accounts spending promo credits. */
  ipDailyCredits: number;
  maxConcurrentStreamsPerUser: number;
  /** Platform spend per day (TL); every platform call stops at it, BYOK does not. */
  platformDailyTlCap: number;
}

/**
 * plan 8.7 defaults; IP limits and the TL cap are operator settings. The IP credit ceiling is six users at their
 * daily cap, so a shared campus address is not blocked by a few heavy users.
 */
export const DEFAULT_BUDGET: BudgetConfig = {
  userDailyCredits: 500,
  ipDailyFreeUses: 10,
  ipDailyCredits: 3_000,
  maxConcurrentStreamsPerUser: 2,
  platformDailyTlCap: 1_000,
};

export type BudgetDenial =
  | 'kullanici_gunluk_tavan'
  | 'ip_ucretsiz_tavan'
  | 'ip_kredi_tavan'
  | 'eszamanli_akis'
  | 'platform_tavan_ucretsiz_durdu'
  | 'platform_tavan_kredili_durdu';

export class BudgetError extends Error {
  readonly status = 429;
  readonly code = 'rate_limited' as const;
  constructor(readonly reason: BudgetDenial) {
    super(`budget denied: ${reason}`);
    this.name = 'BudgetError';
  }
}

const DAY = 86_400;
const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

export interface AdmitInput {
  userHash: string;
  ipHash: string;
  /**
   * The platform pays the provider: the free allowance and every credit call (promo or bought credits alike,
   * the ledger does not tell them apart at admission). BYOK calls are false and only hold a stream slot.
   */
  platform: boolean;
  /** Credits the call reserves; counted only on platform calls. */
  credits: number;
  /** Free allowance use (not paid credits); counted only on platform calls. */
  free: boolean;
}

export interface Admission {
  release(): void;
  /** Undo the counted usage and release the slot, for a request that never ran (audit Y7). */
  rollback(): Promise<void>;
}

export class BudgetGuard {
  private readonly streams = new Map<string, number>();
  constructor(
    private readonly store: CounterStore,
    private readonly cfg: BudgetConfig = DEFAULT_BUDGET,
    private readonly now: () => Date = () => new Date(),
    private readonly onAlert: (kind: 'platform_tavan') => void = () => undefined,
  ) {}

  /**
   * Checks all limits, counts usage and holds one stream slot until release. Every limit is checked before
   * anything is counted, so a refused call leaves no counter behind.
   */
  async admit(input: AdmitInput): Promise<Admission> {
    const d = dayKey(this.now());
    const active = this.streams.get(input.userHash) ?? 0;
    if (active >= this.cfg.maxConcurrentStreamsPerUser) throw new BudgetError('eszamanli_akis');
    // Reserve the slot synchronously so concurrent admits cannot both pass.
    this.streams.set(input.userHash, active + 1);
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      const n = (this.streams.get(input.userHash) ?? 1) - 1;
      if (n <= 0) this.streams.delete(input.userHash);
      else this.streams.set(input.userHash, n);
    };
    const free = input.platform && input.free;
    const credits = input.platform ? Math.max(0, input.credits) : 0;
    const ipFreeKey = `free:ip:${input.ipHash}:${d}`;
    const ipCreditKey = `credits:ip:${input.ipHash}:${d}`;
    const userKey = `credits:user:${input.userHash}:${d}`;
    try {
      if (input.platform && (await this.store.get(`spend:tl:${d}`)) >= this.cfg.platformDailyTlCap) {
        this.onAlert('platform_tavan');
        throw new BudgetError(free ? 'platform_tavan_ucretsiz_durdu' : 'platform_tavan_kredili_durdu');
      }
      if (free && (await this.store.get(ipFreeKey)) >= this.cfg.ipDailyFreeUses)
        throw new BudgetError('ip_ucretsiz_tavan');
      if (credits > 0 && (await this.store.get(ipCreditKey)) + credits > this.cfg.ipDailyCredits)
        throw new BudgetError('ip_kredi_tavan');
      if ((await this.store.get(userKey)) + credits > this.cfg.userDailyCredits)
        throw new BudgetError('kullanici_gunluk_tavan');
      if (free) await this.store.incrBy(ipFreeKey, 1, DAY);
      if (credits > 0) {
        await this.store.incrBy(ipCreditKey, credits, DAY);
        await this.store.incrBy(userKey, credits, DAY);
      }
      const rollback = async (): Promise<void> => {
        release();
        if (credits > 0) {
          await this.store.incrBy(userKey, -credits, DAY);
          await this.store.incrBy(ipCreditKey, -credits, DAY);
        }
        if (free) await this.store.incrBy(ipFreeKey, -1, DAY);
      };
      return { release, rollback };
    } catch (e) {
      release();
      throw e;
    }
  }

  /** Adds realised platform spend in kuruş-precision TL. */
  async recordSpendTl(tl: number): Promise<void> {
    await this.store.incrBy(`spend:tl:${dayKey(this.now())}`, tl, DAY);
  }
}

/** Provider kill switch and fallback order (plan 8.7/3). */
export class ProviderSwitch {
  private readonly disabled = new Set<ByokProvider>();
  /** Default order per ADR-0025: OpenRouter, then Anthropic direct. */
  constructor(private readonly order: ByokProvider[] = [...PLATFORM_PROVIDER_ORDER]) {}
  disable(p: ByokProvider): void {
    this.disabled.add(p);
  }
  enable(p: ByokProvider): void {
    this.disabled.delete(p);
  }
  isEnabled(p: ByokProvider): boolean {
    return !this.disabled.has(p);
  }
  /** Platform mode providers in preference order, kill-switched ones removed. */
  candidates(): ByokProvider[] {
    return this.order.filter((p) => !this.disabled.has(p));
  }
}
