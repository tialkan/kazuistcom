import pg from 'pg';
import { createConsumer } from './queue.ts';

/** Worker entry point. Module owners register handlers in Wave 1 and later (billing, notify, kalemcik). */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url });
const consumer = createConsumer(pool, `worker-node-${process.pid}`, {});
console.log(`worker-node started, channels: ${consumer.channels().join(', ') || 'none'}`);
