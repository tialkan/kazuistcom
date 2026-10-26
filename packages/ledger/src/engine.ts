/**
 * Credit ledger engine (plan 9.1, 4.5), pure TypeScript and deterministic.
 *
 * Accounts (codes; the DB adapter maps them to ledger_accounts rows):
 *   cuzdan:<walletId>      kullanici_cuzdani  user balance (credit normal)
 *   rezervasyon:<walletId> rezervasyon        credits held for a running operation
 *   ertelenmis_gelir       ertelenmis_gelir   source of paid credits (package, subscription, IAP)
 *   promosyon_havuzu       promosyon_havuzu   source and sink of promotional credits
 *   tuketim                tuketim            consumed credits
 *   iade                   iade               refunded or clawed back credits
 *
 * Rules: entries are append only, every transaction balances, one idempotency key yields exactly one
 * transaction, and the wallet balance can go below zero only through a chargeback or an Apple refund.
 */
export type EntrySide = 'borc' | 'alacak';
export type LotSource = 'promosyon' | 'abonelik' | 'paket' | 'iap';
export type TxKind =
  | 'yukleme'
  | 'rezervasyon'
  | 'rezervasyon_tuketim'
  | 'rezervasyon_cozum'
  | 'iade'
  | 'ters_ibraz'
  | 'apple_iade'
  | 'son_kullanma';

export interface Entry {
  accountCode: string;
  side: EntrySide;
  credits: number;
  lotId: string | null;
}

export interface LedgerTx {
  id: string;
  kind: TxKind;
  idempotencyKey: string;
  walletId: string;
  at: Date;
  entries: Entry[];
  reversesTransactionId: string | null;
}

export interface Lot {
  id: string;
  walletId: string;
  source: LotSource;
  originalCredits: number;
  remainingCredits: number;
  /** Credits already reversed by partial refunds, derived from immutable ledger entries on reload. */
  refundedCredits?: number;
  expiresAt: Date | null;
  originRef: string;
  createdAt: Date;
  grantTxId: string;
  /** Set once the lot is refunded or clawed back; such a lot is never reversed again. */
  closedBy: 'iade' | 'ters_ibraz' | 'apple_iade' | null;
}

export type ReservationStatus = 'acik' | 'tuketildi' | 'cozuldu';
export interface Reservation {
  operationId: string;
  walletId: string;
  estimatedCredits: number;
  actualCredits: number | null;
  status: ReservationStatus;
  expiresAt: Date;
  allocations: { lotId: string; credits: number }[];
}

export interface WalletState {
  walletId: string;
  lots: Lot[];
  /** Credits owed after a clawback; absorbed by the next grants. */
  debt: number;
  reservations: Reservation[];
}

export const RESERVATION_TTL_MS = 5 * 60 * 1000;
/** A refund hold lasts until the refund is settled; an administrator resolves unknown outcomes in 3 work days. */
export const REFUND_HOLD_TTL_MS = 30 * 86_400_000;
export const PROMO_TTL_DAYS = 90;
const DAY_MS = 86_400_000;

export const ACCOUNTS = {
  wallet: (walletId: string) => `cuzdan:${walletId}`,
  reserve: (walletId: string) => `rezervasyon:${walletId}`,
  deferred: 'ertelenmis_gelir',
  promo: 'promosyon_havuzu',
  consumption: 'tuketim',
  refund: 'iade',
} as const;

export class LedgerError extends Error {
  constructor(
    public readonly code:
      | 'insufficient_credits'
      | 'negative_balance'
      | 'invalid_amount'
      | 'reservation_not_open'
      | 'reservation_expired'
      | 'lot_not_found'
      | 'refund_not_allowed'
      | 'duplicate_origin'
      | 'already_settled',
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LedgerError';
  }
}

export type IdGen = () => string;

export interface LedgerOptions {
  newId?: IdGen;
}

/** Order of consumption (4.5/1): promo nearest expiry first, then subscription, then package and IAP; FIFO. */
export function consumptionOrder(lots: readonly Lot[], now: Date): Lot[] {
  const rank = (l: Lot) => (l.source === 'promosyon' ? 0 : l.source === 'abonelik' ? 1 : 2);
  return lots
    .filter((l) => l.remainingCredits > 0 && (l.expiresAt === null || l.expiresAt.getTime() > now.getTime()))
    .slice()
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (a.source === 'promosyon' && b.source === 'promosyon') {
        const e = (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0);
        if (e !== 0) return e;
      }
      const c = a.createdAt.getTime() - b.createdAt.getTime();
      return c !== 0 ? c : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function isBalanced(entries: readonly Pick<Entry, 'side' | 'credits'>[]): boolean {
  if (entries.length < 2) return false;
  let sum = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.credits) || e.credits <= 0) return false;
    sum += e.side === 'borc' ? e.credits : -e.credits;
  }
  return sum === 0;
}

function assertAmount(n: number): void {
  if (!Number.isInteger(n) || n <= 0) throw new LedgerError('invalid_amount');
}

/**
 * In memory ledger over many wallets. The DB adapter loads one wallet into it, runs an operation and
 * persists the produced transaction and the changed lots and reservation.
 */
export class Ledger {
  readonly txs: LedgerTx[] = [];
  private readonly byKey = new Map<string, LedgerTx>();
  private readonly wallets = new Map<string, WalletState>();
  private readonly newId: IdGen;

  constructor(opts: LedgerOptions = {}) {
    this.newId = opts.newId ?? (() => crypto.randomUUID());
  }

  /** Load a wallet state (from the DB) and the keys already used, so replays stay idempotent. */
  load(state: WalletState, usedKeys: Iterable<[string, LedgerTx]> = []): void {
    this.wallets.set(state.walletId, state);
    for (const [k, tx] of usedKeys) this.byKey.set(k, tx);
  }

  /** Isolated copy for the in-memory transaction adapter; production uses the PostgreSQL transaction. */
  fork(): Ledger {
    const copy = new Ledger({ newId: this.newId });
    copy.restoreFrom(this);
    return copy;
  }
  restoreFrom(source: Ledger): void {
    this.wallets.clear();
    for (const [id, state] of source.wallets) this.wallets.set(id, structuredClone(state));
    this.byKey.clear();
    for (const [key, tx] of source.byKey) this.byKey.set(key, structuredClone(tx));
    this.txs.splice(0, this.txs.length, ...structuredClone(source.txs));
  }

  wallet(walletId: string): WalletState {
    let w = this.wallets.get(walletId);
    if (!w) {
      w = { walletId, lots: [], debt: 0, reservations: [] };
      this.wallets.set(walletId, w);
    }
    return w;
  }

  /** Spendable balance: lots minus debt. Reserved credits are excluded. Can be negative only after clawback. */
  balance(walletId: string, now?: Date): number {
    const w = this.wallet(walletId);
    const live = now ? consumptionOrder(w.lots, now) : w.lots;
    return live.reduce((s, l) => s + l.remainingCredits, 0) - w.debt;
  }

  reserved(walletId: string): number {
    return this.wallet(walletId)
      .reservations.filter((r) => r.status === 'acik')
      .reduce((s, r) => s + r.estimatedCredits, 0);
  }

  /** Balance of an account computed from entries (credit normal for the wallet). */
  accountBalance(code: string): number {
    let s = 0;
    for (const tx of this.txs)
      for (const e of tx.entries)
        if (e.accountCode === code) s += e.side === 'alacak' ? e.credits : -e.credits;
    return s;
  }

  findByKey(key: string): LedgerTx | undefined {
    return this.byKey.get(key);
  }

  private commit(
    kind: TxKind,
    key: string,
    walletId: string,
    at: Date,
    entries: Entry[],
    reverses: string | null = null,
  ): LedgerTx {
    if (!isBalanced(entries)) throw new Error('unbalanced transaction');
    const tx: LedgerTx = {
      id: this.newId(),
      kind,
      idempotencyKey: key,
      walletId,
      at,
      entries,
      reversesTransactionId: reverses,
    };
    this.txs.push(tx);
    this.byKey.set(key, tx);
    return tx;
  }

  /**
   * Grant credits as a new lot. Promotional lots expire in 90 days. Outstanding debt is absorbed first.
   * Idempotent on `key`; `originRef` (order, iyzico payment, coupon redemption) is unique too.
   */
  grant(p: {
    key: string;
    walletId: string;
    source: LotSource;
    credits: number;
    originRef: string;
    now: Date;
    expiresAt?: Date;
  }): LedgerTx {
    const prev = this.byKey.get(p.key);
    if (prev) return prev;
    assertAmount(p.credits);
    const w = this.wallet(p.walletId);
    if (w.lots.some((l) => l.originRef === p.originRef)) throw new LedgerError('duplicate_origin');
    const expiresAt =
      p.source === 'promosyon' ? (p.expiresAt ?? new Date(p.now.getTime() + PROMO_TTL_DAYS * DAY_MS)) : null;
    const lotId = this.newId();
    const src = p.source === 'promosyon' ? ACCOUNTS.promo : ACCOUNTS.deferred;
    const tx = this.commit('yukleme', p.key, p.walletId, p.now, [
      { accountCode: src, side: 'borc', credits: p.credits, lotId },
      { accountCode: ACCOUNTS.wallet(p.walletId), side: 'alacak', credits: p.credits, lotId },
    ]);
    const absorbed = Math.min(w.debt, p.credits);
    w.debt -= absorbed;
    w.lots.push({
      id: lotId,
      walletId: p.walletId,
      source: p.source,
      originalCredits: p.credits,
      remainingCredits: p.credits - absorbed,
      expiresAt,
      originRef: p.originRef,
      createdAt: p.now,
      grantTxId: tx.id,
      closedBy: null,
    });
    return tx;
  }

  private isExpired(l: Lot, now: Date): boolean {
    return l.source === 'promosyon' && !!l.expiresAt && l.expiresAt.getTime() <= now.getTime();
  }

  /** Expire promotional lots past their date (4.1/4); also credits that came back to an expired lot (D7). */
  expirePromos(walletId: string, now: Date): LedgerTx[] {
    const w = this.wallet(walletId);
    const out: LedgerTx[] = [];
    for (const l of w.lots) {
      if (!this.isExpired(l, now) || l.remainingCredits <= 0) continue;
      const first = `son_kullanma:${l.id}`;
      const key = this.byKey.has(first) ? `${first}:${now.toISOString()}` : first;
      if (this.byKey.has(key)) continue;
      const n = l.remainingCredits;
      l.remainingCredits = 0;
      out.push(
        this.commit('son_kullanma', key, walletId, now, [
          { accountCode: ACCOUNTS.wallet(walletId), side: 'borc', credits: n, lotId: l.id },
          { accountCode: ACCOUNTS.promo, side: 'alacak', credits: n, lotId: l.id },
        ]),
      );
    }
    return out;
  }

  private holdEntries(walletId: string, allocations: Reservation['allocations']): Entry[] {
    const entries: Entry[] = [];
    for (const a of allocations) {
      entries.push({
        accountCode: ACCOUNTS.wallet(walletId),
        side: 'borc',
        credits: a.credits,
        lotId: a.lotId,
      });
      entries.push({
        accountCode: ACCOUNTS.reserve(walletId),
        side: 'alacak',
        credits: a.credits,
        lotId: a.lotId,
      });
    }
    return entries;
  }

  private existing(walletId: string, operationId: string): Reservation | undefined {
    const r = this.wallet(walletId).reservations.find((x) => x.operationId === operationId);
    // Same key again: an open reservation is returned, a settled one never runs a second time (Y7).
    if (r && r.status !== 'acik') throw new LedgerError('already_settled');
    return r;
  }

  /**
   * Hold the estimated credits for 5 minutes (4.5/2). Expired holds are released first (O1). A negative or
   * insufficient balance blocks new AI work with a typed error.
   */
  reserve(p: { operationId: string; walletId: string; estimatedCredits: number; now: Date }): Reservation {
    const w = this.wallet(p.walletId);
    this.sweepExpired(p.walletId, p.now);
    const existing = this.existing(p.walletId, p.operationId);
    if (existing) return existing;
    assertAmount(p.estimatedCredits);
    this.expirePromos(p.walletId, p.now);
    if (w.debt > 0) throw new LedgerError('negative_balance');
    if (this.balance(p.walletId, p.now) < p.estimatedCredits) throw new LedgerError('insufficient_credits');
    let left = p.estimatedCredits;
    const allocations: Reservation['allocations'] = [];
    for (const l of consumptionOrder(w.lots, p.now)) {
      if (left === 0) break;
      const take = Math.min(l.remainingCredits, left);
      l.remainingCredits -= take;
      left -= take;
      allocations.push({ lotId: l.id, credits: take });
    }
    this.commit(
      'rezervasyon',
      `rezervasyon:${p.operationId}`,
      p.walletId,
      p.now,
      this.holdEntries(p.walletId, allocations),
    );
    const r: Reservation = {
      operationId: p.operationId,
      walletId: p.walletId,
      estimatedCredits: p.estimatedCredits,
      actualCredits: null,
      status: 'acik',
      expiresAt: new Date(p.now.getTime() + RESERVATION_TTL_MS),
      allocations,
    };
    w.reservations.push(r);
    return r;
  }

  /**
   * Hold a whole, untouched paid lot before its refund goes to the provider (Y3): the credits cannot be
   * spent meanwhile; refundHeld finishes the refund, settle(teknik_hata) gives them back.
   */
  holdLot(p: {
    operationId: string;
    walletId: string;
    originRef: string;
    now: Date;
    ttlMs?: number;
  }): Reservation {
    return this.holdPaidLot(p, false);
  }

  /** Account-deletion approval: only an unreserved, unused remainder of a paid package. */
  holdUnusedPackageCredits(p: {
    operationId: string;
    walletId: string;
    originRef: string;
    now: Date;
    ttlMs?: number;
  }): Reservation {
    return this.holdPaidLot(p, true);
  }
  private holdPaidLot(
    p: { operationId: string; walletId: string; originRef: string; now: Date; ttlMs?: number },
    partialPackage: boolean,
  ): Reservation {
    const w = this.wallet(p.walletId);
    const existing = this.existing(p.walletId, p.operationId);
    if (existing) return existing;
    const lot = w.lots.find((l) => l.originRef === p.originRef);
    if (!lot) throw new LedgerError('lot_not_found');
    if (
      lot.closedBy ||
      lot.remainingCredits <= 0 ||
      (partialPackage
        ? lot.source !== 'paket' ||
          w.reservations.some((r) => r.status === 'acik' && r.allocations.some((a) => a.lotId === lot.id))
        : lot.source === 'promosyon' || lot.remainingCredits !== lot.originalCredits)
    )
      throw new LedgerError('refund_not_allowed');
    const allocations = [{ lotId: lot.id, credits: lot.remainingCredits }];
    lot.remainingCredits = 0;
    this.commit(
      'rezervasyon',
      `rezervasyon:${p.operationId}`,
      p.walletId,
      p.now,
      this.holdEntries(p.walletId, allocations),
    );
    const r: Reservation = {
      operationId: p.operationId,
      walletId: p.walletId,
      estimatedCredits: allocations[0]?.credits ?? 0,
      actualCredits: null,
      status: 'acik',
      // Refund holds outlive the provider call and an unknown outcome (D-N5, O-N1).
      expiresAt: new Date(p.now.getTime() + (p.ttlMs ?? REFUND_HOLD_TTL_MS)),
      allocations,
    };
    w.reservations.push(r);
    return r;
  }

  /** Move the expiry of an open reservation (a refund hold whose outcome is unknown, D-N6). */
  extendReservation(walletId: string, operationId: string, expiresAt: Date): Reservation {
    const r = this.wallet(walletId).reservations.find((x) => x.operationId === operationId);
    if (!r || r.status !== 'acik') throw new LedgerError('reservation_not_open');
    if (expiresAt.getTime() > r.expiresAt.getTime()) r.expiresAt = expiresAt;
    return r;
  }

  /** Finish a refund held by holdLot: the held credits go to the refund account as a reversal of the grant. */
  refundHeld(p: { walletId: string; operationId: string; now: Date }): LedgerTx {
    const w = this.wallet(p.walletId);
    const r = w.reservations.find((x) => x.operationId === p.operationId);
    const prev = this.byKey.get(`rezervasyon_sonu:${p.operationId}`);
    if (r && r.status === 'tuketildi' && prev) return prev;
    if (!r || r.status !== 'acik') throw new LedgerError('reservation_not_open');
    const lot = w.lots.find((l) => l.id === r.allocations[0]?.lotId);
    const entries: Entry[] = [];
    for (const a of r.allocations) {
      entries.push({
        accountCode: ACCOUNTS.reserve(p.walletId),
        side: 'borc',
        credits: a.credits,
        lotId: a.lotId,
      });
      entries.push({ accountCode: ACCOUNTS.refund, side: 'alacak', credits: a.credits, lotId: a.lotId });
    }
    const tx = this.commit(
      'iade',
      `rezervasyon_sonu:${p.operationId}`,
      p.walletId,
      p.now,
      entries,
      lot?.grantTxId ?? null,
    );
    r.status = 'tuketildi';
    r.actualCredits = r.estimatedCredits;
    if (lot) {
      lot.refundedCredits = (lot.refundedCredits ?? 0) + r.estimatedCredits;
      if (lot.refundedCredits >= lot.originalCredits) lot.closedBy = 'iade';
    }
    return tx;
  }

  private openReservation(walletId: string, operationId: string): Reservation {
    const r = this.wallet(walletId).reservations.find((x) => x.operationId === operationId);
    if (!r) throw new LedgerError('reservation_not_open');
    return r;
  }

  /** Give back credits to their lots; credits that return to an expired promo lot expire at once (D7). */
  private giveBack(walletId: string, lotId: string, credits: number): void {
    const lot = this.wallet(walletId).lots.find((l) => l.id === lotId);
    if (lot) lot.remainingCredits += credits;
  }

  /**
   * Settle a reservation. outcome 'tamam' charges min(actual, estimate) in consumption order of the held
   * allocations and releases the rest; 'cekimser' and 'teknik_hata' charge nothing (4.5/3). A reservation
   * past its 5 minutes is released instead and comes back with status 'cozuldu' (the release is committed,
   * O1); callers that wanted to charge treat that as reservation_expired.
   */
  settle(p: {
    walletId: string;
    operationId: string;
    outcome: 'tamam' | 'cekimser' | 'teknik_hata';
    actualCredits?: number;
    now: Date;
  }): Reservation {
    const r = this.openReservation(p.walletId, p.operationId);
    if (r.status !== 'acik') return r;
    if (p.now.getTime() > r.expiresAt.getTime()) {
      this.release(r, p.now);
      return r;
    }
    const charge =
      p.outcome === 'tamam'
        ? Math.min(Math.max(0, p.actualCredits ?? r.estimatedCredits), r.estimatedCredits)
        : 0;
    if (!Number.isInteger(charge)) throw new LedgerError('invalid_amount');
    const entries: Entry[] = [];
    let left = charge;
    for (const a of r.allocations) {
      const take = Math.min(a.credits, left);
      left -= take;
      const back = a.credits - take;
      if (take > 0) {
        entries.push({
          accountCode: ACCOUNTS.reserve(p.walletId),
          side: 'borc',
          credits: take,
          lotId: a.lotId,
        });
        entries.push({ accountCode: ACCOUNTS.consumption, side: 'alacak', credits: take, lotId: a.lotId });
      }
      if (back > 0) {
        entries.push({
          accountCode: ACCOUNTS.reserve(p.walletId),
          side: 'borc',
          credits: back,
          lotId: a.lotId,
        });
        entries.push({
          accountCode: ACCOUNTS.wallet(p.walletId),
          side: 'alacak',
          credits: back,
          lotId: a.lotId,
        });
        this.giveBack(p.walletId, a.lotId, back);
      }
    }
    this.commit(
      charge > 0 ? 'rezervasyon_tuketim' : 'rezervasyon_cozum',
      `rezervasyon_sonu:${p.operationId}`,
      p.walletId,
      p.now,
      entries,
    );
    r.status = charge > 0 ? 'tuketildi' : 'cozuldu';
    r.actualCredits = charge;
    this.expirePromos(p.walletId, p.now);
    return r;
  }

  private release(r: Reservation, now: Date): void {
    const entries: Entry[] = [];
    for (const a of r.allocations) {
      entries.push({
        accountCode: ACCOUNTS.reserve(r.walletId),
        side: 'borc',
        credits: a.credits,
        lotId: a.lotId,
      });
      entries.push({
        accountCode: ACCOUNTS.wallet(r.walletId),
        side: 'alacak',
        credits: a.credits,
        lotId: a.lotId,
      });
      this.giveBack(r.walletId, a.lotId, a.credits);
    }
    this.commit('rezervasyon_cozum', `rezervasyon_sonu:${r.operationId}`, r.walletId, now, entries);
    r.status = 'cozuldu';
    r.actualCredits = 0;
    this.expirePromos(r.walletId, now);
  }

  /** Release every open reservation older than 5 minutes. */
  sweepExpired(walletId: string, now: Date): Reservation[] {
    const out: Reservation[] = [];
    for (const r of this.wallet(walletId).reservations) {
      if (r.status === 'acik' && r.expiresAt.getTime() <= now.getTime()) {
        this.release(r, now);
        out.push(r);
      }
    }
    return out;
  }

  /** Reverse an untouched lot (14 day package refund, 4.5/4). Callers check the 14 day window. */
  refundUnusedLot(p: { key: string; walletId: string; originRef: string; now: Date }): LedgerTx {
    const prev = this.byKey.get(p.key);
    if (prev) return prev;
    const lot = this.wallet(p.walletId).lots.find((l) => l.originRef === p.originRef);
    if (!lot) throw new LedgerError('lot_not_found');
    if (lot.remainingCredits !== lot.originalCredits || lot.source === 'promosyon' || lot.closedBy)
      throw new LedgerError('refund_not_allowed');
    const n = lot.remainingCredits;
    lot.remainingCredits = 0;
    lot.closedBy = 'iade';
    return this.commit(
      'iade',
      p.key,
      p.walletId,
      p.now,
      [
        { accountCode: ACCOUNTS.wallet(p.walletId), side: 'borc', credits: n, lotId: lot.id },
        { accountCode: ACCOUNTS.refund, side: 'alacak', credits: n, lotId: lot.id },
      ],
      lot.grantTxId,
    );
  }

  /**
   * Claw back all credits of a lot after a chargeback or an Apple refund (4.5/11). Credits already spent
   * become debt, so the balance may go below zero; this is the only path to a negative balance. A lot that
   * was already refunded or clawed back is not touched again (O3): returns null.
   */
  clawback(p: {
    key: string;
    walletId: string;
    originRef: string;
    reason: 'ters_ibraz' | 'apple_iade';
    now: Date;
  }): LedgerTx | null {
    const prev = this.byKey.get(p.key);
    if (prev) return prev;
    const w = this.wallet(p.walletId);
    const lot = w.lots.find((l) => l.originRef === p.originRef);
    if (!lot) throw new LedgerError('lot_not_found');
    if (lot.closedBy) return null;
    const fromLot = lot.remainingCredits;
    const owed = Math.max(0, lot.originalCredits - fromLot - (lot.refundedCredits ?? 0));
    const entries: Entry[] = [];
    if (fromLot > 0) {
      entries.push({
        accountCode: ACCOUNTS.wallet(p.walletId),
        side: 'borc',
        credits: fromLot,
        lotId: lot.id,
      });
      entries.push({ accountCode: ACCOUNTS.refund, side: 'alacak', credits: fromLot, lotId: lot.id });
    }
    if (owed > 0) {
      entries.push({ accountCode: ACCOUNTS.wallet(p.walletId), side: 'borc', credits: owed, lotId: null });
      entries.push({ accountCode: ACCOUNTS.refund, side: 'alacak', credits: owed, lotId: null });
    }
    lot.remainingCredits = 0;
    lot.closedBy = p.reason;
    // Debt is first covered by remaining credits in other lots, in consumption order.
    let debt = owed;
    const covering: Entry[] = [];
    for (const l of consumptionOrder(w.lots, p.now)) {
      if (debt === 0) break;
      const take = Math.min(l.remainingCredits, debt);
      l.remainingCredits -= take;
      debt -= take;
      // Move the cover from the lot to the unallocated (debt) line; both on the wallet account, net zero.
      covering.push({ accountCode: ACCOUNTS.wallet(p.walletId), side: 'borc', credits: take, lotId: l.id });
      covering.push({ accountCode: ACCOUNTS.wallet(p.walletId), side: 'alacak', credits: take, lotId: null });
    }
    w.debt += debt;
    return this.commit(p.reason, p.key, p.walletId, p.now, [...entries, ...covering], lot.grantTxId);
  }
}
