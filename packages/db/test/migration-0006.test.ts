import { randomUUID } from 'node:crypto';
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
let pg: PGlite;
let folder: string;
let user: string;
let actor: string;
let wallet: string;
let product: string;
let legacy: string;
const one = async <T>(q: string, v: unknown[] = []) => (await pg.query<T>(q, v)).rows[0] as T;
async function purchase() {
  const id = randomUUID();
  await pg.query(
    "insert into orders(id,user_id,product_id,amount_kurus,idempotency_key,consent_versions,status) values($1,$2,$3,101,$1::uuid::text,'{}','odendi')",
    [id, user, product],
  );
  await pg.query(
    "insert into payments(order_id,provider,provider_payment_id,amount_kurus,status) values($1,'iyzico',$1::uuid::text,101,'basarili')",
    [id],
  );
  await pg.query(
    "insert into credit_lots(wallet_id,source,original_credits,remaining_credits,origin_ref) values($1,'paket',3,2,$2)",
    [wallet, `order:${id}`],
  );
  return id;
}
async function request() {
  return (
    await one<{ id: string }>(
      "insert into refund_requests(user_id,reason) values($1,'hesap_silme:2_kredi') returning id",
      [user],
    )
  ).id;
}
async function decide(id: string, status = 'onaylandi') {
  await pg.query(
    "update refund_requests set status=$2,amount_kurus=68,decided_by=$3,decided_at=now(),decision_reason='Yönetici incelemesi tamamlandı',decision_key=$1::uuid::text,decision_hash=$4 where id=$1",
    [id, status, actor, 'a'.repeat(64)],
  );
}
async function item(requestId: string, orderId: string, amount = 68) {
  const id = randomUUID();
  await pg.query(
    `insert into refund_request_items(id,request_id,order_id,original_paid_kurus,original_credits,unused_credits,approved_amount_kurus,hold_operation_id,provider_refund_ref,updated_by,state_reason)
    values($1,$2,$3,101,3,2,$4,$5,$6,$7,'Onay anındaki hak donduruldu')`,
    [id, requestId, orderId, amount, `hold:${id}`, `silme:${id}`, actor],
  );
  return id;
}
async function setup() {
  const order = await purchase();
  const req = await request();
  await decide(req);
  return { order, req };
}
async function state(id: string, s: string) {
  await pg.query(
    "update refund_request_items set state=$2,updated_by=$3,state_reason='Sağlayıcı sonucu doğrulandı',updated_at=now() where id=$1",
    [id, s, actor],
  );
}
async function refund(order: string, ref: string, amount: number, status = 'basarili') {
  await pg.query(
    "insert into payments(order_id,provider,provider_payment_id,kind,refund_ref,amount_kurus,status) values($1,'iyzico',$1::uuid::text,'iade',$2,$3,$4)",
    [order, ref, amount, status],
  );
}
beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'kazuist-v13-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const path = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(path, 'utf8')) as { entries: { tag: string }[] };
  journal.entries = journal.entries.filter((e) => e.tag < '0006');
  writeFileSync(path, JSON.stringify(journal));
  pg = await PGlite.create({ extensions: { vector, pg_trgm } });
  await migrate(drizzle(pg), { migrationsFolder: folder });
  user = (await one<{ id: string }>("insert into users(email) values('refund@example.invalid') returning id"))
    .id;
  actor = (
    await one<{ id: string }>("insert into users(email) values('reviewer@example.invalid') returning id")
  ).id;
  wallet = (await one<{ id: string }>('insert into wallets(user_id) values($1) returning id', [user])).id;
  const price = (
    await one<{ id: string }>(
      "insert into price_tables(version,effective_from,operations) values('refund-v1',now(),'{}') returning id",
    )
  ).id;
  product = (
    await one<{ id: string }>(
      "insert into products(code,kind,price_table_id,price_kurus,credits) values('kredi.3','paket',$1,101,3) returning id",
      [price],
    )
  ).id;
  legacy = await request();
  await migrate(drizzle(pg), { migrationsFolder });
  await migrate(drizzle(pg), { migrationsFolder });
}, 60_000);
afterAll(async () => {
  await pg.close();
  rmSync(folder, { recursive: true, force: true });
});

describe('migration 0006 on a populated v1.3 database', () => {
  it('preserves the legacy request and foreign keys without inventing a decision', async () => {
    expect(
      await one(
        'select user_id,decision_reason,decision_key,decision_hash,status from refund_requests where id=$1',
        [legacy],
      ),
    ).toEqual({
      user_id: user,
      decision_reason: null,
      decision_key: null,
      decision_hash: null,
      status: 'bekliyor',
    });
    expect(
      (
        await one<{ convalidated: boolean }>(
          "select convalidated from pg_constraint where conname='refund_requests_decision'",
        )
      ).convalidated,
    ).toBe(false);
  });
  it('requires a complete decision and prevents switching or rewriting a rejection', async () => {
    const req = await request();
    await expect(
      pg.query(
        "update refund_requests set decision_reason='Yeterli gerekçe metni',decided_by=$2,decided_at=now(),status='onaylandi' where id=$1",
        [req, actor],
      ),
    ).rejects.toThrow(/decision/);
    await decide(req, 'reddedildi');
    await expect(
      pg.query("update refund_requests set status='onaylandi' where id=$1", [req]),
    ).rejects.toThrow(/transition/);
    await expect(
      pg.query("update refund_requests set decision_reason='Farklı gerekçe metni' where id=$1", [req]),
    ).rejects.toThrow(/immutable/);
    await expect(pg.query('delete from refund_requests where id=$1', [req])).rejects.toThrow(/immutable/);
  });
  it('accepts the consumer-favourable ceiling of original paid value and rejects an arbitrary increase', async () => {
    const { req, order } = await setup();
    await expect(item(req, order, 69)).rejects.toThrow(/original refundable/);
    await expect(item(req, order, 67)).rejects.toThrow(/original refundable/);
    const id = await item(req, order, 68);
    expect(
      (
        await one<{ approved_amount_kurus: number }>(
          'select approved_amount_kurus from refund_request_items where id=$1',
          [id],
        )
      ).approved_amount_kurus,
    ).toBe(68);
    await expect(
      pg.query('update refund_request_items set unused_credits=3 where id=$1', [id]),
    ).rejects.toThrow(/immutable/);
  });
  it('caps exposure from both uncertain provider refunds and other frozen allocations', async () => {
    const a = await setup();
    await refund(a.order, `other:${randomUUID()}`, 34, 'bekliyor');
    await expect(item(a.req, a.order, 68)).rejects.toThrow(/original refundable/);
    await item(a.req, a.order, 67);
    const second = await request();
    await decide(second);
    await expect(item(second, a.order, 1)).rejects.toThrow(/original refundable/);
  });
  it('checks real payment and original package evidence and rejects cross-owner allocation', async () => {
    const a = await setup();
    const stranger = (
      await one<{ id: string }>(
        "insert into users(email) values('other-refund@example.invalid') returning id",
      )
    ).id;
    await pg.query('update orders set user_id=$2 where id=$1', [a.order, stranger]);
    await expect(item(a.req, a.order)).rejects.toThrow(/ownership/);
    const b = await setup();
    await pg.query("update payments set status='basarisiz' where order_id=$1", [b.order]);
    await expect(item(b.req, b.order)).rejects.toThrow(/original refundable/);
  });
  it('keeps unknown outcomes pending and requires successful payment evidence for terminal success', async () => {
    const a = await setup();
    const id = await item(a.req, a.order);
    await expect(state(id, 'basarili')).rejects.toThrow(/transition/);
    await state(id, 'bekliyor');
    await expect(state(id, 'basarili')).rejects.toThrow(/evidence missing/);
    await expect(
      pg.query("update refund_requests set status='tamamlandi' where id=$1", [a.req]),
    ).rejects.toThrow(/unresolved/);
    await state(id, 'basarisiz');
    await state(id, 'bekliyor');
    await refund(a.order, `silme:${id}`, 68);
    await state(id, 'basarili');
    await pg.query("update refund_requests set status='tamamlandi' where id=$1", [a.req]);
    await expect(state(id, 'basarisiz')).rejects.toThrow(/approved|terminal/);
  });
  it('writes actor and reason to immutable audits without storing raw provider data', async () => {
    const a = await setup();
    const id = await item(a.req, a.order);
    await state(id, 'bekliyor');
    await pg.query(
      "update refund_request_items set state='basarisiz',updated_by=$2,state_reason='Panelden olumsuz sonuç doğrulandı',resolved_by=$2,resolved_at=now(),resolution_reason='Panelde iade olmadığı doğrulandı' where id=$1",
      [id, actor],
    );
    const audit = await one<{ actor_id: string; reason: string; diff: { state: string } }>(
      "select actor_id,reason,diff from audit_log where subject_id=$1 and diff->>'state'='basarisiz' limit 1",
      [id],
    );
    expect(audit.actor_id).toBe(actor);
    expect(audit.reason).toBe('Panelden olumsuz sonuç doğrulandı');
    expect(audit.diff.state).toBe('basarisiz');
    await expect(pg.query("update audit_log set reason='changed' where subject_id=$1", [id])).rejects.toThrow(
      /append only/,
    );
    await expect(pg.query('delete from refund_request_items where id=$1', [id])).rejects.toThrow(/immutable/);
  });
  it('does not complete an aggregate request with one successful and one unknown item', async () => {
    const a = await setup();
    const secondOrder = await purchase();
    const first = await item(a.req, a.order);
    const second = await item(a.req, secondOrder);
    await state(first, 'bekliyor');
    await refund(a.order, `silme:${first}`, 68);
    await state(first, 'basarili');
    await state(second, 'bekliyor');
    await expect(
      pg.query("update refund_requests set status='tamamlandi' where id=$1", [a.req]),
    ).rejects.toThrow(/unresolved/);
  });
});
