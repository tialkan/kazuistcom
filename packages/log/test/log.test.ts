import { format } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logError,
  logEvent,
  logRequestError,
  logWarn,
  safeErrorFields,
  serviceLog,
  writeLog,
  type LogFields,
} from '../src/index.ts';

const lines: { channel: string; text: string }[] = [];

beforeEach(() => {
  lines.length = 0;
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const)
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      lines.push({ channel: m, text: format(...args) });
    });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const parsed = () => lines.map((l) => JSON.parse(l.text) as Record<string, unknown>);
const all = () => lines.map((l) => l.text).join('\n');

/** The shape node-postgres gives a unique violation, wrapped the way Drizzle wraps it. */
function drizzleUniqueViolation(email: string): Error {
  const pgError = Object.assign(
    new Error(`duplicate key value violates unique constraint "users_email_unique"`),
    {
      name: 'error',
      code: '23505',
      constraint: 'users_email_unique',
      table: 'users',
      detail: `Key (email)=(${email}) already exists.`,
      schema: 'public',
    },
  );
  return Object.assign(
    new Error(`Failed query: insert into "users" ("email") values ($1)\nparams: ${email}`, {
      cause: pgError,
    }),
    { name: 'DrizzleQueryError', query: 'insert into "users" ("email") values ($1)', params: [email] },
  );
}

describe('safeErrorFields', () => {
  it('keeps the class name and the SQLSTATE, constraint and table from the cause chain', () => {
    const err = drizzleUniqueViolation('cift@example.invalid');
    expect(format(err)).toContain('cift@example.invalid');
    expect(safeErrorFields(err)).toEqual({
      error: 'DrizzleQueryError',
      code: '23505',
      constraint: 'users_email_unique',
      table: 'users',
    });
  });

  it('drops values that are not identifiers, and non errors', () => {
    const fake = Object.assign(new Error('x@example.invalid'), {
      name: 'Bad name x@example.invalid',
      code: '23505',
      constraint: 'Key (email)=(x@example.invalid)',
      table: 'users',
      column: 'email; drop',
    });
    expect(safeErrorFields(fake)).toEqual({ error: 'Error', code: '23505', table: 'users' });
    expect(safeErrorFields('x@example.invalid')).toEqual({ error: 'Unknown' });
    expect(safeErrorFields({ code: 'ECONNREFUSED' })).toEqual({ error: 'Unknown' });
    expect(safeErrorFields(null)).toEqual({ error: 'Unknown' });
  });

  it('stops after five causes', () => {
    let e: Error = Object.assign(new Error('deep'), { code: '40001' });
    for (let i = 0; i < 5; i++) e = new Error('wrap', { cause: e });
    expect(safeErrorFields(e)).toEqual({ error: 'Error' });
  });
});

describe('writers', () => {
  it('logError writes one JSON line on stderr without message, detail, query or params', () => {
    logError('api', drizzleUniqueViolation('gizli@example.invalid'), { route: 'me' });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.channel).toBe('error');
    expect(parsed()[0]).toEqual({
      at: 'api',
      level: 'error',
      route: 'me',
      error: 'DrizzleQueryError',
      code: '23505',
      constraint: 'users_email_unique',
      table: 'users',
    });
    expect(all()).not.toMatch(/gizli|Failed query|already exists|insert into/);
  });

  it('logWarn goes to the warn channel; logEvent keeps at and level from being overridden', () => {
    logWarn('docxcheck', new TypeError('fetch failed for x@example.invalid'));
    logEvent('info', 'gecit', { at: 'baska', level: 'error', n: 3 });
    expect(lines.map((l) => l.channel)).toEqual(['warn', 'log']);
    expect(parsed()).toEqual([
      { at: 'docxcheck', level: 'warn', error: 'TypeError' },
      { at: 'gecit', level: 'info', n: 3 },
    ]);
  });

  it('fields cannot override the sanitized error fields', () => {
    logError('x', new RangeError('boom'), { error: 'x@example.invalid sizdi' });
    expect(parsed()[0]).toMatchObject({ error: 'RangeError' });
  });

  it('logRequestError logs method, path without query and a requestId it returns', () => {
    const req = new Request('https://kazuist.local/api/v1/me?email=gizli@example.invalid', {
      method: 'POST',
    });
    const id = logRequestError('casuist', req, drizzleUniqueViolation('gizli@example.invalid'));
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed()[0]).toMatchObject({
      at: 'casuist',
      level: 'error',
      method: 'POST',
      path: '/api/v1/me',
      requestId: id,
      code: '23505',
    });
    expect(all()).not.toContain('gizli');
  });

  it('serviceLog keeps the worker line shape on stdout', () => {
    const log = serviceLog('worker-node', () => new Date('2026-11-15T10:00:00.000Z'));
    log('tick failed', { ...safeErrorFields(new Error('x')), svc: 'baska' });
    expect(lines[0]?.channel).toBe('log');
    expect(parsed()[0]).toEqual({
      at: '2026-11-15T10:00:00.000Z',
      svc: 'worker-node',
      msg: 'tick failed',
      error: 'Error',
    });
  });
});

describe('run time guard behind the types', () => {
  it('drops objects forced past the types, masks e-mail shapes, caps strings and arrays', () => {
    const forced = {
      err: new Error('x@example.invalid'),
      body: { email: 'x@example.invalid' },
      fn: () => 'x',
      note: 'kullanici x.y+z@ogr.example.edu.tr bekliyor',
      long: 'a'.repeat(1000),
      list: ['a@b.example', 1, { x: 1 }, ...Array.from({ length: 50 }, (_, i) => `k${i}`)],
      'bad key x@example.invalid': 'v',
      nan: Number.NaN,
      ok: true,
      none: null,
      skip: undefined,
    } as unknown as LogFields;
    writeLog('info', forced);
    const line = parsed()[0] ?? {};
    expect(Object.keys(line).sort()).toEqual(['list', 'long', 'none', 'note', 'ok']);
    expect(line.note).toBe('kullanici redacted bekliyor');
    expect((line.long as string).length).toBe(256);
    expect((line.list as unknown[])[0]).toBe('redacted');
    expect((line.list as unknown[]).length).toBeLessThanOrEqual(32);
    expect(all()).not.toContain('example.invalid');
  });

  it('an Error is not a field by type', () => {
    // @ts-expect-error An Error object is not a LogValue.
    logEvent('error', 'x', { err: new Error('x') });
    expect(parsed()[0]).toEqual({ at: 'x', level: 'error' });
  });
});
