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
  private seq = 0;
  constructor(private readonly now: () => number = Date.now) {}

  async reserve(input: { userId: string; credits: number; idempotencyKey: string }) {
    const existing = this.byKey.get(input.idempotencyKey);
    if (existing) return { reservationId: existing };
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
  }
  async release(id: string) {
    const r = this.held(id);
    r.state = 'released';
  }
}
