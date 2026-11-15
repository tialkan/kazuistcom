import { logEvent, safeErrorFields } from '@kazuist/log';

/**
 * Better Auth's logger, routed through the shared sanitizer (@kazuist/log, ADR-0039). The sanitizer itself
 * (safeErrorFields, logError) moved to packages/log so every server module and worker uses the same rule.
 *
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
  logEvent(level, 'better-auth', {
    message: safeMessage(message) ?? 'redacted',
    ...(err ? safeErrorFields(err) : {}),
  });
}
