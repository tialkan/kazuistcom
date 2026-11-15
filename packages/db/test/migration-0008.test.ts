import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../src/migrate.ts';

/**
 * Migration 0008 (v1.6, ADR-0038) on a populated v1.5 database: edu_claims backfill (oldest verification wins, no
 * row deleted), the claim trigger for every writer of edu_verifications, and the new protocol_status value.
 */
let pg: PGlite;
let folder: string;
const users: Record<string, string> = {};
const one = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows[0] as T;
const rows = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows;

const T1 = '2026-01-10T10:00:00Z';
const T2 = '2026-02-10T10:00:00Z';
const T3 = '2026-03-10T10:00:00Z';

async function user(name: string) {
  users[name] = (
    await one<{ id: string }>('insert into users (email) values ($1) returning id', [
      `${name}@example.invalid`,
    ])
  ).id;
  return users[name];
}
async function verification(userId: string, email: string, verifiedAt: string | null) {
  return (
    await one<{ id: string }>(
      `insert into edu_verifications (user_id, email, code_hash, expires_at, verified_at)
       values ($1, $2, 'h', now(), $3) returning id`,
      [userId, email, verifiedAt],
    )
  ).id;
}
const claims = () =>
  rows<{ email: string; user_id: string; verified_at: Date }>(
    'select email, user_id, verified_at from edu_claims order by email',
  );
/** Error of a statement as {code, constraint, message}; undefined when it succeeds. */
async function failure(q: string, v: unknown[] = []) {
  try {
    await pg.query(q, v);
    return undefined;
  } catch (e) {
    const err = e as { code?: string; constraint?: string; message: string };
    return { code: err.code, constraint: err.constraint, message: err.message };
  }
}

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'kazuist-v16-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const path = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(path, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0008');
  writeFileSync(path, JSON.stringify(journal));
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: folder });
  // A populated v1.5 database. ali: an old un-normalised verification and a renewal on the same account; bora
  // verified the same mailbox later on a second account (the gap the request closes); cem never confirmed;
  // deniz holds a mailbox alone.
  const ali = await user('ali');
  const bora = await user('bora');
  const cem = await user('cem');
  const deniz = await user('deniz');
  await verification(ali, ' Ali+Tez@Ogr.Ornek.EDU.TR. ', T1);
  await verification(ali, 'ali@ogr.ornek.edu.tr', T3);
  await verification(bora, 'ali@ogr.ornek.edu.tr', T2);
  await verification(cem, 'cem@ornek.edu.tr', null);
  await verification(deniz, 'deniz@ornek.edu.tr', T1);
  await migrate(drizzle(pg), { migrationsFolder });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);

afterAll(async () => {
  await pg.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('migration 0008 on a populated v1.5 database', () => {
  it('normalises a mailbox like kimlik normalizeEduEmail', async () => {
    const got = await one<{ a: string; b: string; c: string }>(
      `select edu_mailbox(' Ali+Tez@Ogr.Ornek.EDU.TR. ') a, edu_mailbox('ali@ornek.edu.tr') b,
              edu_mailbox('TEKIL+2@Ogr.Tekil.edu.tr') c`,
    );
    expect(got).toEqual({ a: 'ali@ogr.ornek.edu.tr', b: 'ali@ornek.edu.tr', c: 'tekil@ogr.tekil.edu.tr' });
  });

  it('backfills one claim per mailbox: the oldest verification wins, with its newest date; no row changes', async () => {
    const got = await claims();
    expect(got.map((c) => [c.email, c.user_id, c.verified_at.toISOString()])).toEqual([
      ['ali@ogr.ornek.edu.tr', users.ali, new Date(T3).toISOString()],
      ['deniz@ornek.edu.tr', users.deniz, new Date(T1).toISOString()],
    ]);
    const bora = await rows<{ email: string; verified_at: Date }>(
      'select email, verified_at from edu_verifications where user_id = $1',
      [users.bora],
    );
    expect(bora.map((r) => [r.email, r.verified_at.toISOString()])).toEqual([
      ['ali@ogr.ornek.edu.tr', new Date(T2).toISOString()],
    ]);
    expect((await one<{ n: number }>('select count(*)::int n from edu_verifications')).n).toBe(5);
    // The report query of ADR-0038: accounts whose verified mailbox an older account claimed (ids only).
    const report = await rows<{ user_id: string; claimed_by: string }>(
      `select distinct v.user_id, c.user_id as claimed_by
       from edu_verifications v join edu_claims c on c.email = edu_mailbox(v.email) and c.user_id <> v.user_id
       where v.verified_at is not null`,
    );
    expect(report).toEqual([{ user_id: users.bora, claimed_by: users.ali }]);
  });

  it('refuses a verification of a claimed mailbox on another account, for any writer, without the address', async () => {
    const eda = await user('eda');
    const row = await verification(eda, 'ALI+x@ogr.ornek.edu.tr', null);
    const err = await failure('update edu_verifications set verified_at = now() where id = $1', [row]);
    expect(err).toMatchObject({ code: '23505', constraint: 'edu_claims_pkey' });
    expect(err?.message).not.toMatch(/ali|ornek/i);
    expect(
      (await one<{ v: Date | null }>('select verified_at v from edu_verifications where id = $1', [row])).v,
    ).toBeNull();
    const direct = await failure(
      `insert into edu_verifications (user_id, email, code_hash, expires_at, verified_at)
       values ($1, 'ali@ogr.ornek.edu.tr', 'h', now(), now())`,
      [eda],
    );
    expect(direct).toMatchObject({ code: '23505', constraint: 'edu_claims_pkey' });
  });

  it('lets the owner renew and keeps the newest date; an attempts update on any row does not touch claims', async () => {
    const renewal = await verification(users.ali as string, 'ali@ogr.ornek.edu.tr', null);
    await pg.query("update edu_verifications set verified_at = '2026-04-10T10:00:00Z' where id = $1", [
      renewal,
    ]);
    const ali = (await claims()).find((c) => c.user_id === users.ali);
    expect(ali?.verified_at.toISOString()).toBe('2026-04-10T10:00:00.000Z');
    // The kept row of the second account is not re-checked by an update of other columns.
    await pg.query('update edu_verifications set attempts = attempts + 1 where user_id = $1', [users.bora]);
  });

  it('releases a claim only with the last verified row of its owner, then the mailbox is free', async () => {
    const fen = await user('fen');
    const first = await verification(fen, 'fen@ornek.edu.tr', T1);
    const second = await verification(fen, 'Fen+2@ornek.edu.tr', T2);
    await pg.query('delete from edu_verifications where id = $1', [second]);
    const kept = (await claims()).find((c) => c.email === 'fen@ornek.edu.tr');
    expect([kept?.user_id, kept?.verified_at.toISOString()]).toEqual([fen, new Date(T1).toISOString()]);
    await pg.query('update edu_verifications set verified_at = null where id = $1', [first]);
    expect((await claims()).some((c) => c.email === 'fen@ornek.edu.tr')).toBe(false);
    const gul = await user('gul');
    await verification(gul, 'fen@ornek.edu.tr', T3);
    expect((await claims()).find((c) => c.email === 'fen@ornek.edu.tr')?.user_id).toBe(gul);
  });

  it('drops the claim with the account (purge deletes the rows, a users delete cascades to them)', async () => {
    await pg.query('delete from edu_verifications where user_id = $1', [users.deniz]);
    expect((await claims()).some((c) => c.email === 'deniz@ornek.edu.tr')).toBe(false);
    const hale = await user('hale');
    await verification(hale, 'hale@ornek.edu.tr', T1);
    await pg.query('delete from users where id = $1', [hale]);
    expect((await claims()).some((c) => c.email === 'hale@ornek.edu.tr')).toBe(false);
  });

  it('stores only normalised mailboxes and has no users foreign key', async () => {
    const err = await failure(
      "insert into edu_claims (email, user_id, verified_at) values ('Ali@Ornek.edu.tr', gen_random_uuid(), now())",
    );
    expect(err).toMatchObject({ code: '23514', constraint: 'edu_claims_mailbox' });
    const fks = await one<{ n: number }>(
      "select count(*)::int n from pg_constraint where conrelid = 'edu_claims'::regclass and contype = 'f'",
    );
    expect(fks.n).toBe(0);
  });

  it("adds protocol_status 'gerekli_yapilmadi' after the existing values", async () => {
    const values = await rows<{ v: string }>('select unnest(enum_range(null::protocol_status))::text v');
    expect(values.map((r) => r.v)).toEqual([
      'gerekmez',
      'basvuruldu',
      'imzalandi',
      'reddedildi',
      'canli_federasyon',
      'gerekli_yapilmadi',
    ]);
    const rec = await one<{ protocol_status: string }>(
      `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text,
                            protocol_status)
       values ('karar', 'Ornek', 'emsal', 'Resmi karar', 'https://example.invalid/y', 'v16:y', now(), 'metin',
               'gerekli_yapilmadi')
       returning protocol_status`,
    );
    expect(rec.protocol_status).toBe('gerekli_yapilmadi');
  });
});
