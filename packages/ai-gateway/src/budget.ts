import type { ByokProvider } from '@kazuist/contracts';

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
  maxConcurrentStreamsPerUser: number;
  platformDailyTlCap: number;
}

/** plan 8.7 defaults; IP free limit and TL cap are operator settings. */
export const DEFAULT_BUDGET: BudgetConfig = {
  userDailyCredits: 500,
  ipDailyFreeUses: 10,
  maxConcurrentStreamsPerUser: 2,
  platformDailyTlCap: 1_000,
};

export type BudgetDenial =
  'kullanici_gunluk_tavan' | 'ip_ucretsiz_tavan' | 'eszamanli_akis' | 'platform_tavan_ucretsiz_durdu';

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
  credits: number;
  /** Free allowance use (not paid credits). */
  free: boolean;
}

export interface Admission {
  release(): void;
}

export class BudgetGuard {
  private readonly streams = new Map<string, number>();
  constructor(
    private readonly store: CounterStore,
    private readonly cfg: BudgetConfig = DEFAULT_BUDGET,
    private readonly now: () => Date = () => new Date(),
    private readonly onAlert: (kind: 'platform_tavan') => void = () => undefined,
  ) {}

  /** Checks all limits, counts usage and holds one stream slot until release. */
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
    try {
      if (input.free) {
        if ((await this.store.get(`spend:tl:${d}`)) >= this.cfg.platformDailyTlCap) {
          this.onAlert('platform_tavan');
          throw new BudgetError('platform_tavan_ucretsiz_durdu');
        }
        const ipKey = `free:ip:${input.ipHash}:${d}`;
        if ((await this.store.get(ipKey)) >= this.cfg.ipDailyFreeUses)
          throw new BudgetError('ip_ucretsiz_tavan');
        await this.store.incrBy(ipKey, 1, DAY);
      }
      const userKey = `credits:user:${input.userHash}:${d}`;
      if ((await this.store.get(userKey)) + input.credits > this.cfg.userDailyCredits)
        throw new BudgetError('kullanici_gunluk_tavan');
      await this.store.incrBy(userKey, input.credits, DAY);
      return { release };
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
  constructor(private readonly order: ByokProvider[] = ['anthropic', 'openrouter']) {}
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
