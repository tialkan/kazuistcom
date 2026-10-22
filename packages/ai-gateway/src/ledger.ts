/**
 * Credit reservation interface (plan 4.5/2). The real ledger is packages/ledger (odeme agent);
 * this package only depends on the interface. Reservations expire after 5 minutes.
 */
export interface LedgerReservations {
  reserve(input: {
    userId: string;
    credits: number;
    idempotencyKey: string;
  }): Promise<{ reservationId: string }>;
  consume(reservationId: string, credits: number): Promise<void>;
  release(reservationId: string): Promise<void>;
}

/**
 * Typed reserve failures shared with packages/ledger (audit Y7). The real adapter throws LedgerError
 * with the same `code` values; the gateway reads `code` structurally.
 */
export const reservationErrorCodes = ['insufficient_credits', 'negative_balance', 'already_settled'] as const;
export type ReservationErrorCode = (typeof reservationErrorCodes)[number];

export class ReservationError extends Error {
  constructor(readonly code: ReservationErrorCode) {
    super(`reservation failed: ${code}`);
    this.name = 'ReservationError';
  }
}

export function reservationErrorCode(e: unknown): ReservationErrorCode | null {
  const code = e && typeof e === 'object' ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' && (reservationErrorCodes as readonly string[]).includes(code)
    ? (code as ReservationErrorCode)
    : null;
}

export const RESERVATION_TTL_MS = 5 * 60 * 1000;

export interface CostEvent {
  requestId: string;
  operation: string;
  provider: string;
  model: string;
  mode: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costTl: number;
  creditsCharged: number;
  reservationId: string | null;
  at: string;
}

type Res = {
  userId: string;
  credits: number;
  state: 'held' | 'consumed' | 'released';
  at: number;
  charged: number;
};

/** In-memory fake for tests; mirrors the odeme agent's contract. */
export class FakeLedger implements LedgerReservations {
  readonly reservations = new Map<string, Res>();
  private readonly byKey = new Map<string, string>();
  private readonly balances = new Map<string, number>();
  private seq = 0;
  /** defaultBalance: spendable credits of a user without an explicit balance. */
  constructor(
    private readonly now: () => number = Date.now,
    private readonly defaultBalance = Number.POSITIVE_INFINITY,
  ) {}

  setBalance(userId: string, credits: number): void {
    this.balances.set(userId, credits);
  }
  private available(userId: string): number {
    let held = 0;
    for (const r of this.reservations.values())
      if (r.userId === userId && r.state === 'held') held += r.credits;
    return (this.balances.get(userId) ?? this.defaultBalance) - held;
  }

  async reserve(input: { userId: string; credits: number; idempotencyKey: string }) {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) {
      // Same key: an open reservation is returned again, a settled one never runs free.
      if (this.reservations.get(existing)?.state === 'held') return { reservationId: existing };
      throw new ReservationError('already_settled');
    }
    if (this.available(input.userId) < input.credits) throw new ReservationError('insufficient_credits');
    const reservationId = `r${++this.seq}`;
    this.reservations.set(reservationId, {
      userId: input.userId,
      credits: input.credits,
      state: 'held',
      at: this.now(),
      charged: 0,
    });
    this.byKey.set(input.idempotencyKey, reservationId);
    return { reservationId };
  }
  private held(id: string): Res {
    const r = this.reservations.get(id);
    if (!r || r.state !== 'held') throw new Error('reservation not held');
    if (this.now() - r.at > RESERVATION_TTL_MS) {
      r.state = 'released';
      throw new Error('reservation expired');
    }
    return r;
  }
  async consume(id: string, credits: number) {
    const r = this.held(id);
    if (!Number.isInteger(credits) || credits < 0 || credits > r.credits) throw new Error('bad amount');
    r.charged = credits;
    r.state = 'consumed';
    const bal = this.balances.get(r.userId);
    if (bal !== undefined) this.balances.set(r.userId, bal - credits);
  }
  async release(id: string) {
    const r = this.held(id);
    r.state = 'released';
  }
}
