import pg from 'pg';
import { billingDepsFromEnv } from './billing/deps.ts';
import { buildHandlers, dailyBillingTick, unavailableBilling } from './handlers.ts';
import {
  apnsTransport,
  iysUnavailable,
  smtpTransport,
  vapidTransport,
  type NotifyDeps,
} from './notify/index.ts';
import { createConsumer } from './queue.ts';
import { pgListen, startWorker } from './runner.ts';

/**
 * worker-node entry point (production: node dist/main.js after `pnpm build`; development: pnpm dev).
 * Registers notify.send and the billing jobs, listens on their channels and stops cleanly on SIGTERM.
 * Logs are JSON lines without personal data or connection strings.
 */
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), svc: 'worker-node', msg, ...extra }));

const env = process.env;
const url = env.DATABASE_URL;
if (!url) {
  log('DATABASE_URL is not set');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 5 });
pool.on('error', (err) => log('pool error', { error: err.name }));

function notifyDeps(): NotifyDeps | undefined {
  if (!env.APP_URL) {
    log('notify.send disabled: APP_URL is not set');
    return undefined;
  }
  return {
    db: pool,
    appUrl: env.APP_URL,
    iys: iysUnavailable,
    email: env.MAIL_SMTP_URL ? smtpTransport(env.MAIL_SMTP_URL, env.MAIL_FROM || undefined) : undefined,
    webPush:
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
        ? vapidTransport({
            subject: env.VAPID_SUBJECT,
            publicKey: env.VAPID_PUBLIC_KEY,
            privateKey: env.VAPID_PRIVATE_KEY,
          })
        : undefined,
    apns:
      env.APNS_PRIVATE_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_BUNDLE_ID
        ? apnsTransport({
            keyPem: env.APNS_PRIVATE_KEY.replace(/\\n/g, '\n'),
            keyId: env.APNS_KEY_ID,
            teamId: env.APNS_TEAM_ID,
            bundleId: env.APNS_BUNDLE_ID,
          })
        : undefined,
  };
}

// Billing runs against odeme's Postgres billing store when iyzico and auth secrets are set; otherwise the
// jobs fail closed (BillingStoreUnavailable) and the daily schedule stays off.
const realBilling = await billingDepsFromEnv(pool);
if (!realBilling) log('billing disabled: iyzico or auth secret not set');
const billing = realBilling ?? unavailableBilling;
// account.purge needs the same secret as the web side so the audit hash matches.
const purge = env.BETTER_AUTH_SECRET ? { db: pool, secret: env.BETTER_AUTH_SECRET } : undefined;
if (!purge) log('account.purge disabled: BETTER_AUTH_SECRET is not set');
const handlers = buildHandlers({ notify: notifyDeps(), billing, purge });
const consumer = createConsumer(pool, `worker-node-${process.pid}`, handlers);
const worker = startWorker({
  db: pool,
  consumer,
  listen: pgListen(pool),
  tick: billing === unavailableBilling ? undefined : dailyBillingTick(pool),
  log,
});
log('started', { types: consumer.types });
worker.done.catch((err: unknown) => {
  // LISTEN could not be set up (database unreachable at start): exit so the platform restarts the worker.
  log('worker failed', { error: err instanceof Error ? err.name : 'Error' });
  process.exit(1);
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log('stopping', { signal });
  const force = setTimeout(() => process.exit(1), 30_000);
  force.unref();
  await worker.stop();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
