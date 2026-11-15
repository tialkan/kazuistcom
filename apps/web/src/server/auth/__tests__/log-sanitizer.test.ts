import { format } from 'node:util';
import { safeErrorFields } from '@kazuist/log';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { internalError } from '../guard.ts';
import { authHandler, eduStart, meGet, takedownPost } from '../handlers.ts';
import { betterAuthLog } from '../log.ts';
import { schema } from '../db.ts';
import { api, authReq, createHarness, signUp, type Harness } from './harness.ts';

/**
 * Drizzle error messages carry the SQL text and the bound parameters (e-mail addresses, edu.tr mailboxes). No
 * server log line may contain them: every console channel is captured while a query carrying a known address
 * fails, and the captured output is searched for it.
 */
let h: Harness;
let out: string[] = [];
const body = async (r: Response) => JSON.parse(await r.text());

beforeAll(async () => {
  h = await createHarness();
  // Each trigger fails the insert and puts the address in the Postgres message too.
  await h.pg.exec(`
    create function test_refuse_users() returns trigger language plpgsql as $$
    begin
      if new.email like 'patlat%' then raise exception 'refused user %', new.email; end if;
      return new;
    end $$;
    create trigger test_refuse_users before insert on users for each row execute function test_refuse_users();
    create function test_refuse_edu() returns trigger language plpgsql as $$
    begin raise exception 'refused edu %', new.email; end $$;
    create trigger test_refuse_edu before insert on edu_verifications for each row execute function test_refuse_edu();
    create function test_refuse_takedown() returns trigger language plpgsql as $$
    begin raise exception 'refused takedown %', new.contact_email; end $$;
    create trigger test_refuse_takedown before insert on takedown_requests
      for each row execute function test_refuse_takedown();
  `);
}, 60_000);
afterAll(async () => {
  await h.pg.close();
});

beforeEach(() => {
  out = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      out.push(format(...args));
    });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const logged = () => out.join('\n');

describe('safeErrorFields', () => {
  it('keeps SQLSTATE, constraint and table of a Drizzle error and drops its message', async () => {
    const email = 'cift-kayit@example.invalid';
    await h.db.insert(schema.users).values({ email, name: 'A' });
    const err = await h.db
      .insert(schema.users)
      .values({ email, name: 'B' })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    // The raw error does carry the address; that is what the sanitizer is for.
    expect(format(err)).toContain(email);
    const fields = safeErrorFields(err);
    expect(JSON.stringify(fields)).not.toContain(email);
    expect(fields).toMatchObject({ code: '23505', table: 'users' });
    expect(fields.constraint).toMatch(/^users_/);
  });

  it('ignores identifiers that are not identifiers and non-errors', () => {
    const fake = Object.assign(new Error('x@example.invalid'), {
      name: 'Bad name x@example.invalid',
      code: '23505',
      constraint: 'Key (email)=(x@example.invalid)',
      table: 'users',
    });
    expect(safeErrorFields(fake)).toEqual({ error: 'Error', code: '23505', table: 'users' });
    expect(safeErrorFields('x@example.invalid')).toEqual({ error: 'Unknown' });
  });

  it('betterAuthLog drops free text messages that may carry query data', () => {
    betterAuthLog('error', 'Failed query: insert into "users" ... params: x@example.invalid');
    betterAuthLog('error', 'relation "users" does not exist');
    betterAuthLog('warn', 'Something happened');
    betterAuthLog('info', 'user x@example.invalid signed in');
    expect(logged()).not.toContain('x@example.invalid');
    expect(out.map((l) => JSON.parse(l).message)).toEqual(['redacted', 'redacted', 'Something happened']);
  });
});

describe('no server log path writes a raw database error', () => {
  it('Better Auth sign up whose user insert fails', async () => {
    const email = 'patlat-kayit@example.invalid';
    const res = await authHandler(
      authReq('/sign-up/email', { email, password: 'parola-cok-gizli-1', name: 'A' }),
    );
    expect(res.status).toBe(422);
    expect(out.length).toBeGreaterThan(0);
    expect(logged()).toContain('better-auth');
    expect(logged()).not.toContain(email);
    expect(logged()).not.toContain('patlat');
  });

  it('Better Auth sign in code request for a refused address', async () => {
    const email = 'patlat-kod@example.invalid';
    await authHandler(authReq('/sign-in/email-otp', { email, otp: '123456' }));
    await authHandler(authReq('/email-otp/send-verification-otp', { email, type: 'sign-in' }));
    expect(logged()).not.toContain(email);
  });

  it('edu verification start whose insert fails', async () => {
    const { token } = await signUp('edu-log@example.invalid');
    expect((await meGet(api('/v1/me', token))).status).toBe(200);
    out = [];
    const edu = 'gizli.ogrenci@ogr.example.edu.tr';
    const res = await eduStart(
      api('/v1/me/edu-verification', token, { method: 'POST', body: JSON.stringify({ email: edu }) }),
    );
    expect(res.status).toBe(500);
    expect((await body(res)).requestId).toBeTruthy();
    const line = out.map((l) => JSON.parse(l)).find((l) => l.at === 'api');
    expect(line).toMatchObject({ level: 'error', path: '/api/v1/me/edu-verification', code: 'P0001' });
    expect(logged()).not.toContain('gizli.ogrenci');
    expect(logged()).not.toContain('refused');
  });

  it('public takedown request whose insert fails', async () => {
    const contact = 'kaldirma-gizli@example.invalid';
    const rec = (
      await h.pg.query<{ id: string }>(
        `insert into records (type, title, authority_class, license_basis, source_url, source_key, fetched_at, text)
         values ('karar', 'Ornek', 'emsal', 'FSEK m.31', 'https://example.invalid/k/l', 'test:log:1', now(), 'metin')
         returning id`,
      )
    ).rows[0]?.id as string;
    const res = await takedownPost(
      api('/v1/takedown-requests', null, {
        method: 'POST',
        body: JSON.stringify({
          kind: 'kisisel_veri',
          targetType: 'record',
          targetId: rec,
          reason: 'Adim geciyor',
          contactEmail: contact,
        }),
      }),
    );
    expect(res.status).toBe(500);
    expect(out.length).toBeGreaterThan(0);
    expect(logged()).not.toContain(contact);
  });

  it('internalError on an error whose message and detail carry an address', () => {
    const err = Object.assign(new Error('Failed query: select 1\nparams: x@example.invalid'), {
      cause: Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: 'edu_claims_pkey',
        table: 'edu_claims',
        detail: 'Key (email)=(x@example.invalid) already exists.',
      }),
    });
    expect(internalError(new Request('http://localhost/api/v1/me'), err).status).toBe(500);
    expect(logged()).not.toContain('x@example.invalid');
    expect(JSON.parse(out[0] ?? '{}')).toMatchObject({
      code: '23505',
      constraint: 'edu_claims_pkey',
      table: 'edu_claims',
    });
  });
});
