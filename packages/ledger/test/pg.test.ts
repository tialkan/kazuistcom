import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../src/index.ts';
import { ensureWallet, walletBalanceFromEntries, withWallet, type SqlClient } from '../src/pg.ts';

let pg: PGlite;
let db: SqlClient;
let walletId: string;
const t0 = new Date('2026-10-19T10:00:00Z');

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
  db = pg as unknown as SqlClient;
  const { rows } = await pg.query<{ id: string }>(
    "insert into users (email) values ('l@example.invalid') returning id",
  );
  walletId = await ensureWallet(db, (rows[0] as { id: string }).id);
}, 60_000);

afterAll(async () => {
  await pg.close();
});

const n = async (q: string, p: unknown[] = []) =>
  ((await pg.query<{ n: number }>(q, p)).rows[0] as { n: number }).n;

describe('ledger on PGlite with the migration triggers', () => {
  it('writes a grant and a spend over promo and package lots in one transaction each', async () => {
    await withWallet(db, walletId, (l) => {
      l.grant({ key: 'kayit:1', walletId, source: 'promosyon', credits: 50, originRef: 'kayit:1', now: t0 });
      l.grant({
        key: 'iyzico:pay-1',
        walletId,
        source: 'paket',
        credits: 300,
        originRef: 'order:1',
        now: t0,
      });
    });
    await withWallet(db, walletId, (l) => {
      l.reserve({ operationId: 'op-1', walletId, estimatedCredits: 60, now: t0 });
    });
    await withWallet(db, walletId, (l) => {
      l.settle({ walletId, operationId: 'op-1', outcome: 'tamam', actualCredits: 60, now: t0 });
    });
    expect(await walletBalanceFromEntries(db, walletId)).toBe(290);
    expect(
      await n('select sum(remaining_credits)::int n from credit_lots where wallet_id = $1', [walletId]),
    ).toBe(290);
    expect(await n("select remaining_credits n from credit_lots where origin_ref = 'kayit:1'")).toBe(0);
    expect(await n("select count(*)::int n from reservations where status = 'tuketildi'")).toBe(1);
    expect(await n('select balance_snapshot::int n from wallets where id = $1', [walletId])).toBe(290);
  });

  it('is idempotent across DB loads: the same key writes nothing new', async () => {
    const before = await n('select count(*)::int n from ledger_transactions');
    await withWallet(db, walletId, (l) => {
      l.grant({
        key: 'iyzico:pay-1',
        walletId,
        source: 'paket',
        credits: 300,
        originRef: 'order:1',
        now: t0,
      });
      l.reserve({ operationId: 'op-1', walletId, estimatedCredits: 60, now: t0 });
    });
    expect(await n('select count(*)::int n from ledger_transactions')).toBe(before);
  });

  it('rejects a second transaction with the same idempotency key at the DB level', async () => {
    await expect(
      pg.query("insert into ledger_transactions (kind, idempotency_key) values ('yukleme', 'iyzico:pay-1')"),
    ).rejects.toThrow();
  });

  it('keeps entries immutable (trigger)', async () => {
    await expect(pg.query('update ledger_entries set credits = 1')).rejects.toThrow(/append only/);
  });

  it('releases an expired reservation and records the chargeback debt', async () => {
    await withWallet(db, walletId, (l) => {
      l.reserve({ operationId: 'op-2', walletId, estimatedCredits: 10, now: t0 });
    });
    await withWallet(db, walletId, (l) => l.sweepExpired(walletId, addDays(t0, 1)));
    expect(
      await n("select count(*)::int n from reservations where operation_id = 'op-2' and status = 'cozuldu'"),
    ).toBe(1);
    expect(await walletBalanceFromEntries(db, walletId)).toBe(290);
    await withWallet(db, walletId, (l) =>
      l.clawback({ key: 'iyzico:cb-1', walletId, originRef: 'order:1', reason: 'ters_ibraz', now: t0 }),
    );
    expect(await walletBalanceFromEntries(db, walletId)).toBe(-10);
    await expect(
      withWallet(db, walletId, (l) =>
        l.reserve({ operationId: 'op-3', walletId, estimatedCredits: 1, now: t0 }),
      ),
    ).rejects.toThrow('negative_balance');
    await withWallet(db, walletId, (l) =>
      l.grant({
        key: 'iyzico:pay-2',
        walletId,
        source: 'paket',
        credits: 300,
        originRef: 'order:2',
        now: t0,
      }),
    );
    expect(await walletBalanceFromEntries(db, walletId)).toBe(290);
    expect(
      await n('select sum(remaining_credits)::int n from credit_lots where wallet_id = $1', [walletId]),
    ).toBe(290);
  });
});
