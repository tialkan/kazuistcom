/**
 * Central sanitizer for logged errors (plan 14.7, CLAUDE.md "Güvenlik"). Drizzle puts the SQL text and every
 * bound parameter (e-mail addresses, edu.tr mailboxes, tokens) in the error message; Postgres puts row values
 * in message and detail ("Key (email)=(...) already exists"). None of that may reach a log line, so a logged
 * error carries only its class name and, from the error or its cause chain, the SQLSTATE code and the
 * constraint, table and column identifiers. Messages, detail, hint, where, query and params are never read.
 */
export interface SafeErrorFields {
  error: string;
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
const IDENT = /^[a-z_][a-z0-9_$]{0,62}$/i;

function pick(value: unknown, pattern: RegExp): string | undefined {
  return typeof value === 'string' && pattern.test(value) ? value : undefined;
}

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

/** One structured error line: fixed context fields plus the sanitized error. */
export function logError(
  at: string,
  err: unknown,
  extra: Record<string, string | number | boolean> = {},
): void {
  console.error(JSON.stringify({ at, level: 'error', ...extra, ...safeErrorFields(err) }));
}

/**
 * A Better Auth log message is free text that may carry a raw database message (its router logs e.message for
 * "column", "relation" and "table" errors) or an e-mail. It is kept only when it reads like a fixed sentence:
 * short, one line, letters, spaces and light punctuation, no digits, quotes, "@" or the word query.
 */
function safeMessage(message: unknown): string | undefined {
  if (typeof message !== 'string') return undefined;
  if (!/^[A-Za-z][A-Za-z ._:,()-]{0,79}$/.test(message)) return undefined;
  if (/query|params|key \(/i.test(message)) return undefined;
  return message;
}

type BetterAuthLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Better Auth `logger.log`: warn and error only, as one JSON line with a vetted message and the first error
 * argument sanitized; other arguments (contexts, request data) are dropped.
 */
export function betterAuthLog(level: BetterAuthLevel, message: string, ...args: unknown[]): void {
  if (level !== 'warn' && level !== 'error') return;
  const err = args.find((a) => a instanceof Error || (a && typeof a === 'object' && 'code' in a));
  const line = JSON.stringify({
    at: 'better-auth',
    level,
    message: safeMessage(message) ?? 'redacted',
    ...(err ? safeErrorFields(err) : {}),
  });
  if (level === 'error') console.error(line);
  else console.warn(line);
}
