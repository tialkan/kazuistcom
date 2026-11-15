/**
 * Server log lines for every Kazuist Node process (ADR-0039; plan 14.7; CLAUDE.md "Güvenlik"). Server code under
 * apps/web/src, apps/worker-node/src and packages/{name}/src writes logs only through this module; ESLint forbids
 * `console` there (eslint.config.mjs).
 *
 * Why: Drizzle puts the SQL text and every bound parameter (e-mail addresses, edu.tr mailboxes, tokens) in the
 * error message; Postgres puts row values in message and detail ("Key (email)=(...) already exists"); Better Auth
 * and provider SDKs log raw errors. None of that may reach a log line. So a logged error carries only its class
 * name and, from the error or its cause chain, the SQLSTATE code and the constraint, table and column identifiers.
 * Messages, detail, hint, where, query, params and stacks are never read.
 *
 * Fields are primitives (or short arrays of them) by type, so an Error or a request body cannot be passed as a
 * field; at run time anything else is dropped, strings are capped and e-mail shaped substrings are masked.
 */

/** What a logged error may say about itself. A type alias, not an interface, so it spreads into LogFields. */
export type SafeErrorFields = {
  error: string;
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
};

export type LogValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type LogFields = { readonly [key: string]: LogValue };
export type LogLevel = 'info' | 'warn' | 'error';

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const IDENT = /^[a-z_][a-z0-9_$]{0,62}$/i;
const KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const EMAIL = /[^\s@"'<>()[\]{},;:]+@[^\s@"'<>()[\]{},;:]+/g;
const MAX_STRING = 256;
const MAX_ARRAY = 32;

function pick(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

/**
 * Class name of the error plus, from the first object in its cause chain (depth 5) that has a SQLSTATE code,
 * that code and its constraint, table and column identifiers. Values that do not look like identifiers are left
 * out, so a constraint field carrying "Key (email)=(...)" never passes.
 */
export function safeErrorFields(err: unknown): SafeErrorFields {
  const name = err && typeof err === 'object' ? pick((err as { name?: unknown }).name, NAME) : undefined;
  const out: SafeErrorFields = { error: err instanceof Error ? (name ?? 'Error') : 'Unknown' };
  let e: unknown = err;
  for (let depth = 0; depth < 5 && e && typeof e === 'object'; depth++) {
    const c = e as {
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
      column?: unknown;
      cause?: unknown;
    };
    const code = pick(c.code, SQLSTATE);
    if (code) {
      out.code = code;
      const constraint = pick(c.constraint, IDENT);
      const table = pick(c.table, IDENT);
      const column = pick(c.column, IDENT);
      if (constraint) out.constraint = constraint;
      if (table) out.table = table;
      if (column) out.column = column;
      break;
    }
    e = c.cause;
  }
  return out;
}

function cleanString(s: string): string {
  return (s.length > MAX_STRING ? s.slice(0, MAX_STRING) : s).replace(EMAIL, 'redacted');
}

/** Run time guard behind the types: primitives only, capped strings, masked e-mail shapes, plain keys. */
function clean(fields: LogFields): Record<string, string | number | boolean | null | (string | number)[]> {
  const out: Record<string, string | number | boolean | null | (string | number)[]> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!KEY.test(k)) continue;
    if (typeof v === 'string') out[k] = cleanString(v);
    else if ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || v === null)
      out[k] = v;
    else if (Array.isArray(v))
      out[k] = v
        .slice(0, MAX_ARRAY)
        .filter((x): x is string | number => typeof x === 'string' || typeof x === 'number')
        .map((x) => (typeof x === 'string' ? cleanString(x) : x));
    // undefined, objects (an Error forced past the types), functions and symbols are dropped.
  }
  return out;
}

/** `head` keys first and not overridable by `fields`. */
function withHead(head: LogFields, fields: LogFields): LogFields {
  const out: Record<string, LogValue> = { ...head };
  for (const [k, v] of Object.entries(fields)) if (!(k in head)) out[k] = v;
  return out;
}

/** The single writer: one JSON line; error and warn go to stderr, info to stdout. */
export function writeLog(level: LogLevel, fields: LogFields): void {
  const line = JSON.stringify(clean(fields));
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** Web line shape: `{ at, level, ...fields }`; `at` names the place in code. */
export function logEvent(level: LogLevel, at: string, fields: LogFields = {}): void {
  writeLog(level, withHead({ at, level }, fields));
}

/** An error at `at` with fixed context fields; the error contributes only safeErrorFields. */
export function logError(at: string, err: unknown, fields: LogFields = {}): void {
  logEvent('error', at, { ...fields, ...safeErrorFields(err) });
}

/** Same as logError at warn level (an expected failure such as an unavailable dependency). */
export function logWarn(at: string, err: unknown, fields: LogFields = {}): void {
  logEvent('warn', at, { ...fields, ...safeErrorFields(err) });
}

/**
 * Unexpected error in a request handler: method, path without the query string, a fresh requestId and the
 * sanitized error. Returns the requestId so the response can carry it.
 */
export function logRequestError(at: string, req: Request, err: unknown, fields: LogFields = {}): string {
  const requestId = crypto.randomUUID();
  logError(at, err, { method: req.method, path: new URL(req.url).pathname, requestId, ...fields });
  return requestId;
}

/** Worker line shape shared with services/worker-py: `{ at: ISO time, svc, msg, ...fields }` on stdout. */
export type ServiceLog = (msg: string, fields?: LogFields) => void;

export function serviceLog(svc: string, now: () => Date = () => new Date()): ServiceLog {
  return (msg, fields = {}) => writeLog('info', withHead({ at: now().toISOString(), svc, msg }, fields));
}
