import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { purgeAccount } from '../purge.ts';

let pg: PGlite;
const deps = () => ({ db: pg, secret: 'test-secret' });
const one = async <T>(q: string, p: unknown[] = []) => (await pg.query<T>(q, p)).rows[0] as T;

async function user(email: string, deleted = true): Promise<string> {
  const r = await one<{ id: string }>(
    `insert into users (email, name, deleted_at) values ($1, 'Ad Soyad', ${deleted ? 'now()' : 'null'}) returning id`,
    [email],
  );
  await pg.query(`insert into profiles (user_id) values ($1)`, [r.id]);
  await pg.query(
    `insert into sessions (user_id, token, expires_at) values ($1, $2, now() + interval '1 day')`,
    [r.id, `t-${email}`],
  );
  await pg.query(
    `insert into consents (user_id, user_hash, kind, version, granted) values ($1, 'h', 'aydinlatma', 'v1', true)`,
    [r.id],
  );
  return r.id;
}

beforeAll(async () => {
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);
afterAll(async () => {
  await pg.close();
});

describe('account.purge', () => {
  it('deletes the user, keeps consent proof by hash only', async () => {
    const id = await user('sil@example.invalid');
    expect(await purgeAccount(deps(), { userId: id })).toEqual({ status: 'purged' });
    expect((await pg.query('select 1 from users where id = $1', [id])).rows).toHaveLength(0);
    expect((await pg.query('select 1 from sessions where user_id = $1', [id])).rows).toHaveLength(0);
    const c = await one<{ n: number }>(
      `select count(*)::int n from consents where user_id is null and user_hash = 'h'`,
    );
    expect(c.n).toBe(1);
    const a = await one<{ action: string; subject_id: string | null }>(
      `select action, subject_id from audit_log where action = 'user.purged'`,
    );
    expect(a).toEqual({ action: 'user.purged', subject_id: null });
  });

  it('is idempotent and skips a restored account', async () => {
    expect((await purgeAccount(deps(), { userId: '00000000-0000-4000-8000-000000000000' })).status).toBe(
      'skipped',
    );
    const live = await user('kal@example.invalid', false);
    expect(await purgeAccount(deps(), { userId: live })).toEqual({
      status: 'skipped',
      reason: 'not_deleted',
    });
    expect((await pg.query('select 1 from users where id = $1', [live])).rows).toHaveLength(1);
  });

  it('anonymises in place when a kept record still references the user', async () => {
    const id = await user('fatura@example.invalid');
    // review_queue.decided_by references users without ON DELETE; stands in for kept billing rows.
    await pg.query(`insert into review_queue (queue, subject_type, decided_by) values ('cards', 'x', $1)`, [
      id,
    ]);
    expect((await purgeAccount(deps(), { userId: id })).status).toBe('anonymised');
    const u = await one<{ email: string; name: string | null }>(
      'select email, name from users where id = $1',
      [id],
    );
    expect(u.email).toBe(`silindi-${id}@kazuist.invalid`);
    expect(u.name).toBeNull();
    expect((await pg.query('select 1 from profiles where user_id = $1', [id])).rows).toHaveLength(0);
  });

  it('rejects payloads with extra fields', async () => {
    await expect(purgeAccount(deps(), { userId: 'x', email: 'a@b.c' })).rejects.toThrow();
  });
});
