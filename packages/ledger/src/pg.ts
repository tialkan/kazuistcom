/**
 * PostgreSQL adapter for the ledger engine (tables of packages/db, migration 0001 and 0002).
 * One call = one DB transaction: load the wallet, run the engine, append transactions and entries,
 * project lots and reservations. The database triggers enforce balance and immutability again.
 */
import { ACCOUNTS, Ledger, type LedgerTx, type Lot, type Reservation, type WalletState } from './engine.ts';

/** pg.PoolClient, pg.Client and PGlite fit. Must be a single connection (BEGIN and COMMIT run on it). */
export interface SqlClient {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

const KIND_OF_CODE: Record<string, string> = {
  [ACCOUNTS.deferred]: 'ertelenmis_gelir',
  [ACCOUNTS.promo]: 'promosyon_havuzu',
  [ACCOUNTS.consumption]: 'tuketim',
  [ACCOUNTS.refund]: 'iade',
};

function accountKind(code: string): string {
  if (code.startsWith('cuzdan:')) return 'kullanici_cuzdani';
  if (code.startsWith('rezervasyon:')) return 'rezervasyon';
  const k = KIND_OF_CODE[code];
  if (!k) throw new Error(`unknown account ${code}`);
  return k;
}

export async function ensureWallet(db: SqlClient, userId: string): Promise<string> {
  await db.query('insert into wallets (user_id) values ($1) on conflict (user_id) do nothing', [userId]);
  const { rows } = await db.query<{ id: string }>('select id from wallets where user_id = $1', [userId]);
  return (rows[0] as { id: string }).id;
}

async function accountId(db: SqlClient, code: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(code);
  if (hit) return hit;
  const walletId = code.includes(':') ? code.split(':')[1] : null;
  await db.query(
    'insert into ledger_accounts (kind, wallet_id, code) values ($1::ledger_account_kind, $2, $3) on conflict (code) do nothing',
    [accountKind(code), walletId, code],
  );
  const { rows } = await db.query<{ id: string }>('select id from ledger_accounts where code = $1', [code]);
  const id = (rows[0] as { id: string }).id;
  cache.set(code, id);
  return id;
}

interface EntryRow {
  tx_id: string;
  key: string;
  kind: string;
  code: string;
  side: 'borc' | 'alacak';
  credits: number;
  lot_id: string | null;
  rev: string | null;
}

/** Load the wallet state and the transactions already written for it. */
export async function loadWallet(
  db: SqlClient,
  walletId: string,
): Promise<{ state: WalletState; keys: [string, LedgerTx][] }> {
  const codes = [ACCOUNTS.wallet(walletId), ACCOUNTS.reserve(walletId)];
  const { rows: entries } = await db.query<EntryRow>(
    `select t.id tx_id, t.idempotency_key key, t.kind, t.reverses_transaction_id rev, a.code, e.side, e.credits, e.lot_id
       from ledger_entries e join ledger_accounts a on a.id = e.account_id
       join ledger_transactions t on t.id = e.transaction_id
      where a.code = any($1::text[]) order by e.created_at, e.id`,
    [codes],
  );
  const { rows: lots } = await db.query<{
    id: string;
    source: Lot['source'];
    original_credits: number;
    remaining_credits: number;
    expires_at: Date | null;
    origin_ref: string;
    created_at: Date;
  }>('select * from credit_lots where wallet_id = $1 order by created_at, id', [walletId]);
  const { rows: res } = await db.query<{
    operation_id: string;
    estimated_credits: number;
    actual_credits: number | null;
    status: Reservation['status'];
    expires_at: Date;
  }>('select * from reservations where wallet_id = $1', [walletId]);

  const grantTx = new Map<string, string>();
  const closed = new Map<string, NonNullable<Lot['closedBy']>>();
  const refundedCredits = new Map<string, number>();
  let walletBal = 0;
  const keys = new Map<string, LedgerTx>();
  for (const e of entries) {
    if (e.code === codes[0]) walletBal += e.side === 'alacak' ? e.credits : -e.credits;
    if (e.kind === 'yukleme' && e.lot_id) grantTx.set(e.lot_id, e.tx_id);
    if (e.kind === 'iade' && e.lot_id && e.side === 'borc')
      refundedCredits.set(e.lot_id, (refundedCredits.get(e.lot_id) ?? 0) + e.credits);
    if (e.rev && (e.kind === 'ters_ibraz' || e.kind === 'apple_iade'))
      closed.set(e.rev, e.kind as Lot['closedBy'] & string);
    if (!keys.has(e.key))
      keys.set(e.key, {
        id: e.tx_id,
        kind: e.kind as LedgerTx['kind'],
        idempotencyKey: e.key,
        walletId,
        at: new Date(0),
        entries: [],
        reversesTransactionId: null,
      });
  }
  const stateLots: Lot[] = lots.map((l) => ({
    id: l.id,
    walletId,
    source: l.source,
    originalCredits: l.original_credits,
    remainingCredits: l.remaining_credits,
    expiresAt: l.expires_at ? new Date(l.expires_at) : null,
    originRef: l.origin_ref,
    createdAt: new Date(l.created_at),
    grantTxId: grantTx.get(l.id) ?? '',
    refundedCredits: refundedCredits.get(l.id) ?? 0,
    closedBy:
      closed.get(grantTx.get(l.id) ?? '') ??
      ((refundedCredits.get(l.id) ?? 0) >= l.original_credits ? 'iade' : null),
  }));
  // Index once instead of rescanning the complete history for every reservation (audit D9).
  // The full immutable history is still loaded; checkpointing/pagination is a separate change.
  const allocationsByKey = new Map<string, Reservation['allocations']>();
  for (const entry of entries) {
    if (entry.code !== codes[0] || !entry.lot_id) continue;
    const allocations = allocationsByKey.get(entry.key) ?? [];
    allocations.push({ lotId: entry.lot_id, credits: entry.credits });
    allocationsByKey.set(entry.key, allocations);
  }
  const reservations: Reservation[] = res.map((r) => ({
    operationId: r.operation_id,
    walletId,
    estimatedCredits: r.estimated_credits,
    actualCredits: r.actual_credits,
    status: r.status,
    expiresAt: new Date(r.expires_at),
    allocations: allocationsByKey.get(`rezervasyon:${r.operation_id}`) ?? [],
  }));
  const lotSum = stateLots.reduce((s, l) => s + l.remainingCredits, 0);
  return {
    state: { walletId, lots: stateLots, debt: Math.max(0, lotSum - walletBal), reservations },
    keys: [...keys.entries()],
  };
}

/**
 * Run `fn` against the wallet inside one DB transaction and persist what it produced.
 * Returns fn's result. Any error rolls back.
 */
export async function withWallet<T>(
  db: SqlClient,
  walletId: string,
  fn: (l: Ledger) => T,
  options: { withinTransaction?: boolean } = {},
): Promise<T> {
  if (!options.withinTransaction) await db.query('begin');
  try {
    await db.query('select id from wallets where id = $1 for update', [walletId]);
    const { state, keys } = await loadWallet(db, walletId);
    const ledger = new Ledger();
    ledger.load(state, keys);
    const result = fn(ledger);
    await persist(db, ledger, walletId);
    if (!options.withinTransaction) await db.query('commit');
    return result;
  } catch (err) {
    if (!options.withinTransaction) await db.query('rollback');
    throw err;
  }
}

async function persist(db: SqlClient, ledger: Ledger, walletId: string): Promise<void> {
  const cache = new Map<string, string>();
  const w = ledger.wallet(walletId);
  // Lots first, entries reference them.
  for (const l of w.lots) {
    await db.query(
      `insert into credit_lots (id, wallet_id, source, original_credits, remaining_credits, expires_at, origin_ref, created_at)
       values ($1, $2, $3::lot_source, $4, $5, $6, $7, $8)
       on conflict (id) do update set remaining_credits = excluded.remaining_credits`,
      [
        l.id,
        walletId,
        l.source,
        l.originalCredits,
        l.remainingCredits,
        l.expiresAt,
        l.originRef,
        l.createdAt,
      ],
    );
  }
  for (const tx of ledger.txs) {
    await db.query(
      'insert into ledger_transactions (id, kind, idempotency_key, reverses_transaction_id, created_at, wallet_id) values ($1, $2, $3, $4, $5, $6)',
      [tx.id, tx.kind, tx.idempotencyKey, tx.reversesTransactionId || null, tx.at, walletId],
    );
    for (const e of tx.entries) {
      await db.query(
        `insert into ledger_entries (transaction_id, account_id, side, credits, lot_id, kind, created_at)
         values ($1, $2, $3::entry_side, $4, $5, $6, $7)`,
        [tx.id, await accountId(db, e.accountCode, cache), e.side, e.credits, e.lotId, tx.kind, tx.at],
      );
    }
  }
  for (const r of w.reservations) {
    await db.query(
      `insert into reservations (wallet_id, operation_id, estimated_credits, actual_credits, status, expires_at)
       values ($1, $2, $3, $4, $5::reservation_status, $6)
       on conflict (operation_id) do update set actual_credits = excluded.actual_credits, status = excluded.status,
         expires_at = excluded.expires_at`,
      [walletId, r.operationId, r.estimatedCredits, r.actualCredits, r.status, r.expiresAt],
    );
  }
  const balance = ledger.balance(walletId);
  await db.query('update wallets set balance_snapshot = $2, snapshot_at = now() where id = $1', [
    walletId,
    balance,
  ]);
}

/** Wallet balance straight from the entries (source of truth, 9.1/6). */
export async function walletBalanceFromEntries(db: SqlClient, walletId: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `select coalesce(sum(case when e.side = 'alacak' then e.credits else -e.credits end), 0)::int n
       from ledger_entries e join ledger_accounts a on a.id = e.account_id where a.code = $1`,
    [ACCOUNTS.wallet(walletId)],
  );
  return (rows[0] as { n: number }).n;
}

/** A pool (pg.Pool) hands out a dedicated client per call; PGlite or a single client is used as is. */
export interface PoolLike {
  connect(): Promise<SqlClient & { release(): void }>;
}

export function walletRunner(src: { pool: PoolLike } | { client: SqlClient }) {
  return {
    async run<T>(walletId: string, fn: (l: Ledger) => T): Promise<T> {
      if ('client' in src) return withWallet(src.client, walletId, fn);
      const c = await src.pool.connect();
      try {
        return await withWallet(c, walletId, fn);
      } finally {
        c.release();
      }
    },
  };
}

/** Wallet transactions with their entries, oldest first (ledger_transactions.wallet_id, migration 0003). */
export async function listWalletTransactions(db: SqlClient, walletId: string): Promise<LedgerTx[]> {
  const { rows } = await db.query<{
    id: string;
    kind: LedgerTx['kind'];
    idempotency_key: string;
    reverses_transaction_id: string | null;
    created_at: Date;
    code: string;
    side: 'borc' | 'alacak';
    credits: number;
    lot_id: string | null;
  }>(
    `select t.id, t.kind, t.idempotency_key, t.reverses_transaction_id, t.created_at, a.code, e.side, e.credits, e.lot_id
       from ledger_transactions t join ledger_entries e on e.transaction_id = t.id
       join ledger_accounts a on a.id = e.account_id
      where t.wallet_id = $1 order by t.created_at, t.id, e.id`,
    [walletId],
  );
  const out = new Map<string, LedgerTx>();
  for (const r of rows) {
    let tx = out.get(r.id);
    if (!tx) {
      tx = {
        id: r.id,
        kind: r.kind,
        idempotencyKey: r.idempotency_key,
        walletId,
        at: new Date(r.created_at),
        entries: [],
        reversesTransactionId: r.reverses_transaction_id,
      };
      out.set(r.id, tx);
    }
    tx.entries.push({ accountCode: r.code, side: r.side, credits: r.credits, lotId: r.lot_id });
  }
  return [...out.values()];
}
