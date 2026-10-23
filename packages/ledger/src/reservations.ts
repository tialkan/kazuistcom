/**
 * Implements the LedgerReservations interface of packages/ai-gateway (src/ledger.ts) on top of the
 * engine. Structural typing keeps this package free of an ai-gateway dependency.
 * reservationId = "<walletId>|<idempotencyKey>", so any process can settle it after a DB reload.
 */
import { Ledger, LedgerError } from './engine.ts';

export interface WalletRunner {
  run<T>(walletId: string, fn: (l: Ledger) => T): Promise<T>;
}

/** In memory runner over one Ledger (tests); the DB runner is (w, fn) => withWallet(db, w, fn). */
export const memoryRunner = (l: Ledger): WalletRunner => ({ run: async (_w, fn) => fn(l) });

export class LedgerReservationsAdapter {
  constructor(
    private readonly runner: WalletRunner,
    private readonly walletOf: (userId: string) => Promise<string> | string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private split(id: string): [string, string] {
    const i = id.indexOf('|');
    if (i < 0) throw new LedgerError('reservation_not_open');
    return [id.slice(0, i), id.slice(i + 1)];
  }

  async reserve(input: { userId: string; credits: number; idempotencyKey: string }) {
    const walletId = await this.walletOf(input.userId);
    await this.runner.run(walletId, (l) =>
      l.reserve({
        operationId: input.idempotencyKey,
        walletId,
        estimatedCredits: input.credits,
        now: this.now(),
      }),
    );
    return { reservationId: `${walletId}|${input.idempotencyKey}` };
  }

  /** Charge the actual credits (0 means abstention: nothing is charged, 4.5/3). */
  async consume(reservationId: string, credits: number): Promise<void> {
    const [walletId, operationId] = this.split(reservationId);
    const r = await this.runner.run(walletId, (l) => {
      // A second run sharing one open reservation is refused at its consume (Y7 residual): one charge,
      // one result. Release stays tolerant because it is the clean up path.
      const open = l.wallet(walletId).reservations.find((x) => x.operationId === operationId);
      if (open && open.status !== 'acik') throw new LedgerError('already_settled');
      return l.settle({
        walletId,
        operationId,
        outcome: credits > 0 ? 'tamam' : 'cekimser',
        actualCredits: credits,
        now: this.now(),
      });
    });
    // Past 5 minutes the hold was released (and that release is committed, O1): nothing was charged.
    if (credits > 0 && r.status === 'cozuldu' && r.actualCredits === 0)
      throw new LedgerError('reservation_expired');
  }

  /** Technical error or cancel: release without charge. */
  async release(reservationId: string): Promise<void> {
    const [walletId, operationId] = this.split(reservationId);
    await this.runner.run(walletId, (l) =>
      l.settle({ walletId, operationId, outcome: 'teknik_hata', now: this.now() }),
    );
  }
}
