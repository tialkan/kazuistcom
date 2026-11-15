import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { vector } from '@electric-sql/pglite-pgvector';
import { migrationsFolder } from '@kazuist/db';
import { and, eq } from 'drizzle-orm';
import { drizzle as drizzleNode } from 'drizzle-orm/node-postgres';
import { migrate as migrateNode } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, type Db } from '../db.ts';
import { confirmEduVerification, isEduClaimConflict, startEduVerification } from '../edu.ts';
import { MemoryMailer } from '../mailer.ts';

/**
 * One account per edu.tr mailbox through edu_claims and its trigger (v1.6, ADR-0038, migration 0008). Always on
 * PGlite; with KAZUIST_IT_DATABASE_URL set the same cases run on that PostgreSQL server too, plus a real race
 * between two connections. The server database must be disposable: migrations are applied to it. Every case uses
 * fresh users and mailboxes, so a server database can be reused between runs.
 */

interface Backend {
  name: string;
  open(): Promise<{
    db: Db;
    sql(q: string, p?: unknown[]): Promise<unknown[]>;
    close(): Promise<void>;
    pool?: pg.Pool;
  }>;
}

const backends: Backend[] = [
  {
    name: 'pglite',
    async open() {
      const p = await PGlite.create({ extensions: { vector, pg_trgm } });
      const raw = drizzle(p, { schema });
      await migrate(raw, { migrationsFolder });
      return {
        db: raw as unknown as Db,
        sql: async (q, params = []) => (await p.query(q, params)).rows,
        close: () => p.close(),
      };
    },
  },
];
const serverUrl = process.env.KAZUIST_IT_DATABASE_URL;
if (serverUrl) {
  backends.push({
    name: 'postgres',
    async open() {
      const pool = new pg.Pool({ connectionString: serverUrl, max: 6 });
      const raw = drizzleNode(pool, { schema });
      await migrateNode(raw, { migrationsFolder });
      return {
        db: raw as unknown as Db,
        sql: async (q, params = []) => (await pool.query(q, params)).rows,
        close: () => pool.end(),
        pool,
      };
    },
  });
}

const SECRET = 'test-secret-only-for-edu-claims-0123456789';

describe.each(backends)('edu_claims on $name', (backend) => {
  let db: Db;
  let sql: (q: string, p?: unknown[]) => Promise<unknown[]>;
  let close: () => Promise<void>;
  let pool: pg.Pool | undefined;
  const mailer = new MemoryMailer();
  const now = () => new Date();

  beforeAll(async () => {
    ({ db, sql, close, pool } = await backend.open());
  }, 120_000);
  afterAll(async () => {
    await close();
  });

  async function user(): Promise<string> {
    const [row] = await db
      .insert(schema.users)
      .values({ email: `edu-${randomUUID()}@example.invalid`, emailVerified: true })
      .returning({ id: schema.users.id });
    return row?.id as string;
  }
  const mailbox = () => `ogr${randomUUID().slice(0, 8)}@ogr.ornek.edu.tr`;
  const lastCode = (to: string) => mailer.last(to, 'edu')?.code ?? '';
  const claimOf = async (email: string) =>
    (await db.select().from(schema.eduClaims).where(eq(schema.eduClaims.email, email)))[0];
  const hasStudentRole = async (userId: string) =>
    (
      await db
        .select()
        .from(schema.userRoles)
        .where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.roleId, 'ogrenci_dogrulanmis')))
    ).length > 0;
  const audits = async (userId: string, action: string) =>
    (
      await db
        .select()
        .from(schema.auditLog)
        .where(and(eq(schema.auditLog.subjectId, userId), eq(schema.auditLog.action, action)))
    ).length;

  /** A verified row written straight into edu_verifications, as an admin tool or a script would. */
  const verifiedRow = (userId: string, email: string) =>
    db.insert(schema.eduVerifications).values({
      userId,
      email,
      codeHash: 'x',
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
    });

  it('confirming writes the claim through the trigger; the owner renews on the same account', async () => {
    const a = await user();
    const box = mailbox();
    expect(await startEduVerification(db, mailer, SECRET, a, box, now())).toBe('sent');
    expect(await confirmEduVerification(db, SECRET, a, lastCode(box), now())).toBe('verified');
    const first = await claimOf(box);
    expect(first?.userId).toBe(a);
    expect(await hasStudentRole(a)).toBe(true);

    // Yearly renewal: the owner's claim is kept and moved to the newer verification.
    expect(await startEduVerification(db, mailer, SECRET, a, box.toUpperCase(), now())).toBe('sent');
    expect(await confirmEduVerification(db, SECRET, a, lastCode(box), now())).toBe('verified');
    const renewed = await claimOf(box);
    expect(renewed?.userId).toBe(a);
    expect(renewed?.verifiedAt.getTime() ?? 0).toBeGreaterThanOrEqual(
      first?.verifiedAt.getTime() ?? Infinity,
    );
  });

  it('reads the claim from edu_claims: a back filled claim without a row of the caller blocks the code', async () => {
    const owner = await user();
    const other = await user();
    const box = mailbox();
    // As the migration back fill left it: a claim whose verification row is under another, older address form.
    await db.insert(schema.eduClaims).values({ email: box, userId: owner, verifiedAt: new Date() });
    const sent = mailer.sent.length;
    const [local, domain] = box.split('@');
    expect(
      await startEduVerification(
        db,
        mailer,
        SECRET,
        other,
        ` ${local}+tez@${domain?.toUpperCase()}. `,
        now(),
      ),
    ).toBe('taken');
    expect(mailer.sent.length).toBe(sent);
    expect(await audits(other, 'edu.taken')).toBe(1);
    expect(await startEduVerification(db, mailer, SECRET, owner, box, now())).toBe('sent');
  });

  it('maps 23505 on edu_claims_pkey from the trigger to taken and rolls the role and profile back', async () => {
    const a = await user();
    const b = await user();
    const box = mailbox();
    expect(await startEduVerification(db, mailer, SECRET, a, box, now())).toBe('sent');
    // Another writer verifies the mailbox for b after a's check and before a's update: a test trigger inserts b's
    // verified row in the same statement, so only the edu_verifications_claim trigger can refuse a.
    const fn = `edu_race_${randomUUID().replace(/-/g, '')}`;
    await sql(
      `create function ${fn}() returns trigger language plpgsql as $$
       begin
         insert into edu_verifications (user_id, email, code_hash, expires_at, verified_at)
         values ('${b}', '${box}', 'x', now() + interval '1 hour', now());
         return new;
       end $$`,
    );
    await sql(
      `create trigger ${fn} before update of verified_at on edu_verifications for each row
       when (old.verified_at is null and new.verified_at is not null and new.user_id = '${a}') execute function ${fn}()`,
    );
    try {
      expect(await confirmEduVerification(db, SECRET, a, lastCode(box), now())).toBe('taken');
    } finally {
      await sql(`drop trigger ${fn} on edu_verifications`);
      await sql(`drop function ${fn}()`);
    }
    // The whole transaction rolled back: b's row from the racing writer too, a is not verified, no role.
    expect(await claimOf(box)).toBeUndefined();
    const rows = await db.select().from(schema.eduVerifications).where(eq(schema.eduVerifications.userId, a));
    expect(rows.every((r) => r.verifiedAt === null)).toBe(true);
    expect(await hasStudentRole(a)).toBe(false);
    const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, a));
    expect(profile?.eduVerified ?? false).toBe(false);
    expect(await audits(a, 'edu.taken')).toBe(1);
  });

  it('recognises the trigger error and nothing else', async () => {
    const b = await user();
    const c = await user();
    const box = mailbox();
    await verifiedRow(b, box);
    expect((await claimOf(box))?.userId).toBe(b);
    const err = await verifiedRow(c, box.replace('@', '+x@')).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).not.toBeNull();
    expect(isEduClaimConflict(err)).toBe(true);
    // The database error names no address (Drizzle's wrapper adds the query parameters; it is never logged here).
    const dbError = ((err as { cause?: unknown }).cause ?? err) as { message?: string; code?: string };
    expect(dbError.code).toBe('23505');
    expect(String(dbError.message)).not.toContain(box.split('@')[0]);
    // Another unique violation (users e-mail) is not mistaken for it.
    const [dup] = (await sql('select email from users where id = $1', [b])) as { email: string }[];
    const other = await db
      .insert(schema.users)
      .values({ email: dup?.email ?? '' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(other).not.toBeNull();
    expect(isEduClaimConflict(other)).toBe(false);
    expect(isEduClaimConflict(new Error('x'))).toBe(false);
    expect(isEduClaimConflict(undefined)).toBe(false);
  });

  it.skipIf(backend.name !== 'postgres')(
    'two connections: a confirmation racing an uncommitted claim waits on the key and ends taken',
    async () => {
      const a = await user();
      const b = await user();
      const box = mailbox();
      expect(await startEduVerification(db, mailer, SECRET, a, box, now())).toBe('sent');
      if (!pool) throw new Error('no pool');
      const server = pool;
      const holder = await server.connect();
      try {
        await holder.query('begin');
        await holder.query(
          `insert into edu_verifications (user_id, email, code_hash, expires_at, verified_at)
           values ($1, $2, 'x', now() + interval '1 hour', now())`,
          [b, box],
        );
        // a's check sees no committed claim; its update then waits on b's uncommitted edu_claims key.
        const pending = confirmEduVerification(db, SECRET, a, lastCode(box), now());
        const deadline = Date.now() + 10_000;
        for (;;) {
          const r = await server.query<{ n: number }>(
            `select count(*)::int as n from pg_stat_activity
             where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
          );
          if ((r.rows[0]?.n ?? 0) > 0) break;
          if (Date.now() > deadline) throw new Error('confirmation never waited on the claim');
          await new Promise((res) => setTimeout(res, 50));
        }
        await holder.query('commit');
        expect(await pending).toBe('taken');
      } finally {
        holder.release();
      }
      expect((await claimOf(box))?.userId).toBe(b);
      expect(await hasStudentRole(a)).toBe(false);
    },
    30_000,
  );
});
